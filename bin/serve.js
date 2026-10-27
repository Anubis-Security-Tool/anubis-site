// Minimal Node server: static dist/ + ?src= filter for the release JSON.
// Usage: node bin/serve.js [--port 3001] [--dir dist]   (env PORT, DIST_DIR)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, loadConfig } from '../lib/release.js'
import { filterRelease } from '../lib/filter.js'

const cfg = loadConfig()
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const port = Number(arg('--port', process.env.PORT || 3001))
const dist = path.resolve(ROOT, arg('--dir', process.env.DIST_DIR || cfg.outDir))
const releasePaths = cfg.releaseFiles.map(f => '/data/' + f)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.sh': 'text/x-shellscript',
  '.bat': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
}
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300'
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let p = decodeURIComponent(url.pathname)
  if (releasePaths.includes(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dist, p), 'utf8'))
      const out = filterRelease(data, url.searchParams.get('src'), cfg.assetPrefix)
      res.writeHead(200, { ...SEC, 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(500)
      return res.end('release data unavailable')
    }
  }
  if (p.endsWith('/')) p += 'index.html'
  const file = path.join(dist, p)
  if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html' })
    return res.end(fs.readFileSync(path.join(dist, '404.html')))
  }
  res.writeHead(200, { ...SEC, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

server.listen(port, () => console.log(`serving ${dist} on :${port}`))
