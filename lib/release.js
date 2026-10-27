import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function loadConfig () {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'))
}

export function readJSON (file, fallback) {
  if (!fs.existsSync(file)) return fallback
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

export function writeFile (file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
}

export function sha256File (file) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex')
}

const TYPES = {
  deb: 'application/octet-stream',
  rpm: 'application/x-redhat-package-manager',
  gz: 'application/gzip',
  apk: 'application/vnd.android.package-archive'
}

export function mimeOf (name) {
  const ext = name.split('.').pop()
  return TYPES[ext] || 'application/octet-stream'
}

// Accepts a raw GitHub release API object, a slim {release:{...}} file, or a history entry.
export function normalizeRelease (input, prev = {}, opts = {}) {
  const rel = input.release || input
  const tag = rel.tag_name || rel.version
  if (!tag) throw new Error('release JSON has no tag_name/version')
  const rawAssets = rel.assets || []
  const assets = rawAssets.map(a => {
    const o = {
      name: a.name,
      browser_download_url: a.browser_download_url || a.url,
      size: a.size
    }
    if (a.created_at) o.created_at = a.created_at
    if (a.digest !== undefined && a.digest !== null) {
      if (typeof a.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(a.digest)) {
        throw new Error('release asset has an invalid SHA-256 digest')
      }
      o.digest = a.digest
    }
    if (a.windows_machine_host !== undefined) {
      if (a.windows_machine_host !== 1 || !a.name.endsWith('-win-x64-installer.exe') || !o.digest) {
        throw new Error('release asset has an invalid Windows machine-host declaration')
      }
      o.windows_machine_host = 1
    }
    return o
  })
  return {
    release: {
      tag_name: tag.startsWith('v') ? tag : 'v' + tag,
      body: (rel.body || '').trim(),
      published_at: rel.published_at || rel.date || new Date().toISOString(),
      assets
    },
    starCount: opts.starCount ?? input.starCount ?? prev.starCount ?? 0,
    androidVersion: opts.androidVersion ?? input.androidVersion ?? prev.androidVersion ?? tag
  }
}

export function toHistoryEntry (slim) {
  const r = slim.release
  return {
    version: r.tag_name,
    date: r.published_at.slice(0, 10),
    body: r.body,
    assets: r.assets.map(a => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
      type: mimeOf(a.name)
    }))
  }
}

export function parseChecksums (text) {
  const map = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    if (m) map[m[2].trim()] = m[1].toLowerCase()
  }
  return map
}

export function compareTags (a, b) {
  const pa = a.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}
