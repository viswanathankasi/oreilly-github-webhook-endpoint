'use strict'

require('colors')

var bodyParser = require('body-parser')
var cookieSession = require('cookie-session')
var express = require('express')
var flash = require('connect-flash')
var getPort = require('getport')
var gitHubBridge = require('./lib/github-bridge')
var http = require('http')
var morgan = require('morgan')
var userAccount = require('./controllers/user-account')
var webHook = require('./controllers/webhook')

var DEFAULT_PORT = 45678

var app = express()
var server = http.createServer(app)

app.set('view engine', 'jade')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(morgan('dev'))
app.use(cookieSession({ secret: 'GitHub’s API rulez!' }))
app.use(flash())

app.use(function (req, res, next) {
  res.locals.flash = req.flash()
  next()
})

app.use(webHook.router)
app.use(userAccount.router)

getPort(DEFAULT_PORT, function (err, port) {
  if (err) {
    console.error('Could not start server:', err)
    process.exit(71) // EX_OSERR sysexit
    return
  }

  // OK, so let's listen on a random available port then…
  server.listen(port, function () {
    var rootURL = 'http://localhost:' + server.address().port

    // …and display it so we can `ngrok http` over it
    console.log('Demo service listening on'.green, (rootURL + '/').cyan)
    if (DEFAULT_PORT !== port) {
      console.log('/!\\ Beware! This is not the intended port (%d): update your app registration.'.red, DEFAULT_PORT)
    }

    gitHubBridge.configure({ rootURL: rootURL })
    webHook.configure({ rootURL: rootURL })

    console.log('\nJust hit Ctrl+C to stop this server.\n'.gray)
  })
})
