#!/usr/bin/env node
/**
 * sync-version.js — keep the hardcoded version in src/core/AppLens.ts in sync
 * with package.json.
 *
 * package.json is the single source of truth. This script rewrites the string
 * returned by AppLens.getVersion() to match.
 *
 * It is wired into the npm "version" lifecycle (see package.json scripts), so
 * it runs automatically during `npm version patch|minor|major` BEFORE npm
 * creates the version commit + tag — meaning the AppLens.ts change is included
 * in the same commit npm tags. It can also be run standalone:
 *
 *   node scripts/sync-version.js
 *
 * Exits non-zero if the version pattern can't be found, so a release fails
 * loudly rather than tagging a mismatched version.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

// During `npm version`, npm sets npm_package_version to the NEW version.
// Standalone, fall back to reading package.json directly.
const version =
  process.env.npm_package_version ||
  require(path.join(repoRoot, 'package.json')).version;

if (!version) {
  console.error('sync-version: could not determine target version.');
  process.exit(1);
}

const targetFile = path.join(repoRoot, 'src', 'core', 'AppLens.ts');
const source = fs.readFileSync(targetFile, 'utf8');

// Match the body of getVersion(): return '<semver>';
const re = /(getVersion\(\):\s*string\s*\{\s*return\s*')([^']*)(';)/;

if (!re.test(source)) {
  console.error(
    `sync-version: could not find the getVersion() return string in ${path.relative(
      repoRoot,
      targetFile,
    )}.`,
  );
  process.exit(1);
}

const updated = source.replace(re, `$1${version}$3`);

if (updated === source) {
  console.log(`sync-version: AppLens.getVersion() already at ${version}.`);
  process.exit(0);
}

fs.writeFileSync(targetFile, updated);
console.log(`sync-version: set AppLens.getVersion() -> ${version}.`);
