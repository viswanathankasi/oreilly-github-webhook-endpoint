// Gist creation CLI tool
// ======================

// [Strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) is always a good idea.
'use strict'

/* eslint-disable no-process-exit */

require('colors')

// Modules we need in this file
// ----------------------------

var assign = require('lodash.assign')
var fs = require('fs')
var GitHub = require('github')
var minimist = require('minimist')
var open = require('opn')
var Path = require('path')
var typeCheck = require('istextorbinary')

// CLI massaging
// -------------

// Parse the command-line using [minimist](https://www.npmjs.com/package/minimist).
var argv = minimist(process.argv.slice(2), {
  string: ['token', 'description'],
  boolean: 'private'
})

// No args or help (`-h`/`--help`)?  Display usage.
if (process.argv.length === 2 || argv.h || argv.help) {
  console.log('Usage: create-gist [--private] [--token=<token>] [--description=<desc>] path...')
  process.exit()
}

// Try and get the token from the CLI, fallback to the environment, default to empty.
var token = String(argv.token || process.env.TOKEN || '').trim()
// No token found?  Can't proceed!
if (!token) {
  console.error('Missing token.  Use a TOKEN environment variable or --token=<token> option.'.red)
  process.exit()
}

// Compute the files payload from the paths in the CLI, if any
var files = computeFileList(argv._)
// No eligible files?  Ouch!
if (Object.keys(files).length === 0) {
  console.error('No files to use for the Gist.  Specify files and/or directories.'.red)
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

// Actual API call
// ---------------

// See [the API doc page](https://developer.github.com/v3/gists/#create-a-gist)
// for details.
github.gists.create({
  files: files,
  description: argv.description,
  public: !argv.private
}, function (err, result) {
  if (err) {
    console.error(String(err).red)
  } else {
    console.log('Opening your new gist at'.green, result.html_url.cyan)
    // As a nice bonus, automatically open the URL with the user's
    // preferred software/browser.
    open(result.html_url, { wait: false })
  }
})

// File payload building
// ---------------------

// This is the main helper function to build our file list, recursively.
// It automatically ignores binary files (using extension- and content-based
// heuristics).
function computeFileList (paths) {
  return paths.reduce(function (acc, path) {
    var stat = fs.statSync(path)

    if (stat.isFile()) {
      return processFile(acc, path)
    }

    if (stat.isDirectory()) {
      var entries = fs.readdirSync(path).map(function (entry) {
        return Path.join(path, entry)
      })
      return assign(acc, computeFileList(entries))
    }

    return acc
  }, {})
}

// The core file analysis-and-addition code, used by the main
// algorithm just above.
function processFile (acc, path) {
  var buffer = fs.readFileSync(path)

  if (typeCheck.isTextSync(path, buffer)) {
    // Gists don't allow subdirectories, so we're flattening names using dashes.
    var key = path.replace(/[\\\/]+/, '-')
    var encoding = typeCheck.getEncodingSync(buffer)
    acc[key] = { content: buffer.toString(encoding) }
  } else {
    // Still mention when we're skipping a file because it's binary,
    // so the end-user isn't too surprised.
    console.warn('Skipping'.yellow, path.cyan, 'as it seems binary.'.yellow)
  }

  return acc
}
