const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

export function fmtSize (n) {
  if (!n) return ''
  const mb = n / 1024 / 1024
  return mb >= 1 ? mb.toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'
}

export function platformOf (name) {
  const n = name.toLowerCase()
  if (n.endsWith('.apk') || n.includes('android')) return 'Android'
  if (/win|\.exe$|\.appx$/.test(n)) return 'Windows'
  if (/mac|\.dmg$/.test(n)) return 'macOS'
  if (/linux|\.deb$|\.rpm$|\.appimage$|\.snap$/.test(n)) return 'Linux'
  return 'Other'
}

const ORDER = ['Windows', 'macOS', 'Linux', 'Android', 'Other']

const CSS = `
:root{color-scheme:dark light}
body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#0B1220;color:#e6edf3}
a{color:#58a6ff}
header,main,footer{max-width:960px;margin:0 auto;padding:1rem}
header nav a{margin-right:1rem}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border-bottom:1px solid #30363d;padding:.4rem .6rem;text-align:left;font-size:.92rem}
code,pre{font:13px ui-monospace,monospace}
pre{white-space:pre-wrap;background:#161b22;padding:1rem;border-radius:6px}
.sha{font-size:11px;color:#8b949e;word-break:break-all}
.btn{display:inline-block;background:#238636;color:#fff;padding:.5rem 1rem;border-radius:6px;text-decoration:none}
`

function layout (cfg, title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style></head><body>
<header><h1>${esc(cfg.productName)}</h1>
<nav><a href="/">Download</a><a href="/history.html">History</a><a href="${esc(cfg.docsUrl)}">Docs</a><a href="${esc(cfg.repoUrl)}">Source</a></nav></header>
<main>${body}</main>
<footer><small>&copy; ${esc(cfg.productName)} &middot; <a href="/scripts/one-line-web.sh">one-line web install</a></small></footer>
</body></html>
`
}

export function renderDownloadTable (assets, checksums = {}) {
  const groups = {}
  for (const a of assets) {
    if (a.name.endsWith('.blockmap')) continue
    ;(groups[platformOf(a.name)] ||= []).push(a)
  }
  let out = ''
  for (const p of ORDER) {
    const list = groups[p]
    if (!list) continue
    list.sort((x, y) => x.name.localeCompare(y.name))
    out += `<h3>${p}</h3>\n<table><thead><tr><th>File</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>\n`
    for (const a of list) {
      const sha = checksums[a.name]
      out += `<tr><td><a href="${esc(a.browser_download_url)}">${esc(a.name)}</a></td><td>${fmtSize(a.size)}</td><td class="sha">${sha ? esc(sha) : ''}</td></tr>\n`
    }
    out += '</tbody></table>\n'
  }
  return out
}

export function renderIndex (cfg, slim, checksums) {
  const r = slim.release
  const body = `<p>Latest version: <strong>${esc(r.tag_name)}</strong> (${esc(r.published_at.slice(0, 10))})
<a class="btn" href="/version.html">version.html</a></p>
<h2>Downloads</h2>
${renderDownloadTable(r.assets, checksums)}
<p>Checksums: <a href="/releases/${esc(r.tag_name)}/SHA256SUMS">SHA256SUMS</a>
&middot; Update feed: <code>${esc(cfg.updateUrl)}/data/${esc(cfg.releaseFiles[0])}</code></p>
<h2>Release notes</h2>
<pre>${esc(r.body)}</pre>`
  return layout(cfg, `${cfg.productName} - download`, body)
}

export function renderHistory (cfg, entries) {
  let body = '<h2>Release history</h2>\n'
  for (const e of entries) {
    body += `<section id="${esc(e.version)}"><h3>${esc(e.version)} <small>${esc(e.date)}</small></h3>
<pre>${esc(e.body)}</pre>
<ul>${e.assets.map(a => `<li><a href="${esc(a.url)}">${esc(a.name)}</a> ${fmtSize(a.size)}</li>`).join('')}</ul></section>\n`
  }
  return layout(cfg, `${cfg.productName} - history`, body)
}
