import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPreparedSessionRecovery, verifySessionRecovery } from './verify-session-recovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const contractPath = join(root, 'deploy/aws/session-recovery-contract.json');
const contract = JSON.parse(await readFile(contractPath, 'utf8'));

async function candidate(t, sha) {
  const workspace = await mkdtemp(join(tmpdir(), 'agora-recovery-contract-'));
  const directory = sha ? join(workspace, sha) : workspace;
  t.after(() => rm(workspace, { recursive: true, force: true }));
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

async function preparedCandidate(t) {
  const recoverySha = 'd'.repeat(40);
  const directory = await candidate(t, recoverySha);
  await mkdir(join(directory, 'backend/node_modules'), { recursive: true });
  const manifest = JSON.parse(await readFile(join(directory, 'backend/package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(directory, 'backend/package-lock.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) {
    const path = join(directory, 'backend/node_modules', name, 'package.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ version: lock.packages[`node_modules/${name}`].version }));
  }
  await mkdir(join(directory, 'frontend/dist'), { recursive: true });
  await writeFile(join(directory, 'backend/.env'), 'ISOLATED_FIXTURE=true\n');
  await writeFile(join(directory, 'frontend/dist/index.html'), '<html></html>');
  await writeFile(join(directory, 'frontend/dist/release.json'), JSON.stringify({ sha: recoverySha }));
  const approvalPath = join(dirname(directory), 'approval.json');
  const approval = {
    version: 1, recoverySha, evidence: 'isolated-recovery-report',
    contractSha256: createHash('sha256').update(await readFile(contractPath)).digest('hex'),
    checks: { databasePermissions: true, isolatedRestore: true, serviceReadability: true,
      revocationReplay: true, dependenciesInstalled: true },
  };
  await writeFile(approvalPath, JSON.stringify(approval), { mode: 0o600 });
  return { directory, approvalPath, approval };
}

test('prepared recovery requires operational approval and installed direct dependency versions', async (t) => {
  const { directory, approvalPath } = await preparedCandidate(t);
  await assert.doesNotReject(verifyPreparedSessionRecovery(directory, contractPath, approvalPath));
});

for (const condition of ['missing', 'wrong-sha', 'wrong-policy', 'missing-check', 'missing-evidence', 'malformed', 'public', 'symlink', 'missing-env', 'missing-dependencies', 'wrong-dependency', 'invalid-dependency', 'changed-code']) {
  test(`prepared recovery refuses ${condition}`, async (t) => {
    const { directory, approvalPath, approval } = await preparedCandidate(t);
    if (condition === 'wrong-sha') approval.recoverySha = 'e'.repeat(40);
    if (condition === 'wrong-policy') approval.contractSha256 = '0'.repeat(64);
    if (condition === 'missing-check') delete approval.checks.isolatedRestore;
    if (condition === 'missing-evidence') delete approval.evidence;
    await writeFile(approvalPath, JSON.stringify(approval));
    if (condition === 'missing') await rm(approvalPath);
    if (condition === 'malformed') await writeFile(approvalPath, '{invalid');
    if (condition === 'public') await chmod(approvalPath, 0o644);
    if (condition === 'symlink') {
      const target = `${approvalPath}.target`;
      await writeFile(target, JSON.stringify(approval), { mode: 0o600 });
      await rm(approvalPath);
      await symlink(target, approvalPath, 'file');
    }
    if (condition === 'missing-env') await rm(join(directory, 'backend/.env'));
    if (condition === 'missing-dependencies') await rm(join(directory, 'backend/node_modules'), { recursive: true });
    if (condition === 'wrong-dependency') await writeFile(join(directory, 'backend/node_modules/zod/package.json'), '{"version":"4.6.5"}');
    if (condition === 'invalid-dependency') await writeFile(join(directory, 'backend/node_modules/zod/package.json'), 'SENSITIVE_FIXTURE_SENTINEL');
    if (condition === 'changed-code') await writeFile(join(directory, 'backend/src/server.js'), 'throw new Error("must not execute");');
    await assert.rejects(verifyPreparedSessionRecovery(directory, contractPath, approvalPath), error => {
      assert.doesNotMatch(error.message, /SENSITIVE/);
      return true;
    });
  });
}
