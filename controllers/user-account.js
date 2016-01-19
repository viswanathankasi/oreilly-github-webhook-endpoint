'use strict';

var express = require('express');
var fs      = require('fs');
var GitHub  = require('github');

var router = new express.Router();
router.get('/authorize', requestGitHubAuthorization);

var credentials = {};
var github = new GitHub({
  version: '3.0.0',
  headers: { 'User-Agent': 'OReilly-GitHub-Training-DemoServer/1.0' },
  timeout: 5000
});
loadCredentials();

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

  console.log('GitHub App credentials properly loaded.  Checking them…');
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
  });
}

function requestGitHubAuthorization(req, res) {
  // FIXME
}

module.exports = {
  router: router
};
