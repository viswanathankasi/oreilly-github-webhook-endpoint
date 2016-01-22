// Issue-to-PR CLI tool
// ====================

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea.
'use strict'

/* eslint-disable no-process-exit */

require('colors')

// Modules we need in this file
// ----------------------------

var GitHub = require('github')
var minimist = require('minimist')
var open = require('opn')

// CLI massaging
// -------------

// Parse the command-line using [minimist](https://www.npmjs.com/package/minimist).
var argv = minimist(process.argv.slice(2), {
  string: ['in', 'using', 'token'],
  number: 'issue'
})

// No args or help (`-h`/`--help`)?  Display usage.
if (process.argv.length === 2 || argv.h || argv.help) {
  console.log('Usage: issue-to-pr [--token=<token>] --in [user/]repo --issue <issue-number> --using [user:]branch')
  process.exit()
}

// Check for missing params
var missingParams = false

// Try and get the token from the CLI, fallback to the environment, default to empty.
var token = String(argv.token || process.env.TOKEN || '').trim()
// No token found?  Can't proceed!
if (!token) {
  console.error('Missing token.  Use a TOKEN environment variable or --token=<token> option.'.red)
  missingParams = true
}

if (!argv.in) {
  console.error('Missing target repo (where the PR should spawn).  Use --in [user/]repo.'.red)
  missingParams = true
}

if (!(argv.issue > 0)) {
  console.error('Missing/invalid issue to turn into a PR.  Use --issue <issue-number>.'.red)
  missingParams = true
}

if (!argv.using) {
  console.error('Missing branch to use for the PR.  Use --using [user:]branch..'.red)
  missingParams = true
}

if (missingParams) {
  process.exit()
}

// API client setup
// ----------------

var github = new GitHub({
  version: '3.0.0',
  headers: { 'User-Agent': 'OReilly-GitHub-Training-Gister/1.0' },
  timeout: 20000
})

github.authenticate({
  type: 'oauth',
  token: token
})

// If we used a non-qualified repo name as target, we need
// the current user's username to qualify the repo properly
// for the API call (owner + name).

var NWO = /^([\w-]+)\/([\w-]+)$/

if (NWO.test(argv.in)) {
  createPR(argv.in, argv.issue, argv.using)
} else {
  github.user.get({}, function (err, result) {
    if (err || result.error) {
      console.error(err || result.error_description)
      process.exit()
    }

    createPR(result.login + '/' + argv.in, argv.issue, argv.using)
  })
}

// Actual API calls
// ----------------

function createPR (nwo, issueNumber, head) {
  nwo = nwo.split('/')
  // See [the API doc page](https://developer.github.com/v3/pulls/#create-a-pull-request)
  // for details.
  github.pullRequests.createFromIssue({
    user: nwo[0],
    repo: nwo[1],
    head: head,
    base: 'master',
    issue: issueNumber
  }, function (err, result) {
    if (err) {
      console.error(String(err).red)
    } else {
      console.log('Opening your fresh PR at'.green, result.html_url.cyan)
      // As a nice bonus, automatically open the URL with the user's
      // preferred software/browser.
      open(result.html_url, { wait: false })
    }
  })
}

