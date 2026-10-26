import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function regularFiles(root, relative) {
  const location = join(root, relative);
  const entry = await lstat(location);
  if (entry.isSymbolicLink()) throw new Error(`Symlink refused: ${relative}`);
  if (entry.isFile()) return [relative];
  if (!entry.isDirectory()) throw new Error(`Unsupported entry: ${relative}`);
  const files = await Promise.all((await readdir(location)).sort().map(name => regularFiles(root, `${relative}/${name}`)));
  return files.flat();
}

// This contract comes from the approved deploy SHA, never from the candidate.
// Exact source/dependency equivalence is deliberately stricter than a marker
// or a textual search for session_version. No candidate code is executed.
export async function verifySessionRecovery(release, contractPath) {
  for (const directory of ['backend', 'database', 'database/migrations']) {
    const entry = await lstat(join(release, directory));
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Unsafe release directory: ${directory}`);
  }
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  if (contract.version !== 1 || !contract.files || Object.keys(contract.files).length < 1) {
    throw new Error('Unsupported or empty session recovery contract');
  }
  const expected = Object.keys(contract.files).sort();
  const actual = (await Promise.all([
    'backend/src', 'backend/package.json', 'backend/package-lock.json',
    'database/migrations/022_user_session_version.sql',
  ].map(path => regularFiles(release, path)))).flat().sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unapproved backend file inventory');
  for (const path of expected) {
    const content = (await readFile(join(release, path), 'utf8')).replaceAll('\r\n', '\n');
    const digest = createHash('sha256').update(content, 'utf8').digest('hex');
    if (digest !== contract.files[path]) throw new Error(`Unapproved session recovery file: ${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifySessionRecovery(process.argv[2], process.argv[3])
    .then(() => console.log('Session recovery compatibility verified.'))
    .catch(error => { console.error(`Session recovery refused: ${error.message}`); process.exitCode = 1; });
}
