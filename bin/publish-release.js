#!/usr/bin/env node
// Publish a release into the static hub: updates content/, then rebuilds dist/.
// Replaces github-api-handler + the sync-gitee workflow of the upstream project.
//
//   node bin/publish-release.js <release.json | release-dir> [options]
//
// Input: GitHub "release" API/webhook JSON ({tag_name, body, assets[]} or {release:{...}}),
// a slim release file, or a directory (with optional release.json + asset files).
// Options:
//   --tag vX.Y.Z           required for a directory without release.json
//   --stars N              starCount for the landing page
//   --android-version vX   defaults to the tag
//   --rewrite-urls         point asset URLs at cfg.downloadBase/<tag>/<name>
//   --copy                 (dir input) copy asset files into content/releases/<tag>/
//   --checksums FILE       sha256sum-format file (when no local asset files)
//   --no-latest            only add to history (back-fill old versions)
//   --no-build             skip dist/ regeneration
//   --content DIR / --out DIR
import fs from 'node:fs'
import path from 'node:path'
import {
  ROOT, loadConfig, readJSON, writeFile, sha256File, normalizeRelease,
  toHistoryEntry, parseChecksums
} from '../lib/release.js'
import { build } from './build.js'

function parseArgs (argv) {
  const o = { _: [] }
  const flags = new Set(['--rewrite-urls', '--copy', '--no-latest', '--no-build'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (flags.has(a)) o[a.slice(2)] = true
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i]
    else o._.push(a)
  }
  return o
}

function main () {
  const o = parseArgs(process.argv.slice(2))
  const input = o._[0]
  if (!input) {
    console.error('usage: node bin/publish-release.js <release.json|dir> [options] (see header)')
    process.exit(2)
  }
  const cfg = loadConfig()
  const contentDir = path.resolve(ROOT, o.content || cfg.contentDir)
  const outDir = path.resolve(ROOT, o.out || cfg.outDir)
  const prev = readJSON(path.join(contentDir, 'release.json'), {})

  const isDir = fs.statSync(input).isDirectory()
  let raw
  let files = []
  if (isDir) {
    const rj = path.join(input, 'release.json')
    files = fs.readdirSync(input).filter(f =>
      f !== 'release.json' && f !== 'SHA256SUMS' && fs.statSync(path.join(input, f)).isFile())
    raw = readJSON(rj)
    if (!raw) {
      if (!o.tag) throw new Error('directory has no release.json; pass --tag')
      raw = { tag_name: o.tag, body: '', published_at: new Date().toISOString(), assets: [] }
    }
  } else {
    raw = readJSON(input)
  }

  const slim = normalizeRelease(raw, prev, {
    starCount: o.stars !== undefined ? Number(o.stars) : undefined,
    androidVersion: o['android-version']
  })
  const tag = slim.release.tag_name

  // assets present on disk but not listed in the JSON are added
  const known = new Set(slim.release.assets.map(a => a.name))
  for (const f of files) {
    if (!known.has(f)) {
      slim.release.assets.push({
        name: f,
        browser_download_url: `${cfg.downloadBase}/${tag}/${f}`,
        size: fs.statSync(path.join(input, f)).size,
        created_at: slim.release.published_at
      })
    }
  }
  if (o['rewrite-urls']) {
    for (const a of slim.release.assets) a.browser_download_url = `${cfg.downloadBase}/${tag}/${a.name}`
  }

  // checksums: computed from local files, else from --checksums / SHA256SUMS in the dir
  let sums = {}
  if (o.checksums) sums = parseChecksums(fs.readFileSync(o.checksums, 'utf8'))
  else if (isDir && fs.existsSync(path.join(input, 'SHA256SUMS'))) {
    sums = parseChecksums(fs.readFileSync(path.join(input, 'SHA256SUMS'), 'utf8'))
  }
  for (const f of files) sums[f] = sha256File(path.join(input, f))
  const sumLines = Object.keys(sums).sort().map(n => `${sums[n]}  ${n}`)
  if (sumLines.length) writeFile(path.join(contentDir, 'checksums', tag + '.txt'), sumLines.join('\n') + '\n')

  if (o.copy && isDir) {
    const dest = path.join(contentDir, 'releases', tag)
    fs.mkdirSync(dest, { recursive: true })
    for (const f of files) fs.copyFileSync(path.join(input, f), path.join(dest, f))
  }

  writeFile(path.join(contentDir, 'history', tag + '.json'), JSON.stringify(toHistoryEntry(slim), null, 2))
  if (!o['no-latest']) {
    writeFile(path.join(contentDir, 'release.json'), JSON.stringify(slim, null, 2))
  }
  console.log(`published ${tag}: ${slim.release.assets.length} assets, ${sumLines.length} checksums`)

  if (!o['no-build']) {
    console.log('built', build(cfg, contentDir, outDir))
  }
}

try {
  main()
} catch (e) {
  console.error('publish failed:', e.message)
  process.exit(1)
}
