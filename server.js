'use strict';

var http = require('http');
var getBody = require('raw-body');
require('colors');

var server = http.createServer(function(req, res) {
  getBody(req, { encoding: 'utf-8' }, function(err, text) {
    if (err) {
      return res.head(err.status).end(err.type);
    }

    console.log(JSON.parse(text));
    res.end('OK');
  });
});

server.listen(function() {
  console.log('Demo webhook endpoint listening on port'.green,
    String(server.address().port).cyan);
});
