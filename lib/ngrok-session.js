'use strict';

var request = require('superagent');

var ngrokSessions = {};

function getRunningNgrokSession(localPort, callback) {
  if (ngrokSessions[localPort]) {
    process.nextTick(callback, null, ngrokSessions[localPort]);
    return;
  }

  request
    .get('http://localhost:4040/api/tunnels')
    .end(function(err, res) {
      if (err) {
        return callback(err);
      }

      res.body.tunnels.some(function(tunnel) {
        var found =
          tunnel.config.addr === 'localhost:' + localPort &&
          tunnel.proto === 'https';
        if (found) {
          ngrokSessions[localPort] = tunnel.public_url;
          callback(null, tunnel.public_url);
        }
        return found;
      });
    });
}

module.exports = getRunningNgrokSession;
