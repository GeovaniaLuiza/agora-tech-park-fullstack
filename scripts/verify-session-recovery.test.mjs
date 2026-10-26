import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySessionRecovery } from './verify-session-recovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const contractPath = join(root, 'deploy/aws/session-recovery-contract.json');
const contract = JSON.parse(await readFile(contractPath, 'utf8'));

async function candidate(t) {
  const directory = await mkdtemp(join(tmpdir(), 'agora-recovery-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const path of Object.keys(contract.files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), await readFile(join(root, path)));
  }
  return directory;
}

test('the reviewed backend satisfies the trusted contract without executing candidate code', async () => {
  await assert.doesNotReject(verifySessionRecovery(root, contractPath));
  assert.equal(contract.reviewedBackendCommit, '08b7ae3d67103ceb0a8f9c2082b32e8d48dd412f');
  assert.ok(Object.keys(contract.files).includes('backend/src/server.js'));
});

test('rejects the pre-advisory dependency manifest even when revocation source is unchanged', async (t) => {
  const directory = await candidate(t);
  const path = join(directory, 'backend/package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.dependencies.zod = '^4.6.5';
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(verifySessionRecovery(directory, contractPath), /Unapproved session recovery file: backend\/package.json/);
});

for (const path of [
  'backend/src/middlewares/auth.js', 'backend/src/repositories/userRepository.js',
  'backend/src/repositories/passwordResetRepository.js', 'backend/src/server.js',
  'backend/src/controllers/authController.js', 'backend/package-lock.json',
  'database/migrations/022_user_session_version.sql',
]) {
  test(`rejects changed recovery behavior/dependencies: ${path}`, async (t) => {
    const directory = await candidate(t);
    await writeFile(join(directory, path), 'throw new Error("candidate must never execute");\n');
    await assert.rejects(verifySessionRecovery(directory, contractPath), /Unapproved session recovery file/);
    assert.ok(await readFile(join(directory, 'database/migrations/022_user_session_version.sql')));
  });
}

test('migration and a self-declared compatibility marker cannot approve a legacy backend', async (t) => {
  const directory = await candidate(t);
  await writeFile(join(directory, 'backend/src/middlewares/auth.js'), 'export const authenticate = (_req, _res, next) => next();\n');
  await writeFile(join(directory, 'session-recovery-contract.json'), JSON.stringify(contract));
  await assert.rejects(verifySessionRecovery(directory, contractPath), /middlewares\/auth.js/);
});

test('rejects extra backend code even if ignored by Git', async (t) => {
  const directory = await candidate(t);
  await writeFile(join(directory, 'backend/src/extra.cjs'), 'module.exports = {};');
  await assert.rejects(verifySessionRecovery(directory, contractPath), /file inventory/);
});

test('missing startup guard is incompatible', async (t) => {
  const directory = await candidate(t);
  await rm(join(directory, 'backend/src/config/sessionSchema.js'));
  await assert.rejects(verifySessionRecovery(directory, contractPath), /file inventory/);
});

test('rejects redirected backend directories', async (t) => {
  const directory = await candidate(t);
  await rm(join(directory, 'backend'), { recursive: true });
  await symlink(join(root, 'backend'), join(directory, 'backend'), 'junction');
  await assert.rejects(verifySessionRecovery(directory, contractPath), /Unsafe release directory/);
});

test('malformed/empty policy fails closed', async (t) => {
  const directory = await candidate(t);
  const policy = join(directory, 'bad-contract.json');
  await writeFile(policy, '{"version":1,"files":{}}');
  await assert.rejects(verifySessionRecovery(directory, policy), /Unsupported or empty/);
});
