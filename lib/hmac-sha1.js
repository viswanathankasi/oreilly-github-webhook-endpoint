'use strict';

var crypto = require('crypto');

// Default export is a function to compute a stream's HMAC-SHA1 using a given key.
// Parameters:
//
// - `stream`: a *readable stream* whose content is going to be digested.
// - `key`: a `String` or `Buffer` containing the key to prime the HMAC.
// - `callback`: the error-first callback that will receive the HMAC-SHA1 signature.
module.exports = function hmacSha1(stream, key, callback) {
  var signer = crypto.createHmac('SHA1', key, { encoding: 'hex' });
  var result = '';
  stream.pipe(signer);
  signer.on('readable', function() { result += signer.read() || ''; });
  signer.on('end',      function() { callback(null, result); });
  signer.on('error',    callback);
};
