'use strict';

var http    = require('http');
var getBody = require('raw-body');

require('colors');

// The main HTTP request/response handler
var server = http.createServer(function(req, res) {

  // 1. Get the request's entire body from its stream
  getBody(req, { encoding: 'utf-8' }, function(err, text) {
    // Error?  Dang!  Send the matching response back and be done.
    if (err) {
      res.statusCode = err.status;
      return res.end(err.type);
    }

    // All dandy?  Cool, parse the JSON and display it in the console!
    console.log(JSON.parse(text));
    // …then just reply politely.
    res.end('OK');
  });
});

// OK, so let's listen on a random available port then…
server.listen(function() {
  // …and display it so we can `ngrok http` over it
  console.log('Demo webhook endpoint listening on port'.green,
    String(server.address().port).cyan);
});
