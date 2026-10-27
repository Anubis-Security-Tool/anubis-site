import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROOT, loadConfig, readJSON, writeFile, parseChecksums, compareTags
} from '../lib/release.js'
import { renderIndex, renderHistory } from '../lib/render.js'

export function build (cfg, contentDir, outDir) {
  const slim = readJSON(path.join(contentDir, 'release.json'))
  if (!slim) throw new Error(`missing ${path.join(contentDir, 'release.json')}; run bin/publish-release.js first`)
  const tag = slim.release.tag_name

  const histDir = path.join(contentDir, 'history')
  const entries = fs.existsSync(histDir)
    ? fs.readdirSync(histDir).filter(f => f.endsWith('.json'))
      .map(f => readJSON(path.join(histDir, f)))
      .sort((a, b) => compareTags(b.version, a.version))
    : []

  const sumFile = path.join(contentDir, 'checksums', tag + '.txt')
  const sumText = fs.existsSync(sumFile) ? fs.readFileSync(sumFile, 'utf8') : ''
  const checksums = parseChecksums(sumText)

  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  // static assets first so generated files win
  const staticDir = path.join(ROOT, 'static')
  if (fs.existsSync(staticDir)) fs.cpSync(staticDir, outDir, { recursive: true })

  writeFile(path.join(outDir, 'index.html'), renderIndex(cfg, slim, checksums))
  writeFile(path.join(outDir, 'history.html'), renderHistory(cfg, entries))
  // client reads these as plain text: no trailing newline
  writeFile(path.join(outDir, 'version.html'), tag)
  writeFile(path.join(outDir, 'version-android.html'), slim.androidVersion || tag)

  const json = JSON.stringify(slim, null, 2)
  for (const f of cfg.releaseFiles) writeFile(path.join(outDir, 'data', f), json)
  writeFile(path.join(outDir, 'data', 'history.json'), JSON.stringify(entries))

  if (sumText) writeFile(path.join(outDir, 'releases', tag, 'SHA256SUMS'), sumText)
  // mirrored binaries (copied by publish-release --copy)
  const relDir = path.join(contentDir, 'releases')
  if (fs.existsSync(relDir)) fs.cpSync(relDir, path.join(outDir, 'releases'), { recursive: true })

  writeFile(path.join(outDir, '404.html'), '<!doctype html><title>Not found</title><h1>404</h1><a href="/">Home</a>\n')
  return { tag, entries: entries.length, assets: slim.release.assets.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = loadConfig()
  const args = process.argv.slice(2)
  const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
  const res = build(
    cfg,
    path.resolve(ROOT, get('--content', cfg.contentDir)),
    path.resolve(ROOT, get('--out', cfg.outDir))
  )
  console.log('built', res)
}
