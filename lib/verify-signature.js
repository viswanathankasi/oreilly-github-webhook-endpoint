'use strict'

var secureCompare = require('buffer-equal-constant-time')

// Default export is a function to extract GitHub’s webhook signature from
// a passed request and securely compare it (that is, in constant time, to
// prevent timing attacks) against the expect signature.
//
// Parameters:
//
// - `request`: an `http.IncomingMessage` with the proper header (`X-Hub-Signature`).
// - `expected`: the expected HMAC-SHA1 signature, without the `sha1=` GitHub prepends.
//
// Returns a boolean.
module.exports = function verifySignature (request, expected) {
  var sentSignature = request.headers['x-hub-signature'] || ''
  return secureCompare(new Buffer(sentSignature), new Buffer('sha1=' + expected))
}
