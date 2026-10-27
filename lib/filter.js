// Port of the ?src= asset filter used by the official release JSON endpoint.
// Pure functions, shared by the Node server, the build and the Cloudflare Worker.

const VERSION_RE = /-v?\d+\.\d+\.\d+/

// "zdterm-5.6.10-win-arm64.tar.gz" -> "win-arm64.tar.gz"
export function assetKey (name, prefix) {
  let k = name.replace(VERSION_RE, '')
  if (prefix && k.startsWith(prefix + '-')) k = k.slice(prefix.length + 1)
  return k
}

function stem (s) {
  return s.replace(/(\.tar\.gz|\.tar\.xz|\.[A-Za-z0-9]+)$/, '')
}

export function filterAssets (assets, src, prefix) {
  if (!src) return assets
  const wantBlockmap = src.includes('.blockmap')
  const pool = assets.filter(a => wantBlockmap || !a.name.endsWith('.blockmap'))
  const tiers = [
    a => a.name === src,
    a => assetKey(a.name, prefix) === src,
    a => stem(assetKey(a.name, prefix)) === src,
    a => a.name.endsWith(src)
  ]
  for (const t of tiers) {
    const hit = pool.filter(t)
    if (hit.length) return hit
  }
  return []
}

export function filterRelease (data, src, prefix) {
  if (!src) return data
  return {
    ...data,
    release: {
      ...data.release,
      assets: filterAssets(data.release?.assets || [], src, prefix)
    }
  }
}
