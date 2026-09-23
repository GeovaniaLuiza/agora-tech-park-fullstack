import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function productionOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an HTTPS origin.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' || url.origin !== value.replace(/\/$/, '')) {
    throw new Error(`${name} must be an HTTPS origin without a path or credentials.`);
  }
  return url.origin;
}

async function requireResponse(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, { ...options, redirect: 'follow', signal: controller.signal });
    if (response.status !== 200 || (response.url && new URL(response.url).origin !== new URL(url).origin)) {
      throw new Error(`${url} returned HTTP ${response.status} or redirected to another origin.`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function assetUrl(html, pattern, frontendUrl, kind) {
  const match = html.match(pattern);
  if (!match) throw new Error(`Frontend HTML has no ${kind} asset.`);
  const url = new URL(match[1], frontendUrl);
  if (url.origin !== frontendUrl || !url.pathname.startsWith('/assets/')) {
    throw new Error(`${kind} asset is not served by the production origin.`);
  }
  return url.href;
}

function assertAppHtml(html) {
  if (!/<!doctype html/i.test(html) || !/<div\s+id=["']root["']/i.test(html)) {
    throw new Error('Frontend did not return the expected React application HTML.');
  }
}

export async function runSmoke(env = process.env, fetchImpl = fetch) {
  const apiUrl = productionOrigin(env.API_URL, 'API_URL');
  const frontendUrl = productionOrigin(env.FRONTEND_URL, 'FRONTEND_URL');
  if (apiUrl !== frontendUrl) throw new Error('API_URL and FRONTEND_URL must share the Caddy origin.');
  if (!SHA_PATTERN.test(env.RELEASE_SHA || '')) throw new Error('RELEASE_SHA must be a full commit SHA.');
  if (Boolean(env.SMOKE_EMAIL) !== Boolean(env.SMOKE_PASSWORD)) {
    throw new Error('SMOKE_EMAIL and SMOKE_PASSWORD must be configured together.');
  }

  for (const path of ['/api/health', '/api/health/ready']) {
    const health = await requireResponse(fetchImpl, `${apiUrl}${path}`);
    const body = await health.json();
    if (body.status !== 'ok' || body.services?.database !== 'up') {
      throw new Error(`${path} did not report a ready PostgreSQL connection.`);
    }
  }

  const frontend = await requireResponse(fetchImpl, frontendUrl);
  const html = await frontend.text();
  assertAppHtml(html);
  const deepRoute = await requireResponse(fetchImpl, `${frontendUrl}/login`);
  assertAppHtml(await deepRoute.text());

  for (const [kind, pattern, contentType] of [
    ['JavaScript', /<script\b[^>]*\bsrc=["']([^"']+\.js)["']/i, /^(?:text|application)\/javascript/i],
    ['CSS', /<link\b[^>]*\bhref=["']([^"']+\.css)["']/i, /^text\/css/i],
  ]) {
    const url = assetUrl(html, pattern, frontendUrl, kind);
    const response = await requireResponse(fetchImpl, url);
    if (!contentType.test(response.headers.get('content-type') || '') || !(await response.text()).trim()) {
      throw new Error(`${kind} asset has an invalid content type or is empty.`);
    }
  }

  const release = await requireResponse(fetchImpl, `${frontendUrl}/release.json`, {
    headers: { 'cache-control': 'no-cache' },
  });
  if (!/^application\/json/i.test(release.headers.get('content-type') || '')) {
    throw new Error('release.json was not served as JSON.');
  }
  const marker = await release.json();
  if (marker.sha !== env.RELEASE_SHA) {
    throw new Error(`Published frontend SHA ${marker.sha || 'missing'} differs from expected SHA ${env.RELEASE_SHA}.`);
  }

  if (env.SMOKE_EMAIL && env.SMOKE_PASSWORD) {
    const login = await requireResponse(fetchImpl, `${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD }),
    });
    const body = await login.json();
    const token = body.token || body.accessToken;
    if (!token) throw new Error('Smoke login did not return a token.');
    const me = await requireResponse(fetchImpl, `${apiUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!(await me.json()).user) throw new Error('Authenticated smoke request did not return a user.');
  } else {
    console.log('Smoke credentials absent; authenticated checks skipped.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSmoke()
    .then(() => console.log('Production smoke tests passed.'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
