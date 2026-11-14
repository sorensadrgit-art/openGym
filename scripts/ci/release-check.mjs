#!/usr/bin/env node
// Does everything that carries a version say the same one? A release whose tag says 1.4.2 while
// the api reports 1.4.1, or whose APK still calls itself 1.4.1, tells the in-app update check
// the wrong thing and leaves self-hosters on a "new" version forever.
//
//   node scripts/ci/release-check.mjs v1.4.2   strict: errors fail (exit 1)
//   node scripts/ci/release-check.mjs          report only: prints the table
//
// Errors (with a tag): frontend + api package.json, the CHANGELOG section. This fork is the web
// app only: the Android, iOS and Garmin projects (and their version numbers) are removed.
import { appendFileSync, readFileSync } from 'node:fs'

const tag = process.argv[2]
const want = tag ? tag.replace(/^v/, '') : null
const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const found = {
  'frontend/package.json': JSON.parse(read('frontend/package.json') || '{}').version,
  'api/package.json': JSON.parse(read('api/package.json') || '{}').version,
}
const changelog = read('CHANGELOG.md')
const section = want ? new RegExp(`^## v${want.replace(/\./g, '\\.')}([^0-9.]|$)`, 'm').test(changelog) : null

const errors = [], warnings = []
if (want) {
  for (const k of ['frontend/package.json', 'api/package.json']) if (found[k] !== want) errors.push(`${k} says ${found[k]}, the tag says ${want}`)
  if (!section) errors.push(`CHANGELOG.md has no "## v${want}" section (the release notes come from there)`)
}
const md = [`### Versions${tag ? ` for ${tag}` : ''}`, '', '| Where | Version |', '|---|---|',
  ...Object.entries(found).map(([k, v]) => `| ${k} | ${v ?? '–'} |`),
  ...(want ? [`| CHANGELOG "## ${tag}" | ${section ? 'present' : 'MISSING'} |`] : []),
  '', ...errors.map((e) => `- ❌ ${e}`), ...warnings.map((w) => `- ⚠️ ${w}`), ''].join('\n')
console.log(md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
for (const w of warnings) console.log(`::warning::${w}`)
for (const e of errors) console.log(`::error::${e}`)
process.exit(errors.length ? 1 : 0)
