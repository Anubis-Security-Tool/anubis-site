# Anubis-Security-Tool download / update hub

Static distribution hub for `download.anubis.locker` / `update.anubis.locker`
(replaces the electerm.org distribution role, github-api-handler and the sync-gitee feed).
Node >= 20, no dependencies.

## Layout
- `site.config.json` – brand/URLs (edit here only)
- `content/` – source of truth: `release.json` (latest, slim client schema), `history/<tag>.json`, `checksums/<tag>.txt`, `releases/<tag>/` (optional mirrored binaries)
- `bin/publish-release.js` – ingest a release, update `content/`, rebuild
- `bin/build.js` – `content/` -> `dist/` (`index.html`, `history.html`, `version.html`, `version-android.html`, `data/anubis-release.json` + identical alias `data/anubis-github-release.json` (the name the client reads; `releaseFiles` in `site.config.json`), `data/history.json`, `releases/<tag>/SHA256SUMS`, `scripts/one-line-web.{sh,bat}`, `_headers`)
- `bin/serve.js` – Node server (static + `?src=` filter)
- `nginx/nginx.conf`, `docker-compose.yml` – nginx + filter service
- `wrangler.toml`, `worker/worker.js` – Cloudflare alternative (manual `npx wrangler deploy`)

## Clone and prepare release metadata

```sh
git clone https://github.com/Anubis-Security-Tool/anubis-site.git
cd anubis-site
gh api repos/Anubis-Security-Tool/anubis/releases/latest > release-input.json
node bin/publish-release.js release-input.json
```

GitHub CLI is needed only for that metadata-fetch example; a reviewed GitHub
release API/webhook JSON file can also be supplied directly. No npm dependency
installation is needed. Generated `content/`, mirrored release binaries and
`dist/` are local deployment state, not checked-in current-release snapshots.
Always ingest the actual published release before building/deploying the site.
Never use an upstream test fixture as the production release feed.

## Publish
```
node bin/publish-release.js release.json --stars 100          # GitHub release API/webhook JSON
node bin/publish-release.js ./out/v1.2.3 --tag v1.2.3 --copy  # dir of artifacts: sizes + SHA-256 computed, files mirrored
node bin/publish-release.js old.json --no-latest              # history only
```
Options: `--rewrite-urls` (point assets at `downloadBase`), `--checksums FILE`, `--android-version`, `--no-build`, `--content`, `--out`.
From CI: run it on the `release: published` payload (or `gh release view --json`), then rsync `dist/` to the host.

## Serve
- Docker: `docker compose up -d` (nginx on :8080; requests with `?src=` are proxied to the filter service).
- Node only: `node bin/serve.js --port 3001`.
- Cloudflare: `npm run build && npx wrangler deploy` (not run automatically).

The nginx example handles the `?src=` filter on both release-JSON aliases.
It also redirects the bare `anubis.locker` hostname to the download hub; TLS
termination must cover that hostname as well as the download/update hosts.
This is a distribution landing page, not a separate marketing website.

Release ingestion preserves SHA-256 `digest` values and an existing
`windows_machine_host: 1` declaration on the Windows x64 installer. Supply
that declaration only after actual machine-host installation acceptance;
the generator does not infer acceptance from a successful build or add the
flag to raw GitHub metadata. A declaration without a valid digest, or on
another asset type, is rejected.

`?src=win-arm64.tar.gz` filters `release.assets` (full name, version-less key, stem, then suffix; `.blockmap` excluded unless requested; no match -> `assets: []`). A filter example does not imply that the current release contains that architecture. The client must be configured with homepage/base `https://update.anubis.locker` and the file name `anubis-github-release.json` (`anubis-release.json` is kept as an identical alias).

Use the independent Node publisher in this repository from the release CI.
The historical `github-api-handler-go` repository has no explicit license and
is not redistributed or required by this project.

The `anubis-security-tool` shell/batch wrappers install Desktop release
binaries. The `one-line-web` wrappers deploy standalone Web from source; they
are not full Desktop-suite source installers. The main
[anubis repository](https://github.com/Anubis-Security-Tool/anubis) documents the
complete, version-pinned Desktop + Web + Sync source workflow.

## Test
`npm test` (generator + filter against the upstream sample in `test/fixtures`).
