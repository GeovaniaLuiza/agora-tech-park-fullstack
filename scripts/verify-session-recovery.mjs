import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, open, readFile, readdir } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
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

export const recoveryReadinessChecks = Object.freeze([
  'databasePermissions', 'isolatedRestore', 'serviceReadability',
  'revocationReplay', 'dependenciesInstalled',
]);

// Operational approval belongs to the deployment identity (root under SSM),
// outside the release. It attests rehearsal; it never replaces source checks.
async function readRecoveryApproval(approvalPath) {
  const handle = await open(approvalPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let content;
  try {
    const entry = await handle.stat();
    const uid = process.getuid?.() ?? 0;
    if (!entry.isFile() || entry.uid !== uid || (entry.mode & 0o077) !== 0) {
      throw new Error('Recovery approval must be a private regular file owned by the deployment identity');
    }
    content = await handle.readFile('utf8');
  } finally { await handle.close(); }
  try { return JSON.parse(content); }
  catch { throw new Error('Malformed operational recovery approval'); }
}

export async function verifyPreparedSessionRecovery(release, contractPath, approvalPath) {
  const approval = await readRecoveryApproval(approvalPath);
  const contractSha256 = createHash('sha256').update(await readFile(contractPath)).digest('hex');
  const recoverySha = basename(resolve(release));
  if (approval.version !== 1 || !/^[0-9a-f]{40}$/.test(recoverySha)
    || approval.recoverySha !== recoverySha || approval.contractSha256 !== contractSha256
    || typeof approval.evidence !== 'string' || !approval.evidence.trim()
    || !recoveryReadinessChecks.every(check => approval.checks?.[check] === true)) {
    throw new Error('Recovery approval is missing, stale or incomplete');
  }
  await verifySessionRecovery(release, contractPath);
  for (const path of ['backend/node_modules', 'frontend', 'frontend/dist']) {
    const directory = await lstat(join(release, path));
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error(`Unprepared recovery directory: ${path}`);
  }
  for (const path of ['backend/.env', 'frontend/dist/index.html', 'frontend/dist/release.json']) {
    await access(join(release, path));
  }
  const manifest = JSON.parse(await readFile(join(release, 'backend/package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(release, 'backend/package-lock.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies || {})) {
    let installed;
    try {
      installed = JSON.parse(await readFile(join(release, 'backend/node_modules', name, 'package.json'), 'utf8'));
    } catch {
      throw new Error(`Recovery dependency metadata is unavailable or invalid: ${name}`);
    }
    if (!lock.packages?.[`node_modules/${name}`]?.version
      || installed.version !== lock.packages[`node_modules/${name}`].version) {
      throw new Error(`Recovery dependency does not match the approved lockfile: ${name}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const verification = process.argv[4]
    ? verifyPreparedSessionRecovery(process.argv[2], process.argv[3], process.argv[4])
    : verifySessionRecovery(process.argv[2], process.argv[3]);
  verification
    .then(() => console.log('Session recovery compatibility verified.'))
    .catch(error => { console.error(`Session recovery refused: ${error.message}`); process.exitCode = 1; });
}
