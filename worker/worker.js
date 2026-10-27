import { filterRelease } from '../lib/filter.js'

const PREFIX = 'anubis'
const RELEASE_PATHS = ['/data/anubis-release.json']

export default {
  async fetch (request, env) {
    const url = new URL(request.url)
    if (RELEASE_PATHS.includes(url.pathname)) {
      const res = await env.ASSETS.fetch(new Request(url.origin + url.pathname, request))
      if (!res.ok) return res
      const data = await res.json()
      const out = filterRelease(data, url.searchParams.get('src'), PREFIX)
      return new Response(JSON.stringify(out), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff'
        }
      })
    }
    return env.ASSETS.fetch(request)
  }
}
