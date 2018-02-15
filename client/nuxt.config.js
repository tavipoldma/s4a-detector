module.exports = {
  /*
   ** Headers of the page
   */
    head: {
        title: 'Detector Interface',
        meta: [
            { charset: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            { hid: 'description', name: 'description', content: 'Detector Interface' }
        ],
        link: [
            { rel: 'icon', type: 'image/x-icon', href: '/favicon.png' },
            { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css?family=Roboto:300,400,500,700|Material+Icons' }
        ]
    },
  /*
   ** Customize the progress-bar color
   */
    loading: {color: '#77b6ff', height: '5px'},
  /*
   ** Build configuration
   */
    build: {
        vendor: ['vuetify', 'vue-moment', 'vue-i18n']
    },
    plugins: ['~/plugins/vuetify.js', '~/plugins/moment.js', '~/plugins/axios.js', '~/plugins/i18n.js'],
    css: [
        { src: '~/assets/style/app.styl', lang: 'styl' }
    ],
    modules: [
        '@nuxtjs/axios',
    ],
    axios: {
		baseURL: process.env.API_URL || '____API_URL_ERROR____CHECK_ENV____',
		browserBaseURL: process.env.API_URL_BROWSER || '____API_URL_BROWSER_ERROR____CHECK_ENV____'
    },
    router: {
        middleware: 'setup'
    }
}