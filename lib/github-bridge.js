'use strict';

var async           = require('async');
var getBody         = require('raw-body');
var GitHub          = require('github');
var hmacSha1        = require('../lib/hmac-sha1');
var qs              = require('querystring');
var request         = require('superagent');
var util            = require('util');
var verifySignature = require('../lib/verify-signature');

var REQUESTED_SCOPES = 'repo';
var SECRET_TOKEN     = require('crypto').randomBytes(32).toString('hex');

var credentials = {
  rootURL: '<to be configured>'
};
var github = new GitHub({
  version: '3.0.0',
  headers: { 'User-Agent': 'OReilly-GitHub-Training-DemoServer/1.0' },
  timeout: 5000
});
loadCredentials();

function checkToken(callback) {
  var url = 'https://api.github.com/applications/' + credentials.clientId +
    '/tokens/' + credentials.accessToken;
  request
    .get(url)
    .auth(credentials.clientId, credentials.clientSecret)
    .end(function(err, saResponse) {
      var hasError = err || saResponse.body.error;
      var error = hasError ? String(err || saResponse.body.error_description) : null;

      if (!hasError) {
        console.log('==== TOKEN CHECK RESPONSE ===='.green);
        console.log(util.inspect(saResponse.body, { colors: true }));
      }

      callback(error);
    });
}

function createHook(params, callback) {
  var repo = params.nwo.split('/');
  var payload = {
    user: repo[0],
    repo: repo[1],
    name: 'web',
    config: {
      url: params.url,
      content_type: 'json',
      secret: SECRET_TOKEN
    },
    events: ['pull_request'],
    active: true
  };
  github.repos.createHook(payload, callback);
}

function configure(options) {
  credentials.callbackURL = options.rootURL + '/oauth/callback';
}

function exchangeAuthCodeForToken(authCode, callback) {
  request
    .post('https://github.com/login/oauth/access_token')
    .send({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: authCode,
    })
    .end(function(err, saResponse) {
      var hasError = err || saResponse.body.error;
      var error = hasError ? String(err || saResponse.body.error_description) : null;

      if (!hasError) {
        credentials.accessToken = saResponse.body.access_token;
        github.authenticate({
          type:  'oauth',
          token: credentials.accessToken
        });
        console.log('\\o/ Got our access token:'.green, credentials.accessToken.cyan);
        console.log('    (normalized scopes: %s)'.gray, saResponse.body.scope);

        console.log('==== TOKEN CHECK RESPONSE ===='.green);
        console.log(util.inspect(saResponse.body, { colors: true }));
      }

      callback(error);
    });
}

function getAuthorizationURL() {
  return 'https://github.com/login/oauth/authorize?' + qs.stringify({
    client_id:    credentials.clientId,
    redirect_uri: credentials.callbackURL,
    scope:        REQUESTED_SCOPES
  });
}

function getRepositories(callback) {
  github.repos.getAll({ per_page: 100 }, callback);
}

function getReviewURL() {
  return 'https://github.com/settings/connections/applications/' +
    credentials.clientId;
}

function isAuthenticated() {
  return !!credentials.accessToken;
}

function loadAndVerifyWebhookEventPayload(req, res, callback) {
  async.parallel([
    // 1a. Compute the HMAC-SHA1 signature of the entire body (payload)
    function(cb) { hmacSha1(req, SECRET_TOKEN, cb); },
    // 1b. Get the request's entire body from its stream
    function(cb) { getBody(req, { encoding: 'utf-8' }, cb); }
  ],

  // 2. Then handle the results
  function(err, results) {
    // Error?  Dang!  Send the matching response back and be done.
    if (err) {
      res.status(err.status || 500).end(err.type || 'Blam!');
      return callback(err.status || 500);
    }

    // Display a delivery/event heading in the console (type and UUID)
    var eventType = req.headers['x-github-event'];
    var deliveryId = req.headers['x-github-delivery'];
    console.log('===== %s (%s) ====='.yellow, eventType, deliveryId);

    // Verify signature based on secret token.
    // Deny with 403 (Forbidden) if incorrect.
    var expectedSignature = results[0];
    if (!verifySignature(req, expectedSignature)) {
      console.log('Invalid signature: denying request'.red);
      res.status(403).end('Invalid signature: denying request.');
      return callback(403);
    }

    // Send the JSON payload back
    try {
      var payload = JSON.parse(result[1]);
      callabck(null, payload);
    } catch (e) {
      callback(e);
    }
  });
}

function loadCredentials() {
  var productionMode = 'production' === process.env.NODE_ENV;
  if (!productionMode) {
    require('dotenv').load({ silent: true });
  }

  credentials.clientId     = (process.env.CLIENT_ID     || '').trim();
  credentials.clientSecret = (process.env.CLIENT_SECRET || '').trim();
  credentials.accessToken  = (process.env.ACCESS_TOKEN  || '').trim();

  if (!credentials.clientId || !credentials.clientSecret) {
    console.error('/!\\ Missing GitHub app credentials in the environment.'.red);
    console.error('    Make sure the environment has valid CLIENT_ID and CLIENT_SECRET variables'.red);
    if (!productionMode) {
      console.error('    (you can put these in a non-versioned .env file at the root of this project)'.gray);
    }
    process.exit();
  }

  console.log('GitHub App credentials properly loaded.  Checking them…'.green);
  github.authenticate({
    type:   'oauth',
    key:    credentials.clientId,
    secret: credentials.clientSecret
  });
  github.misc.rateLimit({}, function(err, data) {
    if (err) {
      console.error('/!\\ Error when verifying GitHub App credentials'.red, err);
      process.exit();
    }

    if (data.resources.core.limit <= 60) {
      console.error('/!\\ GitHub App credentials seem to fail authentication.'.red);
      process.exit();
    }
    console.log('\\o/ GitHub App credentials seem to successfully authenticate.'.green);
    if (credentials.accessToken) {
      github.authenticate({ type: 'oauth', token: credentials.accessToken });
      console.log('Using stored access token'.green, credentials.accessToken.cyan);
    }
  });
}

module.exports = {
  checkToken: checkToken,
  configure: configure,
  createHook: createHook,
  getRepositories: getRepositories,
  getReviewURL: getReviewURL,
  isAuthenticated: isAuthenticated,
  loadAndVerifyWebhookEventPayload: loadAndVerifyWebhookEventPayload,
  SECRET_TOKEN: SECRET_TOKEN
};
