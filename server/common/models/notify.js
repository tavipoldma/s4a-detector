'use strict';
const elasticsearch = require('elasticsearch');
const nodemailer = require('nodemailer');
const hell = new (require(__dirname + "/helper.js"))({module_name: "notify"});

module.exports = function (notify) {

  /**
   * INITIALIZE NOTIFY
   *
   * init elastic client
   *
   * @param input
   * @param cb
   */
  notify.initialize = function (cb) {
    hell.o("start", "initialize", "info");

    (async () => {
      try {
        hell.o("check/init notifications", "init", "info");

        //
        // seed database if nothing defined
        //
        let notifications = false;
        try {
          notifications = await notify.find();
        } catch (no_notifications) {
          hell.o("no notifications found", "check notifications", "info");
        }

        if (!notifications || notifications === undefined || notifications.length == 0 || notifications == "") {
          hell.o("count: " + notifications.length, "check notifications", "info")

          // Example alerts
          let input_data = [
            {
              name: "Diff aggregation 1 to root",
              query: {
                "size": 0,
                "query": {"bool": {"must": [{"range": {"timestamp": {"gt": "now-30m"}}}]}},
                "aggs": {
                  "notify": {
                    "date_histogram": {"field": "@timestamp", "interval": "30m"},
                    "aggs": {
                      "count_me": {"value_count": {"field": "@timestamp"}},
                      "diff": {"serial_diff": {"buckets_path": "count_me"}},
                      "treshold": {
                        "bucket_selector": {
                          "buckets_path": {"alarms_count": "count_me.value"},
                          "script": "params.alarms_count > 100"
                        }
                      }
                    }
                  }
                }
              },
              email: "root@localhost",
              subject: "Diff aggregation 1 to root",
              enabled: false
            },
            {
              name: "Count Aggregation to postmaster",
              query: {
                "size": 0,
                "query": {"bool": {"must": [{"range": {"timestamp": {"gt": "now-60m"}}}]}},
                "aggs": {
                  "notify": {
                    "date_histogram": {"field": "@timestamp", "interval": "30m"},
                    "aggs": {
                      "treshold": {
                        "bucket_selector": {
                          "buckets_path": {"alarms_count": "_count"},
                          "script": "params.alarms_count > 100"
                        }
                      }
                    }
                  }
                }
              },
              email: "postmaster@localhost",
              subject: "Count Aggregation to postmaster",
              enabled: false
            }
          ];

          let create_result = await notify.create(input_data);
        }

        //
        // Initialize elasticsearch connection
        //
        hell.o("check elastic", "initialize", "info");

        let elastic_check = await notify.app.models.component.findOne({where: {name: "elastic", status: true}});
        if (!elastic_check) throw new Error("elastic component status failed");

        notify.es_client = new elasticsearch.Client({
          host: 'localhost:9200',
          //log: 'trace'
        });

        hell.o("elastic client ok", "initialize", "info");

        let settings = await notify.app.models.settings.findOne();

        //
        // Initialize mailer
        //
        hell.o("init nodemailer", "initialize", "info");
        let smtp_config = {
          host: settings['smtp_server_host'],
          port: settings['smtp_server_port'],
          secure: settings['smtp_server_tls'],
          ignoreTLS: settings['smtp_server_force_notls'],
          authMethod: settings['smtp_server_auth_method'],
          auth: {
            user: settings['smtp_server_username'],
            pass: settings['smtp_server_password']
          }
        };
        notify.nm_client = new nodemailer.createTransport(smtp_config);

        hell.o("nodemailer client ok", "initialize", "info");

        cb(null, {message: "ok"});
      } catch (err) {
        hell.o(err, "initialize", "error");
        cb({name: "Error", status: 400, message: err});
      }

    })(); // async

  };

  /**
   * GET ALERTS FROM ELASTIC SEARCH
   *
   * @param input
   * @returns {Promise}
   */
  notify.checkAlerts = function (input) {
    hell.o("start", "checkAlerts", "info");

    return new Promise((success, reject) => {

      (async () => {

        let elastic_check = await notify.app.models.component.findOne({where: {name: "elastic", status: true}});
        if (!elastic_check) {
          hell.o("elastic status failed", "checkAlerts", "info");
          reject("elastic component status failed");
          return;
        }

        let entry_ptr = input.alerts_pointer;
        hell.o("pointer " + entry_ptr, "checkAlerts", "info");

        let elastic_params = {index: "*", body: {}};

        let settings = await notify.app.models.settings.findOne();

        if (entry_ptr === undefined || entry_ptr == "empty") {
          hell.o("alerts pointer empty, go back one month", "checkAlerts", "info");
          let d = new Date();
          d.setMonth(d.getMonth() - 1);
          entry_ptr = d.toISOString();
          hell.o("alerts pointer now" + entry_ptr, "checkAlerts", "info");
        }

        // elastic_params.body = JSON.parse(input.query);
        elastic_params.body = input.query;
        // hell.o(JSON.stringify(elastic_params), "checkAlerts", "info");

        // Assume there might be query present
        if (!elastic_params.body.query.bool || !elastic_params.body.query.bool.must) {
          elastic_params.body.query.bool = {"must": []}
        } else if (!Array.isArray(elastic_params.body.query.bool.must)) {
          elastic_params.body.query.bool.must = [elastic_params.body.query.bool.must];
        }

        // testing
        elastic_params.body.query.bool.must.push({"term": {"event_type": "alert"}});
        // only results we haven't notified yet
        elastic_params.body.query.bool.must.push({"range": {"timestamp": {"gt": "" + entry_ptr}}});

        if (!elastic_params.body.size) {
          elastic_params.body.size = 100;
        }

        hell.o("elastic call", "checkAlerts", "info");
        hell.o(JSON.stringify(elastic_params), "checkAlerts", "info");

        notify.es_client.search(elastic_params).then(function (body) {
          hell.o("elastic result", "checkAlerts", "info");
          hell.o(JSON.stringify(body), "checkAlerts", "info");

          let hits = body.hits.hits;
          let aggregations = body.aggregations;
          let result = {};
          let counter = 0;

          // hell.o(hits, "checkAlerts", "info");
          for (var id = 0, l = hits.length; id < l; id++) {
            result = hits[id]._source;
            if (result['timestamp'] !== undefined && Date.parse(result['timestamp'])) { //if date format
              entry_ptr = result['timestamp'];
              counter++;
            }
          }

          // Aggregation match assumes that aggregation result is filtered
          // and alarm is triggered by result array presence
          let aggregation_match = false;
          if (aggregations) {
            // Ignore aggregation name, just care about count
            Object.keys(aggregations).forEach(function (key) {
              if (aggregations[key].buckets.length)
                aggregation_match = true;
            });
          }

          if (counter == 0) hits = [];

          hell.o("done: " + counter, "checkAlerts", "info");
          success({alerts_pointer: entry_ptr, alerts: hits, aggregation_match: aggregation_match});

        }).catch(function (e) {
          hell.o(e, "checkAlerts", "error");
          reject(e);

        }, function (error) {
          hell.o(error, "checkAlerts", "error");
          reject(error);

        }); //elastic call

      })();//async

    }); //promise

  };


  /**
   * TOGGLE NOTIFIER
   *
   * @param name
   * @param enabled
   * @param cb
   */
  notify.toggleEnable = function (notify_name, enabled, cb) {
    hell.o(["start " + notify_name, "enabled " + enabled], "toggleEnable", "info");

    (async function () {
      try {

        let notify_found = await notify.find({where: {name: notify_name}});
        if (!notify_found) throw new Error(notify_name + " could not find notify");

        let update_input = {enabled: enabled, last_modified: new Date()};
        let update_result = await notify.update({name: notify_name}, update_input);
        if (!update_result) throw new Error(notify_name + " could not update notify ");

        if (enabled) {
          //TODO
        }

        if (!enabled) {
          //TODO
        }

        hell.o([notify_name, update_result], "toggleEnable", "info");
        hell.o([notify_name, "done"], "toggleEnable", "info");

        cb(null, {message: "ok"});

      } catch (err) {
        hell.o(err, "toggleEnable", "error");
        cb({name: "Error", status: 400, message: err.message});
      }

    })(); // async

  };

  notify.remoteMethod('toggleEnable', {
    accepts: [
      {arg: 'name', type: 'string', required: true},
      {arg: 'enabled', type: 'boolean', required: true},
    ],
    returns: {type: 'object', root: true},
    http: {path: '/toggleEnable', verb: 'post', status: 201}
  });


  /**
   * NOTIFY ROUTINE
   *
   * check for new alarms
   * send notifications digest
   * update seen alarms pointer
   *
   * @param cb
   */
  notify.notify_routine_active = false;
  notify.notifyRoutine = function (option, cb) {
    hell.o("start", "notifyRoutine", "info");

    if (notify.notify_routine_active) {
      hell.o("is already running, busy", "notifyRoutine", "warn");
      return cb({name: "Error", status: 400, message: "worker_busy"});
    }

    notify.notify_routine_active = true;

    (async function () {
      try {

        let notifying = await notify.find({where: {"enabled": true}});
        let settings = await notify.app.models.settings.findOne();

        for (let ntfy_id = 0; ntfy_id < notifying.length; ntfy_id++) {

          hell.o("Notify #" + ntfy_id, "notifyRoutine", "info");

          hell.o("check for alerts to notify", "notifyRoutine", "info");
          // NOTE: depend on reports module alert finder
          let alerts_checked = await notify.checkAlerts(notifying[ntfy_id]);
          if (!alerts_checked) throw new Error("load_failed");

          let alert_count_to_send = alerts_checked.alerts.length;
          let aggregation_match = alerts_checked.aggregation_match;
          if (alert_count_to_send == 0 && !aggregation_match) { //nothing to send
            hell.o("done, no alerts to notify, ptr: " + notifying[ntfy_id].alerts_pointer, "notifyRoutine", "info");
            continue;
          }
          hell.o("notify alerts: " + alert_count_to_send, "notifyRoutine", "info");
          hell.o("notify aggregation match: " + aggregation_match, "notifyRoutine", "info");
          let notify_input = {alerts: alerts_checked.alerts};
          let send_notfications;

          try {
            let message_text = '';

            if (aggregation_match)
              message_text = 'Aggregation triggered alarm\n---\n\n';

            for (let i = 0, l = notify_input.alerts.length; i < l; i++) {
              let alert = notify_input.alerts[i];
              // TODO: This here is just for testing, what should be in those results?
              message_text += "category: " + alert._source.alert.category + "\n"
                + "signature: " + alert._source.alert.signature + "\n"
                + alert._source.src_ip + ":" + alert._source.src_port
                + " -> "
                + alert._source.dest_ip + ":" + alert._source.dest_port + "\n"
                + "---\n";
            }

            let message = {
              from: settings['smtp_server_from'],
              to: notifying[ntfy_id].email,
              subject: notifying[ntfy_id].subject,
              text: message_text
            }
            hell.o("subject: " + notifying[ntfy_id].subject, "notifyRoutine", "info");

            send_notfications = await notify.nm_client.sendMail(message);

            // aggregations don't have timestamp, assume "now"
            if (aggregation_match)
              alerts_checked.alerts_pointer = new Date().toISOString();

            hell.o("going to check alarm pointer: " + alerts_checked.alerts_pointer, "notifyRoutine", "info");
            if (alerts_checked.alerts_pointer !== undefined && Date.parse(alerts_checked.alerts_pointer)) { //if date format
              hell.o("update alarm pointer: " + alerts_checked.alerts_pointer, "notifyRoutine", "info");

              notify_input = {
                alerts_pointer: alerts_checked.alerts_pointer
              };

              let updated_pointer = await notify.update({id: notifying[ntfy_id].id}, notify_input);
              if (!updated_pointer) throw new Error("notify_pointer_save_failed");
            } else {
              hell.o("malformed notify alarm pointer: " + alerts_checked.alerts_pointer, "notifyRoutine", "error");
            }

          } catch (err) {
            hell.o("notify failed: " + err.message, "notifyRoutine", "error");

            let out = "Notification failed [ " + err.message + " ]";
            if (err.response && err.response.data
              && err.response.data.error && err.response.data.error.message) {
              out = err.response.data.error.message;
            }
          }
// ----
        }
        notify.notify_routine_active = false;
        hell.o("done", "notifyRoutine", "info");

        cb(null, {message: "ok"});

      } catch (err) {
        hell.o(err, "notifyRoutine", "error");
        notify.notify_routine_active = false;
        cb({name: "Error", status: 400, message: err.message});
      }

    })(); // async

  };

};