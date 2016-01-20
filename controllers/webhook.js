'use strict';

var express         = require('express');
var findNgrokURL    = require('../lib/ngrok-session');
var gitHubBridge    = require('../lib/github-bridge');

var router = new express.Router();

router.get('/webhook/setup',  renderRepoListForSetup);
router.post('/webhook/setup', setupWebhook);
router.post('/webhook',       handleWebhookEvent);

var localPort;

function configure(options) {
  console.log('Webhook secret token for this run is'.green,
    gitHubBridge.SECRET_TOKEN.cyan);

  localPort = options.rootURL.split(':')[2];
  findNgrokURL(localPort, function(err, ngrokURL) {
    if (ngrokURL) {
      console.log('\\o/ You have a running ngrok session for our port:'.green, ngrokURL.cyan);
    } else {
      var cmd = 'ngrok http ' + port;
      console.log('[!] Don’t forget to launch an ngrok session:'.yellow, cmd.cyan);
    }
  });
}

function handleWebhookEvent(req, res) {
  gitHubBridge.loadAndVerifyWebhookPayload(req, res, function(err, payload) {
    if (!err) {
      res.end('OK');
    }
  });
}

function renderRepoListForSetup(req, res) {
  findNgrokURL(localPort, function(err, ngrokURL) {
    // if `err`, it just means no ngrok is running, ignore it.

    gitHubBridge.getRepositories(function(err, repos) {
      if (err) {
        res.status(503).end(err);
        return;
      }

      if (ngrokURL) {
        ngrokURL += '/webhook';
      }
      res.render('setup-webhook', { repos: repos, ngrok_url: ngrokURL });
    });
  });
}

function setupWebhook(req, res) {
  gitHubBridge.createHook({
    nwo: req.body.nwo,
    url: req.body.ngrok_url
  }, function(err, data) {
    if (err) {
      res.status(503).end(err);
      return;
    }

    req.flash('success', 'Your webhook was set up!');
    res.redirect('/');
  });
}

module.exports = {
  configure: configure,
  router: router
};
