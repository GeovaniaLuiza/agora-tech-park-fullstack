import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const localAddress = /(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|\[::\])|https?:\/\/(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?=[:/\s"'`]|$)/i;

export async function validateFrontendArtifact(directory, expectedUrl) {
  const isSameOrigin = expectedUrl === '/api';
  if (!isSameOrigin) {
    let url;
    try { url = new URL(expectedUrl); } catch { throw new Error('VITE_API_URL must be exactly /api or an absolute HTTPS API URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/api' || localAddress.test(url.href)) {
      throw new Error('VITE_API_URL must be exactly /api or a public HTTPS URL with pathname /api, without credentials.');
    }
  }

  await readFile(resolve(directory, 'index.html'));
  let found = false;
  async function inspect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Frontend artifact must not contain symbolic links.');
      if (entry.isDirectory()) { await inspect(path); continue; }
      if (!['.js', '.mjs', '.html', '.css', '.json', '.map'].includes(extname(path))) continue;
      const content = await readFile(path, 'utf8');
      if (localAddress.test(content)) throw new Error('Frontend artifact contains a forbidden development address.');
      if (['.js', '.mjs'].includes(extname(path))
        && ['"', "'", '`'].some((quote) => content.includes(`${quote}${expectedUrl}${quote}`))) found = true;
    }
  }
  await inspect(resolve(directory));
  if (!found) throw new Error('Expected VITE_API_URL was not found in the frontend JavaScript artifact.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateFrontendArtifact(process.argv[2] || 'frontend/dist', process.env.VITE_API_URL)
    .then(() => console.info('Frontend artifact validated: expected API base present; no development addresses.'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
