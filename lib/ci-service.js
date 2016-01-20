// CI Service Core
// ===============

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea
'use strict'

// Modules we need in this file
// ----------------------------

// This loads both third-party (from [npm](http://npmjs.com/)) and local stuff (paths starting with `./`).

var async = require('async')
var gitHubBridge = require('./github-bridge')
var flatten = require('lodash.flatten')
var invoke = require('lodash.invoke')
var pluck = require('lodash.pluck')
var uniq = require('lodash.uniq')

// Banned buzzword analysis
// ------------------------

// Analyzes the messages for all commits involved in the Pull Request
// described in `payload`, looking for banned buzzwords in the messages.
function checkForBannedBuzzwords (payload, callback) {
  gitHubBridge.getCommitsForPullRequest({
    nwo: payload.pull_request.head.repo.full_name,
    number: payload.pull_request.number
  }, function (err, commits) {
    if (err) {
      return callback(err)
    }

    var banInfo = commits.reduce(detectBuzzwordsInCommit, {})
    callback(null, banInfo)
  })
}

// Computes the failure message, if any, derived from detailed
// banned-buzzwords info.
function computeFailureMessage (banInfo) {
  var shas = Object.keys(banInfo)
  if (shas.length === 0) {
    return
  }

  var abbrevs = invoke(shas, 'slice', 0, 7)
  var data = shas.map(function (sha) { return banInfo[sha] })
  var authors = uniq(pluck(data, 'author').sort())
  var terms = uniq(invoke(flatten(pluck(data, 'culprits')), 'toLocaleLowerCase')).sort()
    .map(function (s) { return '“' + s + '”' })

  var who = authors.length > 1 ? toSentence(authors, 3, 'authors including') : authors[0]
  var what = terms.length > 1 ? toSentence(terms, 3, 'terms such as') : terms[0]
  var where = abbrevs.length > 1 ? toSentence(abbrevs, 3, 'commits including') : abbrevs[0]

  return who + ' went overboard with ' + what + ' in ' + where
}

// Little helper function to turn an array of entities into a proper English
// sentence, possibly explicitly truncated to a maximum amount of actual instances.
// Assumes that `list` is 2+ items long.
//
// For instance:
//
// ```js
// toSentence(['Annie', 'Bob']) // => 'Annie and Bob'
// toSentence(['Annie', 'Bob', 'Claire']) // => 'Annie, Bob and Claire'
// toSentence(['Annie', 'Bob', 'Claire', 'Dave'], 2, 'people including')
// // => '4 people including Annie and Bob'
// ```
function toSentence (list, threshold, overflowPrefix) {
  var result = list.slice(0, threshold)
  result.splice(-2, 2, result.slice(-2).join(' and '))
  result = result.join(', ')
  if (list.length > threshold) {
    result = list.length + ' ' + overflowPrefix + ' ' + result
  }

  return result
}

// A regular expression describing the buzzwords (and their variations)
// that our service will alert about.
var REGEX_BUZZWORDS = /utili[sz]e|synerg(?:y|i[sz]e)|growth hack(?:er|ing)?|leverag(?:e|ing)/i

// Little helper function, used inside the main detection algorithm,
// contributing a commit's potential buzzword issues to a general accumulator.
function detectBuzzwordsInCommit (acc, commit) {
  var sha = commit.sha
  var author = commit.author.login

  commit.commit.message.replace(REGEX_BUZZWORDS, function (culprit) {
    acc[sha] = acc[sha] || { author: author, culprits: [] }
    acc[sha].culprits.push(culprit)
  })

  return acc
}

// Main webhook event handler
// --------------------------

// This is what the webhook's HTTP endpoint delegates to, once it's
// established that the event matches what this CI service expects.
//
// This is invoked asynchronously, outside the request/response cycle
// (GitHub already got its 200 response by now).
function handleEvent (payload) {
  console.log('Processing PR payload…')

  // We use [Async.js](https://github.com/caolan/async) to ease this
  // workflow of asynchronous computations flowing into each other, in sequence.
  async.waterfall([
    // Step 1: send a pending status check to GitHub about this PR.
    function (cb) {
      statusCheck(payload, 'pending', 'Reviewing commit messages for banned wording…', cb)
    },
    // Step 2: check for banned buzzwords (the core work of this CI service)
    // (this is async because we need to ask GitHub for details about the
    // commits involved in the PR).
    function (_, cb) {
      checkForBannedBuzzwords(payload, cb)
    },
    // Step 3: compute the failure message, if any, then notify either a
    // failure (buzzwords!) or a success (no frowned-upon buzzwords).
    function (banInfo, cb) {
      var message = computeFailureMessage(banInfo)
      if (message) {
        statusCheck(payload, 'failure', message, cb)
      } else {
        statusCheck(payload, 'success', 'I like your commit messsages!', cb)
      }
    }
  ], function (err) {
    // This is the final step of the async waterfall flow.  Errors at any
    // step of the way end up here, so we get a single, central error management.
    // As this is outside the HTTP request/response cycle, we just log on the
    // server's console.
    if (err) {
      console.error('/!\\ Error while processing pull request commit:'.red, String(err).yellow)
    } else {
      console.log('\\o/ Pull request commit successfully processed.'.green)
    }
  })
}

// This is the "context" for our statuses, that help the GitHub users
// identify our checks from those by other services (e.g. Travis, CodeClimate…)
var STATUS_CONTEXT = 'oreilly-github-api-demo/banned-buzzwords'

// Little helper function to send a status to GitHub for the given
// pull request, using a consistent context.
function statusCheck (payload, state, description, callback) {
  var head = payload.pull_request.head
  gitHubBridge.sendStatusCheck({
    nwo: head.repo.full_name,
    sha: head.sha,
    state: state,
    context: STATUS_CONTEXT,
    description: description
  }, callback)
}

exports.handleEvent = handleEvent
