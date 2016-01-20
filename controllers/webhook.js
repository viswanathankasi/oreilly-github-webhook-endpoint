// Webhook Management and Endpoint
// ===============================

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea
'use strict'

// Modules we need in this file
// ----------------------------

// This loads both third-party (from [npm](http://npmjs.com/)) and local stuff (paths starting with `../`).

var ciService = require('../lib/ci-service')
var express = require('express')
var findNgrokURL = require('../lib/ngrok-session')
var gitHubBridge = require('../lib/github-bridge')

// Routes provided by this "controller"
// ------------------------------------

var router = new express.Router()
router.get('/webhook/setup', renderRepoListForSetup)
router.post('/webhook/setup', setupWebhook)
router.post('/webhook', handleWebhookEvent)

// Configuration
// -------------

// We need to know which local HTTP port we're listening on,
// mostly to assert that [ngrok](https://ngrok.com/) is running and get our
// web-facing HTTPS URL through it.
var localPort

// This is called by the main server file, with our actual, local
// HTTP root URL, including the network port. We mostly log useful
// startup info on the console, for informational purposes, and verify
// whether ngrok is running, and which public HTTPS URL it maps onto
// our own, local server.
function configure (options) {
  console.log('Webhook secret token for this run is'.green,
    gitHubBridge.SECRET_TOKEN.cyan)

  localPort = options.rootURL.split(':')[2]
  findNgrokURL(localPort, function (_, ngrokURL) {
    if (ngrokURL) {
      console.log('\\o/ You have a running ngrok session for our port:'.green, ngrokURL.cyan)
    } else {
      var cmd = 'ngrok http ' + localPort
      console.log('[!] Don’t forget to launch an ngrok session:'.yellow, cmd.cyan)
    }
  })
}

// Webhook endpoint
// ----------------

// Which [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
// actions we're interested in: first open and later pushes.
var ACCEPTABLE_PR_ACTIONS = ['opened', 'synchronize']

function handleWebhookEvent (req, res) {
  // We delegate to the GitHub API bridge the entire task
  // of verifying that the incoming request is properly signed with
  // our secret token (thereby authenticating the request), and
  // parsing the JSON payload for it when it's approved.
  gitHubBridge.loadAndVerifyWebhookEventPayload(req, res, function (err, result) {
    // If invalid, the bridge already set up the response, we don't need to
    // do anything more.
    if (err) {
      return;
    }

    res.end('OK')
    // Is this a webhook event we're interested in?  If so, delegate to the
    // CI service core…
    if (result.eventType === 'pull_request' &&
        ACCEPTABLE_PR_ACTIONS.indexOf(result.payload.action) !== -1) {
      // …but do that asynchronously, so we can guarantee an extremely fast
      // response to GitHub.
      process.nextTick(function () {
        ciService.handleEvent(result.payload)
      })
    }
  })
}

// Webhook Setup Screen
// --------------------

// To set up a webhook, we need to select a repo to latch it onto,
// and to provide the public HTTPS URL that maps to our local demo server.
function renderRepoListForSetup (req, res) {
  // If ngrok is launched already, we can auto-detect the public HTTPS URL.
  // If it's not, the end-user will have to launch it and manually fill the
  // mandatory field for it.
  findNgrokURL(localPort, function (_, ngrokURL) {
    // if an error is passed, it just means no ngrok is running, so we ignore
    // it (using `_` as an identifier conveys this to the linter).

    gitHubBridge.getRepositories(function (err, repos) {
      if (err) {
        res.status(503).end(err)
        return
      }

      if (ngrokURL) {
        // Our webhook URL sits on a subpath.
        ngrokURL += '/webhook'
      }
      res.render('setup-webhook', { repos: repos, ngrok_url: ngrokURL })
    })
  })
}

// Webhook Setup form processing
// -----------------------------

function setupWebhook (req, res) {
  // We just delegate the hook creation to the GitHub API bridge.
  gitHubBridge.createHook({
    nwo: req.body.nwo,
    url: req.body.ngrok_url
  }, function (err, data) {
    if (err) {
      res.status(503).end(err)
      return
    }

    req.flash('success', 'Your webhook was set up!')
    res.redirect('/')
  })
}

module.exports = {
  configure: configure,
  router: router
}
