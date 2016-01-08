'use strict';

var secureCompare = require('buffer-equal-constant-time');

module.exports = function verifySignature(request, expected) {
  var sentSignature = request.headers['x-hub-signature'] || '';
  return secureCompare(new Buffer(sentSignature), new Buffer('sha1=' + expected));
};
