'use strict';

var crypto = require('crypto');

module.exports = function hmacSha1(stream, key, callback) {
  var signer = crypto.createHmac('SHA1', key, { encoding: 'hex' });
  var result = '';
  stream.pipe(signer);
  signer.on('readable', function() { result += signer.read() || ''; });
  signer.on('end',      function() { callback(null, result); });
  signer.on('error',    callback);
};
