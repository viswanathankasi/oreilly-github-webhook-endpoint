// GitHub API Bridge
// =================

// We mostly rely on [node-github](https://github.com/mikedeboer/node-github)
// (`github` on npm) to wrap our accesses to GitHub’s API, but sometimes this
// wrapper is a bit too low-level / basic, or outright doesn't feature extra
// helpers we need (such as specific user-facing GitHub URLs), so we wrapped that
// with an extra layer more amenable to this demo app's business needs.
//
// This also has the great advantage of keeping all the API-related code into
// this single module, including persistent state such as GitHub App credentials,
// OAuth access token, and webhook secret token.  Far less coupling across
// controllers, for instance.

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea.
'use strict'

/* eslint complexity: [2, 10] */

// Modules we need in this file
// ----------------------------

// This loads both third-party (from [npm](http://npmjs.com/)) and local stuff (paths starting with `../`).

var async = require('async')
var dotenv = require('dotenv')
var getBody = require('raw-body')
var GitHub = require('github')
var hmacSha1 = require('../lib/hmac-sha1')
var qs = require('querystring')
var request = require('superagent')
var util = require('util')
var verifySignature = require('../lib/verify-signature')

// The [OAuth scopes](https://developer.github.com/v3/oauth/#scopes)
// we're going to need for this service.
var REQUESTED_SCOPES = 'repo'
// A cryptographically-secure random secret token we can use
// (unless it's overridden by a persistent one stored in `.env`)
// for securing our incoming webhook event requests from GitHub.
var SECRET_TOKEN = require('crypto').randomBytes(32).toString('hex')

// GitHub credentials and API wrapper
// ----------------------------------

// This will store a number of credentials (App's client ID, App's client
// secret, access token, persistent secret token) and the callback URL
// for this instance of the app (port may change across launches).
var credentials = {}

// The main GitHub API wrapper.  A singleton used by all higher-level
// functions exposed by this module.
var github = new GitHub({
  version: '3.0.0',
  headers: { 'User-Agent': 'OReilly-GitHub-Training-DemoServer/1.0' },
  timeout: 5000
})
// We immediately load and verify our credentials, at module init time,
// therefore at server startup time.  See the function below (it's callable
// from right here because of [JS function declaration hoisting](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function#Function_declaration_hoisting)).
loadCredentials()

// Token validity check
// --------------------

// Core function for checking that a known access token is still valid.
// The API wrapper has not call for this, so we manually call the API
// URL for it, using our app's client ID and the token itself, server-to-server,
// with proper HTTP Basic Authentication credentials.  That call does not
// impact our API Rate Limit consumption.
function checkToken (callback) {
  var url = 'https://api.github.com/applications/' + credentials.clientId +
    '/tokens/' + credentials.accessToken
  request
    .get(url)
    .auth(credentials.clientId, credentials.clientSecret)
    .end(function (err, saResponse) {
      // Common pattern when manually requesting an API URL: we could get an
      // HTTP-level error in `err`, or a business-logic API error, described
      // in the response body's `error`, `error_description` and `error_uri`
      // fields.  Standardize this for our callback.
      var hasError = err || saResponse.body.error
      var error = hasError ? String(err || saResponse.body.error_description) : null

      // When the token check works, we display the token's details on the
      // server console, just FYI.
      if (!hasError) {
        console.log('==== TOKEN CHECK RESPONSE ===='.green)
        console.log(util.inspect(saResponse.body, { colors: true }))
      }

      callback(error)
    })
}

// Webhook Setup
// -------------

