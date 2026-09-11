import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const script = await readFile(new URL('../deploy/aws/deploy-backend.sh', import.meta.url), 'utf8');
const backup = script.match(/^PGDATABASE=.*\r?\n(?:.*\r?\n)*?test -s "\$BACKUP_FILE"/m)?.[0];
assert.ok(backup, 'Backup pipeline must be present in the deployment script');
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

for (const scenario of ['success', 'dump failure', 'gzip failure']) {
  test(`pre-deploy backup: ${scenario}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'agora-backup-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    // Execute only the real backup fragment in isolation, with simulated pg_dump.
    // No AWS calls, database connection, migration or service restart is possible.
    const result = spawnSync(shell, ['-c', [
      'set -Eeuo pipefail',
      'DATABASE_URL=postgresql://test:unused@127.0.0.1:1/isolated',
      'BACKUP_FILE=backup.sql.gz',
      `pg_dump() { printf '%s\\n' 'CREATE TABLE backup_test (id integer);'; return ${scenario === 'dump failure' ? 1 : 0}; }`,
      scenario === 'gzip failure' ? 'gzip() { return 1; }' : '',
      backup.replaceAll('\r', ''),
      'echo backup-accepted',
    ].join('\n')], { cwd: directory, encoding: 'utf8' });
    assert.ifError(result.error);
    if (scenario === 'success') {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /backup-accepted/);
      assert.match(gunzipSync(await readFile(join(directory, 'backup.sql.gz'))).toString(), /CREATE TABLE backup_test/);
    } else {
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout, /backup-accepted/);
    }
  });
}
