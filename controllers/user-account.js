'use strict';

var express = require('express');
var fs      = require('fs');
var GitHub  = require('github');
var qs      = require('querystring');
var request = require('superagent');
var util    = require('util');
var webhook = require('./webhook');

var router = new express.Router();
router.get('/',                   homePage);
router.get('/oauth/authorize',    requestGitHubAuthorization);
router.get('/oauth/callback',     exchangeAuthCodeForToken);
router.get('/oauth/check_token',  checkToken);

var credentials = {
  rootURL: '<to be configured>'
};
var github = new GitHub({
  version: '3.0.0',
  headers: { 'User-Agent': 'OReilly-GitHub-Training-DemoServer/1.0' },
  timeout: 5000
});
loadCredentials();

var REQUESTED_SCOPES = 'repo';

function checkToken(req, res) {
  var url = 'https://api.github.com/applications/' + credentials.clientId +
    '/tokens/' + credentials.accessToken;
  request
    .get(url)
    .auth(credentials.clientId, credentials.clientSecret)
    .end(function(err, saResponse) {
      if (err || saResponse.body.error) {
        res.status(503).end(String(err || saResponse.body.error_description));
        return;
      }

      console.log('==== TOKEN CHECK RESPONSE ===='.green);
      console.log(util.inspect(saResponse.body, { colors: true }));
      req.flash('info', 'Your OAuth token is still valid!');
      res.redirect('/');
    });
}

function configure(options) {
  credentials.callbackURL = options.rootURL + '/oauth/callback';
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
      secret: params.secretToken
    },
    events: ['pull_request'],
    active: true
  };
  github.repos.createHook(payload, callback);
}

function exchangeAuthCodeForToken(req, res) {
  var authCode = req.query.code;
  request
    .post('https://github.com/login/oauth/access_token')
    .send({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: authCode,
    })
    .end(function(err, saResponse) {
      if (err || saResponse.body.error) {
        res.status(503).end(String(err || saResponse.body.error_description));
        return;
      }

      credentials.accessToken = saResponse.body.access_token;
      github.authenticate({
        type:  'oauth',
        token: credentials.accessToken
      });
      console.log('\\o/ Got our access token:'.green, credentials.accessToken.cyan);
      console.log('    (normalized scopes: %s)'.gray, saResponse.body.scope);
      res.redirect('/');
    });
}

function getRepositories(callback) {
  github.repos.getAll({ per_page: 100 }, callback);
}

function homePage(req, res) {
  res.render('home', {
    authenticated: !!credentials.accessToken,
    hookInstalled: webhook.hookInstalled(),
    reviewPermissionsURL: 'https://github.com/settings/connections/applications/' +
      credentials.clientId
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

function requestGitHubAuthorization(req, res) {
  var url = 'https://github.com/login/oauth/authorize?' + qs.stringify({
    client_id:    credentials.clientId,
    redirect_uri: credentials.callbackURL,
    scope:        REQUESTED_SCOPES
  });
  res.redirect(url);
}

exports.configure       = configure;
exports.createHook      = createHook;
exports.getRepositories = getRepositories;
exports.router          = router;
