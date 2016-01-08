'use strict';

var async           = require('async');
var getBody         = require('raw-body');
var hmacSha1        = require('./lib/hmac-sha1');
var http            = require('http');
var util            = require('util');
var verifySignature = require('./lib/verify-signature');

require('colors');

var secretToken = require('crypto').randomBytes(32).toString('hex');

// The main HTTP request/response handler
var server = http.createServer(function(req, res) {

  // 1. Do two separate processings of the request's body stream in parallel
  async.parallel([
    // 1a. Compute the HMAC-SHA1 signature of the entire body (payload)
    function(cb) { hmacSha1(req, secretToken, cb); },
    // 1b. Get the request's entire body from its stream
    function(cb) { getBody(req, { encoding: 'utf-8' }, cb); }
  ],

  // 2. Then handle the results
  function(err, results) {
    // Error?  Dang!  Send the matching response back and be done.
    if (err) {
      res.statusCode = err.status || 500;
      return res.end(err.type || 'Blam!');
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
      res.statusCode  = 403;
      return res.end('Invalid signature: denying request.');
    }

    // All dandy?  Cool, parse the JSON and display it in the console!
    var payload = JSON.parse(results[1]);
    console.log(util.inspect(payload, { colors: true }));
    // …then just reply politely.
    res.end('OK');
  });
});

// OK, so let's listen on a random available port then…
server.listen(function() {

  // …and display it so we can `ngrok http` over it
  console.log('Demo webhook endpoint listening on port'.green,
    String(server.address().port).cyan);

  // Also display this run's secret token, so we can use that to
  // (re-)configure our webhook on GitHub.
  console.log('Secret token for this run is:', secretToken.yellow);
});
