import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFrontendArtifact } from './validate-frontend-artifact.mjs';

const expected = 'https://production.example.org/api';
async function artifact(t, javascript) {
  const directory = await mkdtemp(join(tmpdir(), 'agora-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<script src="/assets/app.js"></script>');
  await writeFile(join(directory, 'assets/app.js'), javascript);
  return directory;
}

test('accepts production URL in emitted JavaScript', async (t) => {
  for (const quote of ['"', "'", '`']) {
    await validateFrontendArtifact(await artifact(t, `fetch(${quote}${expected}${quote})`), expected);
  }
});

for (const address of ['http://localhost:3002/api', 'http://127.0.0.1:3000/api', 'http://0.0.0.0:3000/api', 'http://[::1]:3000/api', 'http://192.168.1.10:3002/api', 'http://10.0.0.1/api', 'http://172.16.0.1/api']) {
  test(`rejects development address ${address} even alongside expected URL`, async (t) => {
    const directory = await artifact(t, `fetch("${expected}"); fetch("${address}")`);
    await assert.rejects(validateFrontendArtifact(directory, expected), /forbidden/);
  });
}

test('rejects wrong URL, relative URL and prefix-only matches in bundle', async (t) => {
  for (const value of ['https://wrong.example.org/api', '/api', `${expected}-wrong`]) {
    await assert.rejects(validateFrontendArtifact(await artifact(t, `fetch("${value}")`), expected), /not found/);
  }
});

test('HTML metadata cannot substitute for the URL in JavaScript', async (t) => {
  const directory = await artifact(t, 'fetch("/api")');
  await writeFile(join(directory, 'index.html'), expected);
  await assert.rejects(validateFrontendArtifact(directory, expected), /not found/);
});

test('rejects absent, local, insecure or credential-bearing expected URL', async (t) => {
  const directory = await artifact(t, `fetch("${expected}")`);
  for (const value of [undefined, '', '/api', 'http://production.example.org/api', 'https://localhost/api', 'https://2130706433/api', 'https://user:secret@production.example.org/api', `${expected}?token=secret`]) {
    await assert.rejects(validateFrontendArtifact(directory, value), /VITE_API_URL/);
  }
});

test('rejects missing index and checks nested assets', async (t) => {
  const directory = await artifact(t, `fetch("${expected}")`);
  await writeFile(join(directory, 'assets/dev.json'), '"http://localhost:5174"');
  await assert.rejects(validateFrontendArtifact(directory, expected), /forbidden/);
  await rm(join(directory, 'index.html'));
  await assert.rejects(validateFrontendArtifact(directory, expected), /ENOENT/);
});
