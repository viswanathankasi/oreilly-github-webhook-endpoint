// Homepage and OAuth Web Flow
// ===========================

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea
'use strict'

// Modules we need in this file
// ----------------------------

// This loads both third-party (from [npm](http://npmjs.com/)) and local stuff (paths starting with `../`).

var express = require('express')
var gitHubBridge = require('../lib/github-bridge')

// Routes provided by this "controller"
// ------------------------------------

var router = new express.Router()
router.get('/', homePage)
router.get('/oauth/authorize', requestGitHubAuthorization)
router.get('/oauth/callback', exchangeAuthCodeForToken)
router.get('/oauth/check_token', checkToken)

// Token validity check
// --------------------

// This route handler verifies that our known access token still works
// (in other words, that it wasn't revoked by the user, usually interactively
// in their [Application settings](https://github.com/settings/applications)).
function checkToken (req, res) {
  gitHubBridge.checkToken(function (err) {
    if (err) {
      res.status(503).end(err)
      return
    }

    req.flash('info', 'Your OAuth token is still valid!')
    res.redirect('/')
  })
}

// OAuth Web Flow, final step
// --------------------------

// Once the user interactively granted us a permission on their
// GitHub authorization screen, GitHub calls our callback URL with
// a one-time authorization code that expires quite fast.  We exchange
// it for the actual access token through a server-to-server request,
// so it's never visible by third-parties.
function exchangeAuthCodeForToken (req, res) {
  gitHubBridge.exchangeAuthCodeForToken(req.query.code, function (err) {
    if (err) {
      res.status(503).end(err)
      return
    }

    req.flash('success', 'Successfully obtained your OAuth token!')
    res.redirect('/')
  })
}

// Web app homepage
// ----------------

// This is what you get when visiting the server's root URL.
// Displays a number of buttons for the various actions we allow:
// authorizing, checking the token is still valid, and setting up
// the webhook.
function homePage (req, res) {
  res.render('home', {
    authenticated: gitHubBridge.isAuthenticated(),
    reviewPermissionsURL: gitHubBridge.getReviewURL()
  })
}

// OAuth Web Flow, step 1
// ----------------------

// This is the first step, triggered when you click the
// "Authorize this app on GitHub" button on the unauthenticated
// homepage.  Redirects to a properly-crafted URL at GitHub.com
// that lets the end-user interactively review our requested
// permissions and authorize us.
function requestGitHubAuthorization (req, res) {
  res.redirect(gitHubBridge.getAuthorizationURL())
}

exports.router = router
