'use strict'

var async = require('async')
var gitHubBridge = require('./github-bridge')
var flatten = require('lodash.flatten')
var invoke = require('lodash.invoke')
var pluck = require('lodash.pluck')
var uniq = require('lodash.uniq')

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

function toSentence (list, threshold, overflowPrefix) {
  var result = list.slice(0, threshold)
  result.splice(-2, 2, result.slice(-2).join(' and '))
  result = result.join(', ')
  if (list.length > threshold) {
    result = list.length + ' ' + overflowPrefix + ' ' + result
  }

  return result
}

var REGEX_BUZZWORDS = /utili[sz]e|synerg(?:y|i[sz]e)|growth hack(?:er|ing)?|leverag(?:e|ing)/i

function detectBuzzwordsInCommit (acc, commit) {
  var sha = commit.sha
  var author = commit.author.login

  commit.commit.message.replace(REGEX_BUZZWORDS, function (culprit) {
    acc[sha] = acc[sha] || { author: author, culprits: [] }
    acc[sha].culprits.push(culprit)
  })

  return acc
}

function handleEvent (payload) {
  console.log('Processing PR payload…')

  async.waterfall([
    function (cb) { sendPendingStatus(payload, cb) },
    function (_, cb) { checkForBannedBuzzwords(payload, cb) },
    function (banInfo, cb) {
      var message = computeFailureMessage(banInfo)
      if (message) {
        statusCheck(payload, 'failure', message, cb)
      } else {
        statusCheck(payload, 'success', 'I like your commit messsages!', cb)
      }
    }
  ], function (err) {
    if (err) {
      console.error('/!\\ Error while processing pull request commit:'.red, String(err).yellow)
    } else {
      console.log('\\o/ Pull request commit successfully processed.'.green)
    }
  })
}

function sendPendingStatus (payload, callback) {
  statusCheck(payload, 'pending', 'Reviewing commit messages for banned wording…', callback)
}

var STATUS_CONTEXT = 'oreilly-github-api-demo/banned-buzzwords'

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
