import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke } from './smoke-test.mjs';

const origin = 'https://agora.example.org';
const sha = 'a'.repeat(40);
const html = '<!doctype html><html><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></html><div id="root"></div>';
const env = { API_URL: origin, FRONTEND_URL: origin, RELEASE_SHA: sha };

function response(url, body, type = 'application/json', status = 200) {
  return {
    url, status,
    headers: { get: (name) => name === 'content-type' ? type : null },
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function fakeFetch({ marker = sha, missingAsset = false, login = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/health') || url.endsWith('/api/health/ready')) {
      return response(url, { status: 'ok', services: { database: 'up' } });
    }
    if (url === origin || url === `${origin}/login`) return response(url, html, 'text/html');
    if (url.endsWith('/assets/app.js')) return response(url, missingAsset ? html : 'console.log("app")', missingAsset ? 'text/html' : 'text/javascript');
    if (url.endsWith('/assets/app.css')) return response(url, 'body{}', 'text/css');
    if (url.endsWith('/release.json')) return response(url, { sha: marker });
    if (login && url.endsWith('/api/auth/login')) return response(url, { token: 'test-token' });
    if (login && url.endsWith('/api/auth/me')) return response(url, { user: { id: 1 } });
    throw new Error(`Unexpected request: ${url}`);
  };
  return { fetchImpl, calls };
}

test('smoke checks public frontend, assets, API readiness and published SHA', async () => {
  const { fetchImpl, calls } = fakeFetch();
  await runSmoke(env, fetchImpl);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    '/api/health', '/api/health/ready', '/', '/login', '/assets/app.js',
    '/assets/app.css', '/release.json',
  ]);
  assert.equal(calls.at(-1).options.headers['cache-control'], 'no-cache');
});

test('smoke checks login and an authenticated request when credentials exist', async () => {
  const { fetchImpl, calls } = fakeFetch({ login: true });
  await runSmoke({ ...env, SMOKE_EMAIL: 'smoke@example.org', SMOKE_PASSWORD: 'test-password' }, fetchImpl);
  assert.equal(calls.at(-1).url, `${origin}/api/auth/me`);
  assert.equal(calls.at(-1).options.headers.authorization, 'Bearer test-token');
});

test('smoke rejects a different published SHA', async () => {
  await assert.rejects(runSmoke(env, fakeFetch({ marker: 'b'.repeat(40) }).fetchImpl), /differs from expected SHA/);
});

test('smoke rejects SPA fallback returned for a missing JS asset', async () => {
  await assert.rejects(runSmoke(env, fakeFetch({ missingAsset: true }).fetchImpl), /invalid content type/);
});

test('smoke requires one HTTPS origin and full SHA', async () => {
  const { fetchImpl } = fakeFetch();
  await assert.rejects(runSmoke({ ...env, FRONTEND_URL: 'http://agora.example.org' }, fetchImpl), /HTTPS origin/);
  await assert.rejects(runSmoke({ ...env, RELEASE_SHA: 'short' }, fetchImpl), /full commit SHA/);
});
