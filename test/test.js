import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { filterAssets } from '../lib/filter.js'
import { normalizeRelease } from '../lib/release.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const nginx = fs.readFileSync(path.join(root, 'nginx/nginx.conf'), 'utf8')
const filterLocation = nginx.match(/location ~ (\S+) \{/)
assert.ok(filterLocation, 'nginx must route both release feed aliases to the filter')
const feedPath = new RegExp(filterLocation[1])
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'))
for (const name of config.releaseFiles) assert.ok(feedPath.test('/data/' + name))
assert.ok(!feedPath.test('/data/anubis-release.json.extra'))
assert.match(nginx, /server_name anubis\.locker;\s+return 302 https:\/\/download\.anubis\.locker\$request_uri;/)
const acceptedAsset = {
  name: 'anubis-5.7.6-win-x64-installer.exe',
  browser_download_url: 'https://download.anubis.locker/releases/v5.7.6/anubis-5.7.6-win-x64-installer.exe',
  size: 12345,
  digest: 'sha256:' + 'a'.repeat(64),
  windows_machine_host: 1
}
const acceptedRelease = { tag_name: 'v5.7.6', assets: [acceptedAsset] }
assert.deepEqual(normalizeRelease(acceptedRelease).release.assets[0], acceptedAsset)
for (const invalid of [
  { digest: undefined },
  { digest: 'sha256:invalid' },
  { windows_machine_host: 0 },
  { name: 'anubis-5.7.6-linux-amd64.deb' }
]) {
  assert.throws(() => normalizeRelease({
    ...acceptedRelease, assets: [{ ...acceptedAsset, ...invalid }]
  }), /invalid/)
}
assert.equal(normalizeRelease({
  tag_name: 'v5.7.6',
  assets: [{ name: 'old.exe', browser_download_url: 'https://example.invalid/old.exe', size: 1, digest: null }]
}).release.assets[0].digest, undefined)
const fx = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/github-slim-release.json'), 'utf8'))

// the fixture is upstream data, so assets carry the upstream prefix
const a = fx.release.assets
assert.equal(filterAssets(a, 'win-arm64.tar.gz', 'electerm').length, 1)
assert.equal(filterAssets(a, 'electerm-5.6.10-win-arm64.tar.gz', 'electerm').length, 1)
assert.equal(filterAssets(a, 'nope.xyz', 'electerm').length, 0)
assert.ok(filterAssets(a, '').length === a.length)
assert.ok(!filterAssets(a, 'win-x64.exe', 'electerm').some(x => x.name.endsWith('.blockmap')))

const work = fs.mkdtempSync(path.join(root, 'test', 'work-'))
try {
  const content = path.join(work, 'content')
  const out = path.join(work, 'dist')
  execFileSync(process.execPath, [
    path.join(root, 'bin/publish-release.js'), path.join(here, 'fixtures/github-slim-release.json'),
    '--content', content, '--out', out, '--stars', '15420'
  ], { stdio: 'inherit' })
  assert.equal(fs.readFileSync(path.join(out, 'version.html'), 'utf8'), 'v5.6.10')
  const rel = JSON.parse(fs.readFileSync(path.join(out, 'data/anubis-release.json'), 'utf8'))
  assert.equal(rel.release.tag_name, 'v5.6.10')
  assert.equal(rel.starCount, 15420)
  assert.ok(rel.release.assets.every(x => x.name && x.browser_download_url))
  const idx = fs.readFileSync(path.join(out, 'index.html'), 'utf8')
  assert.ok(idx.includes('Anubis-Security-Tool') && idx.includes('Windows'))
  assert.ok(fs.existsSync(path.join(out, 'history.html')))
  assert.ok(fs.existsSync(path.join(out, 'scripts/one-line-web.sh')))
  const acceptedInput = path.join(work, 'accepted-release.json')
  fs.writeFileSync(acceptedInput, JSON.stringify(acceptedRelease))
  execFileSync(process.execPath, [
    path.join(root, 'bin/publish-release.js'), acceptedInput, '--content', content, '--out', out
  ], { stdio: 'inherit' })
  for (const name of config.releaseFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(out, 'data', name), 'utf8'))
    assert.deepEqual(data.release.assets, [acceptedAsset])
  }
  console.log('ok')
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
