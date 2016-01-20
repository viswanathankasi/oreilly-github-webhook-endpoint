'use strict';

var express      = require('express');
var gitHubBridge = require('../lib/github-bridge');

var router = new express.Router();
router.get('/',                   homePage);
router.get('/oauth/authorize',    requestGitHubAuthorization);
router.get('/oauth/callback',     exchangeAuthCodeForToken);
router.get('/oauth/check_token',  checkToken);

function checkToken(req, res) {
  gitHubBridge.checkToken(function(err) {
    if (err) {
      res.status(503).end(err);
      return;
    }

    req.flash('info', 'Your OAuth token is still valid!');
    res.redirect('/');
  });
}

function exchangeAuthCodeForToken(req, res) {
  var authCode = req.query.code;
  gitHubBridge.exchangeAuthCodeForToken(req.query.code, function(err) {
    if (err) {
      res.status(503).end(err);
      return;
    }

    req.flash('success', 'Successfully obtained your OAuth token!');
    res.redirect('/');
  });
}

function homePage(req, res) {
  res.render('home', {
    authenticated: gitHubBridge.isAuthenticated(),
    reviewPermissionsURL: gitHubBridge.getReviewURL()
  });
}

function requestGitHubAuthorization(req, res) {
  res.redirect(gitHubBridge.getAuthorizationURL());
}

exports.router = router;
