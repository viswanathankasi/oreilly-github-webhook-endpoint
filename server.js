// Server Entry Point
// ==================

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea
'use strict'

// A number of our own modules rely on `String` extensions by the `colors` module,
// so we make sure it's loaded as early as possible.
require('colors')

// Modules we need in this file
// ----------------------------

// This loads both third-party (from [npm](http://npmjs.com/)) and local stuff (paths starting with `./`).

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

// App & Server Setup
// ------------------

// The port we'd prefer to run on.
var DEFAULT_PORT = 45678

// Initialize a web server app skeleton and wrap an HTTP server around it
var app = express()
var server = http.createServer(app)

// Make the view rendering engine explicit ([Jade](http://jade-lang.com/))
app.set('view engine', 'jade')

// Middleware configuration
// ------------------------

// Properly interpret fields in incoming web forms.
app.use(bodyParser.urlencoded({ extended: true }))
// Log incoming requests on the console, in a terse format.
app.use(morgan('dev'))
// Maintain sessions for clients across HTTP requests, storing
// session data in their cookies, with a tamper-proof signature.
app.use(cookieSession({ secret: 'GitHub’s API rulez!' }))
// Provide flash-message functionality (messages that persist across
// a [Post-Redirect-Get](https://en.wikipedia.org/wiki/Post/Redirect/Get) flow).
app.use(flash())

// Custom middleware to expose the flash messages to all views, by
// making them available in `res.locals` on every request/response.
app.use(function (req, res, next) {
  res.locals.flash = req.flash()
  next()
})

// Register business routes for every part of the app.
app.use(webHook.router)
app.use(userAccount.router)

// Server Launch
// -------------

// We request an available local port to listen onto, starting
// with our preferred one, `DEFAULT_PORT`.  But we may get something
// higher if that port is already in use.
getPort(DEFAULT_PORT, function (err, port) {
  // An error still?  OK, let's bail out.
  if (err) {
    console.error('Could not start server:', err)
    // Exit code zero usually means "all is fine", but non-zero exit
    // codes will yield a very verbose output from the server on
    // its console, and we don't want to scare users, that are not
    // expected to be proficient at Node, into thinking they did something
    // terrible.  So zero it is.
    process.exit(0)
  }

  // OK, so let's listen on whatever available port we got then…
  server.listen(port, function () {
    var rootURL = 'http://localhost:' + server.address().port

    // …and display it, just FYI.
    console.log('Demo service listening on'.green, (rootURL + '/').cyan)
    // Also, if it's not our preferred port, we might need to re-register
    // the hook, so let's say so, in case our user does read the console output
    // ;-)
    if (DEFAULT_PORT !== port) {
      console.log('/!\\ Beware! This is not the intended port (%d): update your app registration.'.red, DEFAULT_PORT)
    }

    // Final-phase configuration for the GitHub API bridge and the WebHook
    // controller (they need to know our root URL to properly setup various
    // stuff of their own).
    gitHubBridge.configure({ rootURL: rootURL })
    webHook.configure({ rootURL: rootURL })

    // Our users might have no clue that Ctrl+C is the normal way to stop
    // a running process, so let's tell them. :-D
    console.log('\nJust hit Ctrl+C to stop this server.\n'.gray)
  })
})