// Creates a new webhook for our service in the repo identified by `params`.
// Because our URL keeps changing as we re-launch `ngrok`, we can't quite
// list existing hooks to reliably determine whether we already have one.
//
// We could avoid duplicates by storing the hook's ID server-side (say,
// in a simple [lowDB](https://github.com/typicode/lowdb) database) and then
// use that to either create or update our hook, but that's, as they say,
// “left as an exercise for the reader.”
function createHook (params, callback) {
  // In GitHub parlance, "nwo" stands for “name with owner”, and you'll usually
  // find it in GitHub API payloads as `full_name` fields in repository objects.
  // It's easier to lug around than two individual fields, but GitHub API calls
  // insist on identifying repos with two separate fields, `user` and `repo`, so
  // we make it easy on our callers and adjust internally.  You'll find this
  // pattern in several places throughout this codebase.
  var repo = params.nwo.split('/')
  var payload = {
    user: repo[0],
    repo: repo[1],
    // Webhooks *have* to use `'web'` as a `name`.
    name: 'web',
    config: {
      url: params.url,
      content_type: 'json',
      secret: SECRET_TOKEN
    },
    // We're only interested in `pull_request` events anyway, so…
    events: ['pull_request'],
    // Webhooks are active by default, but it doesn't hurt to be explicit.
    active: true
  }
  github.repos.createHook(payload, callback)
}

// Configuration
// -------------

// Tiny configuration method used by the main server to give us our
// actual local URL, so we can compute our callback URL from it and
// use that when authorizing (see `getAuthorizationURL()`).
function configure (options) {
  credentials.callbackURL = options.rootURL + '/oauth/callback'
}

// OAuth Web Flow, Final Step
// --------------------------

// When the end-user authorizes us, GitHub calls back to us in the browser,
// with a one-time, quick-expiry authorization code.  We then call their API
// internally to obtain the actual access token for it, which is what we'll
// be using for later API calls on behalf of our end-user.
function exchangeAuthCodeForToken (authCode, callback) {
  // The API wrapper has not call for this, so we manually call the API
  // URL for it, using our app's credentials and the authorization code.
  request
    .post('https://github.com/login/oauth/access_token')
    .send({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: authCode
    })
    .end(function (err, saResponse) {
      // For details about this error standardization pattern, see the same
      // code above in `checkToken()`.
      var hasError = err || saResponse.body.error
      var error = hasError ? String(err || saResponse.body.error_description) : null

      if (!hasError) {
        // Store the OAuth access token (in-memory) for later uses
        credentials.accessToken = saResponse.body.access_token
        // Switch the GitHub API wrapper authentication to use this
        // access token from now on.
        github.authenticate({
          type: 'oauth',
          token: credentials.accessToken
        })
        // Log details about the token on the server console, FYI.
        console.log('\\o/ Got our access token:'.green, credentials.accessToken.cyan)
        console.log(' (normalized scopes: %s)'.gray, saResponse.body.scope)
      }

      callback(error)
    })
}

// Authorization URL
// -----------------

// Public helper function to compute the OAuth Web Flow initial URL
// (step1: request authorization) for our app, based on our credentials,
// requested scopes, and local callback URL.
function getAuthorizationURL () {
  return 'https://github.com/login/oauth/authorize?' + qs.stringify({
    client_id: credentials.clientId,
    redirect_uri: credentials.callbackURL,
    scope: REQUESTED_SCOPES
  })
}

// Commits in a Pull Request
// -------------------------

// Public helper function for the CI service to obtain the commits
// involved in a given pull request, identified by its repo's `nwo`
// and pull request `number`.  Will not paginate, but return up to
// 100 commits (auto-pagination is another nice feature that the
// `github` wrapper module doesn't offer, sigh…).
function getCommitsForPullRequest (params, callback) {
  var nwo = params.nwo.split('/')
  github.pullRequests.getCommits({
    user: nwo[0],
    repo: nwo[1],
    number: params.number,
    per_page: 100
  }, callback)
}

// List user-accessible repositories
// ---------------------------------

// Public helper function to list the repositories the end-user
// identified by our access token has write access to (so we can
// pick one to setup our webhook on).
function getRepositories (callback) {
  github.repos.getAll({ per_page: 100 }, callback)
}

// Permissions review URL
// ----------------------

