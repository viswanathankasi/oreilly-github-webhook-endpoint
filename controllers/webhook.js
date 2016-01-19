'use strict';

var async           = require('async');
var express         = require('express');
var getBody         = require('raw-body');
var hmacSha1        = require('../lib/hmac-sha1');
var userAccount     = require('./user-account');
var util            = require('util');
var verifySignature = require('../lib/verify-signature');

var router = new express.Router();

router.get('/webhook/setup',  renderRepoListForSetup);
router.post('/webhook/setup', setupWebhook);
router.post('/webhook',       handleWebhookEvent);

var SECRET_TOKEN = require('crypto').randomBytes(32).toString('hex');

var installedWebHookId = null, latestPingAt = null;

function handleWebhookEvent(req, res) {
  // 1. Do two separate processings of the request's body stream in parallel
  async.parallel([
    // 1a. Compute the HMAC-SHA1 signature of the entire body (payload)
    function(cb) { hmacSha1(req, SECRET_TOKEN, cb); },
    // 1b. Get the request's entire body from its stream
    function(cb) { getBody(req, { encoding: 'utf-8' }, cb); }
  ],

  // 2. Then handle the results
  function(err, results) {
    // Error?  Dang!  Send the matching response back and be done.
    if (err) {
      return res.status(err.status || 500).end(err.type || 'Blam!');
    }

    // Display a delivery/event heading in the console (type and UUID)
    var eventType = req.headers['x-github-event'];
    var deliveryId = req.headers['x-github-delivery'];
    console.log('===== %s (%s) ====='.yellow, eventType, deliveryId);

    // Verify signature based on secret token.
    // Deny with 403 (Forbidden) if incorrect.
    var expectedSignature = results[0];
    if (!verifySignature(req, expectedSignature)) {
      console.log('Invalid signature: denying request'.red);
      return res.status(403).end('Invalid signature: denying request.');
    }

    // Finally, just reply politely.
    res.end('OK');
  });
}

function initLog(rootURL) {
  // Display this run's secret token, so we can use that to
  // (re-)configure our webhook on GitHub.
  console.log('Webhook secret token for this run is'.green, SECRET_TOKEN.cyan);
  console.log('');
  var port = rootURL.split(':')[2];
  var cmd = 'ngrok http ' + port;
  console.log('[!] Don’t forget to launch an ngrok session:'.yellow, cmd.cyan);
}

function isHookInstalled() {
  return null !== installedWebHookId;
}

function renderRepoListForSetup(req, res) {
  userAccount.getRepositories(function(err, repos) {
    if (err) {
      res.status(503).end(err);
      return;
    }

    console.log(repos);
    res.render('setup-webhook', { repos: repos });
  });
}

function setupWebhook(req, res) {
  userAccount.createHook({
    nwo: req.body.nwo,
    url: req.body.ngrok_url,
    secretToken: SECRET_TOKEN
  }, function(err, data) {
    if (err) {
      res.status(503).end(err);
      return;
    }

    installedWebHookId = data.id;

    req.flash('success', 'Your webhook was set up!');
    // FIXME: pre-load hooks at startup, use update if existing
    // FIXME: refactor so github API details are outside of request handlers
    res.redirect('/');
  });
}

module.exports = {
  router: router,
  hookInstalled: isHookInstalled,
  initLog: initLog
};
