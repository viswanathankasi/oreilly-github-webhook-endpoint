'use strict';

var express = require('express');
var getPort = require('getport');
var http    = require('http');
var webHook = require('./controllers/webhook');

var DEFAULT_PORT = 45678;

require('colors');

var app = require('express')();
var server = http.createServer(app);

app.use(webHook.router);

getPort(DEFAULT_PORT, function(err, port) {
  if (err) {
    console.error('Could not start server:', err);
    process.exit(1);
    return;
  }

  // OK, so let's listen on a random available port then…
  server.listen(port, function() {

    // …and display it so we can `ngrok http` over it
    console.log('Demo service listening on port'.green,
      String(server.address().port).cyan);
    if (DEFAULT_PORT !== port) {
      console.log('/!\\ Beware!  This is not the intended port (%d): update your app registration.'.red, DEFAULT_PORT);
    }

    webHook.initLog();

    console.log('\nJust hit Ctrl+C to stop this server.\n'.gray);
  });
});