// Public helper function to compute the permissions review URL
// for our application in the end-user's GitHub account.  GitHub
// [encourages integrators](https://developer.github.com/v3/oauth/#directing-users-to-review-their-access-for-an-application)
// to ease the end-user's review ability of the granted permissions
// for our service.
function getReviewURL () {
  return 'https://github.com/settings/connections/applications/' +
    credentials.clientId
}

// Authentication status
// ---------------------

// Public helper function to determine whether we have authenticated
// successfully (we have a known OAuth access token) and can therefore
// start using the API, or not.  Useful for toggling the proposed actions
// on the homepage.
function isAuthenticated () {
  return !!credentials.accessToken
}

// Webhook event payload verification
// ----------------------------------

// Incoming webhook event requests may be counterfeited by malicious
// entities.  To secure your webhook, GitHub recommends providing a
// secure, unique [secret token](https://developer.github.com/webhooks/securing/)
// for your webhooks.  When such a token is there, GitHub will cryptographically
// sign all its matching requests with it, using a well-known mechanism
// called an [HMAC-SHA1](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code)
// signature.
//
// Our webhook server code can then retrieve that signature along with the
// request's payload, compute the signature itself, and verify that its signature
// and the sender's match.
//
// This public function does that, automatically sets up the HTTP response
// (`res`) if verification fails, and if it succeeds pre-parses the request
// body's JSON payload.  It also augments the returned data with event
// identification data, such as event type and delivery ID, which are only
// available from [specific HTTP request headers](https://developer.github.com/webhooks/#delivery-headers).
function loadAndVerifyWebhookEventPayload (req, res, callback) {
  // We use [Async.js](https://github.com/caolan/async) again to
  // asynchronously compute the body's signature **and** grab the body's
  // full text, in parallel.  This is the kind of stuff Node.js really shines
  // at, and that would be quite difficult, if not outright impossible, in
  // many other server technologies.
  async.parallel([
    // 1a. Compute the HMAC-SHA1 signature of the entire body (payload)
    function (cb) { hmacSha1(req, SECRET_TOKEN, cb) },
    // 1b. Get the request's entire body from its stream
    function (cb) { getBody(req, { encoding: 'utf-8' }, cb) }
  ],

  // 2. Then handle the results
  function (err, results) {
    // Error? Dang! Send the matching response back and be done.
    if (err) {
      res.status(err.status || 500).end(err.type || 'Blam!')
      return callback(err.status || 500)
    }

    // Display a delivery/event heading in the console (type and UUID)
    var eventType = req.headers['x-github-event']
    var deliveryId = req.headers['x-github-delivery']
    console.log('===== %s (%s) ====='.yellow, eventType, deliveryId)

    // Verify signature based on secret token.
    // Deny with 403 (Forbidden) if incorrect.
    var expectedSignature = results[0]
    if (!verifySignature(req, expectedSignature)) {
      console.log('Invalid signature: denying request'.red)
      res.status(403).end('Invalid signature: denying request.')
      return callback(403)
    }

    // Send the JSON payload back through the callback (unless it's
    // invalid JSON for some odd reason, then send the parse error back).
    try {
      var payload = JSON.parse(results[1])
      var result = {
        eventType: eventType,
        deliveryId: deliveryId,
        payload: payload
      }
      // The `return`s below appease ESLint when it sees our code
      // call `callback` multiple times…
      return callback(null, result)
    } catch (e) {
      return callback(e)
    }
  })
}

// Startup-time credential loading
// -------------------------------

