'use strict';
const shelljs = require('shelljs');
const hell = new (require(__dirname + "/helper.js"))({module_name: "network_interface"});

module.exports = function (network_interfaces) {

  /**
   * INTERFACE TOGGLE
   *
   * enable / disable network interface in settings page
   *
   * @param name
   * @param enabled
   * @param options
   * @param cb
   */
  network_interfaces.applyChanges = function (interfaces, options, cb) {
    hell.o("start", "applyChanges", "info");
    hell.o(interfaces, "applyChanges", "info");

    (async function () {
      try {

        let inter, update_input, update_result, components_to_restart, salt_result, debug = false;

        for (let i = 0, l = interfaces.length; i < l; i++) {

          inter = await network_interfaces.findOne({where: {name: interfaces[i].name}});

          if (!inter) throw new Error("no_data_found");

          update_input = {enabled: interfaces[i].enabled};
          update_result = await network_interfaces.update({name: inter.name}, update_input);

          if (!update_result) throw new Error("save_failed");
        }

        hell.o("need to restart network sensitive components", "applyChanges", "info");
        components_to_restart = await network_interfaces.app.models.component.find(
          {where: {network_interface_changes: true, installed: true}}
        );
        hell.o(components_to_restart, "applyChanges", "info");

        if (!components_to_restart) throw new Error("network_interfaces_no_interfaces_enabled");

        /*
        if dev, do not apply real salt calls
        */
        if (process.env.NODE_ENV == "dev") {
          debug = true;
        }

        for (let i = 0, l = components_to_restart.length; i < l; i++) {
          hell.o(["going to restart components_to_restart ", components_to_restart[i].name], "applyChanges", "info");
          salt_result = await network_interfaces.app.models.component.stateApply(components_to_restart[i].name, "restart", debug);
          if (!salt_result) throw new Error("network_interfaces_failed_to_restart_components");
        }

        cb(null, {message: "ok"});

      } catch (err) {
        hell.o(err, "applyChanges", "error");
        cb(null, {name: "", status: 400, message: err});
      }

    })(); // async
  };

  network_interfaces.remoteMethod('applyChanges', {
    accepts: [
      {arg: "interfaces", type: "array", required: true},
      {arg: "options", type: "object", http: "optionsFromRequest"}
    ],
    returns: {type: 'object', root: true},
    http: {path: '/applyChanges', verb: 'post', status: 200}
  });


  /**
   * LIST NETWORK INTERFACES
   *
   * result is generated by a shell script
   *
   * @param options
   * @param cb
   */
  network_interfaces.list = function (options, cb) {
    hell.o("start", "list", "info");

    (async function () {
      try {

        let interfaces_result = await shelljs.exec("./scripts/ls_if.sh");
        let new_lines = interfaces_result.stdout.split(/\n/);

        new_lines = new_lines.filter(function (n) {
          return n != ""
        }); //toss empty rows
        new_lines = new_lines.filter(function (n) {
          return n != undefined
        }); //toss empty rows

        let test_json, output = [], net_interface, update_result;
        for (const nl of new_lines) {
          try {
            test_json = JSON.parse(nl);
            test_json.error = false;
            test_json.enabled = false;

            [net_interface] = await network_interfaces.findOrCreate({where: {name: test_json.name}}, test_json);

            if (net_interface.state != test_json.state) {
              hell.o([ "update interface", net_interface.name, "set state: ", test_json.state ], "list", "info");
              update_result = await network_interfaces.update({name: net_interface.name}, {state: test_json.state});
            }
            if (net_interface.ip != test_json.ip) {
              hell.o([ "update interface", net_interface.name, "set ip: ", test_json.ip ], "list", "info");
              update_result = await network_interfaces.update({name: net_interface.name}, {ip: test_json.ip});
            }

          } catch (err) {
            hell.o("invalid interface", "list", "warning");
          }
        } //for

        output = await network_interfaces.find();
        hell.o(output, "list", "info");

        cb(null, output);

      } catch (err) {
        hell.o(err, "list", "error");
        cb({name: "Error", status: 400, err});
      }

    })();
  };

  network_interfaces.remoteMethod('list', {
    accepts: [
      {arg: "options", type: "object", http: "optionsFromRequest"}
    ],
    returns: {type: 'object', root: true},
    http: {path: '/list', verb: 'get', status: 200}
  });

  /**
   * LIST NETWORK INTERFACES FOR SALT
   *
   * custom format
   *
   * @param options
   * @param cb
   */
  network_interfaces.listForSalt = function (options, cb) {
    hell.o("start", "listForSalt", "info");

    (async function () {
      try {

        let output = {interfaces: ""};
        let net_interfaces = await network_interfaces.find({where: {enabled: true}, fields: ["name"]});
        if (!net_interfaces) return cb(null, output);

        let tmp = [];
        for (let i = 0, l = net_interfaces.length; i < l; i++) {
          tmp.push(net_interfaces[i].name);
        }

        output.interfaces = tmp;

        hell.o(["done", output ], "listForSalt", "info");
        cb(null, output);

      } catch (err) {
        hell.o(err, "listForSalt", "error");
        cb({name: "Error", status: 400, message: err});
      }

    })();
  };

  network_interfaces.remoteMethod('listForSalt', {
    accepts: [
      {arg: "options", type: "object", http: "optionsFromRequest"}
    ],
    returns: {type: 'object', root: true},
    http: {path: '/listForSalt', verb: 'get', status: 200}
  });


};