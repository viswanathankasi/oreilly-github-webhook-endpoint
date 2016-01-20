// Helper: Signature verification
// ==============================

// Because we [secure our webhook](https://developer.github.com/webhooks/securing/),
// we need to compare the [HMAC-SHA1](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code)
// signature of an incoming webhook event request with the signature we computed
// locally for this request's payload, and make sure they match.
//
// In order to really score security points, we want to make sure we compare
// signature buffers **in constant time**, to prevent
// [timing attacks](https://en.wikipedia.org/wiki/Timing_attack).  This is a small
// module to do exactly that

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea
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