// This is called directly from this module's init code (see way above),
// which means it's called at startup time, as soon as this module is `require()`'d.
//
// All our credentials are expected to be made available through the process'
// environment, as per the [12-Factor Apps]() Manifesto.
function loadCredentials () {
  // If not running in production mode, we do allow getting our credentials
  // from a non-versioned (`.gitignore`'d) file, that we use to populate the
  // environment.
  var productionMode = (process.env.NODE_ENV === 'production')
  if (!productionMode) {
    dotenv.load({ silent: true })
  }

  // Our registered [Developer App](https://github.com/settings/developers)
  // has a fixed set of credentials: Client ID and Client Secret.  We need these.
  credentials.clientId = (process.env.CLIENT_ID || '').trim()
  credentials.clientSecret = (process.env.CLIENT_SECRET || '').trim()
  // In order to avoid our users having to re-authenticate through GitHub every
  // time they run this demo server, we also allow an `ACCESS_TOKEN` variable in
  // there.  This, of course, would make no sense in production: it would be stored,
  // hopefully encrypted asymetrically, in our database for individual user accounts.
  credentials.accessToken = (process.env.ACCESS_TOKEN || '').trim()

  // This is similar to the access token development-time issue.  This module
  // generates a new secret token at every run, but we allow our users to make it
  // fixed when playing with this demo, so they don't have to re-configure the
  // webhook at every run.  In production, the webhooks registered for the app
  // would be stored in the database, with at minimum their GitHub webhook ID and
  // their individual secret tokens.
  var persistedSecret = (process.env.SECRET_TOKEN || '').trim()
  if (persistedSecret) {
    SECRET_TOKEN = persistedSecret
  }

  // Missing App credentials? Uh-oh, we can't do anything.
  if (!credentials.clientId || !credentials.clientSecret) {
    console.error('/!\\ Missing GitHub app credentials in the environment.'.red)
    console.error(' Make sure the environment has valid CLIENT_ID and CLIENT_SECRET variables'.red)
    if (!productionMode) {
      console.error(' (you can put these in a non-versioned .env file at the root of this project)'.gray)
    }
    console.log('  (forgot to register this app?  Do it now --> https://github.com/settings/developers)'.gray);
    console.log('');
    process.exit() // eslint-disable-line no-process-exit
  }

  // If we do have app credentials, we'll verify they're accurate/valid
  // by trying an API request to verify our Rate Limits: successfully authenticated
  // such requests have much higher limits.
  console.log('GitHub App credentials properly loaded. Checking them…'.green)
  github.authenticate({
    type: 'oauth',
    key: credentials.clientId,
    secret: credentials.clientSecret
  })
  github.misc.rateLimit({}, function (err, data) {
    if (err) {
      console.error('/!\\ Error when verifying GitHub App credentials'.red, err)
      process.exit() // eslint-disable-line no-process-exit
    }

    if (data.resources.core.limit <= 60) {
      console.error('/!\\ GitHub App credentials seem to fail authentication.'.red)
      process.exit() // eslint-disable-line no-process-exit
    }
    console.log('\\o/ GitHub App credentials seem to successfully authenticate.'.green)
    // We started out with API wrapper authentication based on App credentials.
    // If we have an access token handy (from a key in our development `.env` file,
    // probably) now is the time to switch to it.
    if (credentials.accessToken) {
      github.authenticate({ type: 'oauth', token: credentials.accessToken })
      console.log('Using stored access token'.green, credentials.accessToken.cyan)
    }
  })
}

// Status sending
// --------------

// A thin wrapper on top of the GitHub API original call for
// sending a status check to GitHub.  It just provides our usual
// nicety of allowing `nwo` instead of individual `user` and `repo`.
//
// This is used by the CI Service Core to report its progress and completion
// to GitHub.
function sendStatusCheck (params, callback) {
  var nwo = params.nwo.split('/')
  github.statuses.create({
    user: nwo[0],
    repo: nwo[1],
    sha: params.sha,
    state: params.state,
    description: params.description,
    context: params.context
  }, callback)
}

module.exports = {
  checkToken: checkToken,
  configure: configure,
  createHook: createHook,
  exchangeAuthCodeForToken: exchangeAuthCodeForToken,
  getAuthorizationURL: getAuthorizationURL,
  getCommitsForPullRequest: getCommitsForPullRequest,
  getRepositories: getRepositories,
  getReviewURL: getReviewURL,
  isAuthenticated: isAuthenticated,
  loadAndVerifyWebhookEventPayload: loadAndVerifyWebhookEventPayload,
  SECRET_TOKEN: SECRET_TOKEN,
  sendStatusCheck: sendStatusCheck
}
