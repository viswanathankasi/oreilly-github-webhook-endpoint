// ngrok Session Detection
// =======================

// This demo server would usually run locally, on the machine of
// our users sitting on their LAN.  Because this server provides
// a webhook endpoint, it must be accessible from GitHub’s servers,
// ideally through a public HTTPS URL.  A wonderful little tool that
// lets us do that easily is [ngrok](https://ngrok.com/).
//
// To make things even easier on our users, we'd like our server to
// be able to detect a running ngrok instance on the machine, and
// determine the public HTTPS URL it offers over our server instance.
// This module does exactly that, thanks to ngrok's HTTP API.

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea.
'use strict'

// As always, we use `superagent` for manual outgoing HTTP requests.
var request = require('superagent')

// A hash of running ngrok sessions, per local TCP port.
// We really will only ever store a single key/value pair in
// there, based on our current local TCP port for the main HTTP
// server of this app, but I like the flexibility should we ever
// expose multiple endpoints on multiple ports.
var ngrokSessions = {}

// Public function that queries ngrok's HTTP API to detect
// a current mapping over a given local port.  If no ngrok
// is running, will return a network error like `ECONNREFUSED`.
function getRunningNgrokSession (localPort, callback) {
  // If we already have the mapping info in cache, call the
  // callback as soon as possible instead of re-computing things.
  // We dont *synchronously call* our callback to [**avoid
  // releasing Zalgo**](http://blog.izs.me/post/59142742143/designing-apis-for-asynchrony).
  if (ngrokSessions[localPort]) {
    process.nextTick(callback, null, ngrokSessions[localPort])
    return
  }

  request
    // Any running ngrok provides a web interface, usually
    // on port 4040.  It also exposes an HTTP+JSON API there.
    .get('http://localhost:4040/api/tunnels')
    .end(function (err, res) {
      if (err) {
        return callback(err)
      }

      // Look for a tunnel description that has our desired
      // local port as target, and grab the HTTPS mapping for it.
      //
      // We use `some` here instead of `forEach` to short-circuit
      // automatically once found, because superfluous iterations
      // give me skin rash.
      res.body.tunnels.some(function (tunnel) {
        var found =
          tunnel.config.addr === 'localhost:' + localPort &&
          tunnel.proto === 'https'
        if (found) {
          ngrokSessions[localPort] = tunnel.public_url
          callback(null, tunnel.public_url)
        }
        return found
      })
    })
}

module.exports = getRunningNgrokSession
