// Helper: HMAC-SHA1
// =================

// Because we [secure our webhook](https://developer.github.com/webhooks/securing/),
// we need to be able to compute the [HMAC-SHA1](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code)
// signature of an incoming stream (an HTTP request's body stream, in fact) with a
// given key (the secret token defined for the webhook).  This is a small module to do that.
// It intentionally uses pipes not to preclude other, parallel consumptions of the
// source stream.

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea
'use strict'

// We just need Node’s built-in crypto module for this.
var crypto = require('crypto')

// Default export is a function to compute a stream's HMAC-SHA1 using a given key.
// Parameters:
//
// - `stream`: a *readable stream* whose content is going to be digested.
// - `key`: a `String` or `Buffer` containing the key to prime the HMAC.
// - `callback`: the error-first callback that will receive the HMAC-SHA1 signature.
module.exports = function hmacSha1 (stream, key, callback) {
  var signer = crypto.createHmac('SHA1', key, { encoding: 'hex' })
  var result = ''
  stream.pipe(signer)
  signer.on('readable', function () { result += signer.read() || '' })
  signer.on('end', function () { callback(null, result) })
  signer.on('error', callback)
}
