'use strict'

var ciService = require('../lib/ci-service')
var express = require('express')
var findNgrokURL = require('../lib/ngrok-session')
var gitHubBridge = require('../lib/github-bridge')

var router = new express.Router()

router.get('/webhook/setup', renderRepoListForSetup)
router.post('/webhook/setup', setupWebhook)
router.post('/webhook', handleWebhookEvent)

var localPort

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

var ACCEPTABLE_PR_ACTIONS = ['opened', 'synchronize']

function handleWebhookEvent (req, res) {
  gitHubBridge.loadAndVerifyWebhookEventPayload(req, res, function (err, result) {
    if (!err) {
      res.end('OK')
      if (result.eventType === 'pull_request' &&
          ACCEPTABLE_PR_ACTIONS.indexOf(result.payload.action) !== -1) {
        process.nextTick(function () {
          ciService.handleEvent(result.payload)
        })
      }
    }
  })
}

function renderRepoListForSetup (req, res) {
  findNgrokURL(localPort, function (_, ngrokURL) {
    // if an error is passed, it just means no ngrok is running, ignore it.

    gitHubBridge.getRepositories(function (err, repos) {
      if (err) {
        res.status(503).end(err)
        return
      }

      if (ngrokURL) {
        ngrokURL += '/webhook'
      }
      res.render('setup-webhook', { repos: repos, ngrok_url: ngrokURL })
    })
  })
}

function setupWebhook (req, res) {
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
