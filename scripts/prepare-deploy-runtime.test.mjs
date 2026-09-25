import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  REPOSITORY_URL,
  RUNTIME_PATH,
  buildBootstrapScript,
  buildInvocation,
  buildSsmParameters,
} from './prepare-deploy-runtime.mjs';

const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const bootstrap = buildBootstrapScript();

// Records the arguments and the path of the copy that actually executed.
const runtimeStub = `#!/usr/bin/env bash
printf '%s|%s|%s\\n' "\${1:-}" "\${2:-}" "\${BASH_SOURCE[0]}" > "\${AGORA_RUNTIME_MARKER:?}"
`;

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agora-runtime-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'bootstrap.sh'), bootstrap, 'utf8');
  return root;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

async function createOrigin(root, { runtime = runtimeStub, includeRuntime = true } = {}) {
  const origin = join(root, 'origin');
  await mkdir(join(origin, 'deploy', 'aws'), { recursive: true });
  await writeFile(join(origin, 'README.md'), 'agora\n', 'utf8');
  if (includeRuntime) await writeFile(join(origin, RUNTIME_PATH), runtime, 'utf8');
  git(origin, ['init', '--quiet', '.']);
  git(origin, ['add', '-A']);
  git(origin, ['-c', 'user.email=ci@example.com', '-c', 'user.name=CI', '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', 'release']);
  return { sha: git(origin, ['rev-parse', 'HEAD']), url: pathToFileURL(origin).href };
}

async function runBootstrap(root, { sha, action = 'deploy', url = REPOSITORY_URL, shimDir }) {
  await mkdir(join(root, 'tmp'), { recursive: true });
  const driver = [
    'set -Eeuo pipefail',
    'real_git="$(command -v git)"',
    'export AGORA_RELEASE_SHA="$1" AGORA_DEPLOY_ACTION="$2" REPOSITORY_URL="$3"',
    'export TMPDIR="$4" AGORA_RUNTIME_MARKER="$5"',
    'export PATH="$6:$PATH" REAL_GIT="$real_git"',
    'bash "$7/bootstrap.sh"',
  ].join('\n');
  return spawnSync(shell, ['-c', driver, 'agora-bootstrap',
    sha, action, url, join(root, 'tmp'), join(root, 'marker.txt'), shimDir || root, root],
  { encoding: 'utf8', cwd: root });
}

async function marker(root) {
  try {
    return (await readFile(join(root, 'marker.txt'), 'utf8')).trim();
  } catch {
    return null;
  }
}

async function leftovers(root) {
  return readdir(join(root, 'tmp'));
}

async function assertCleanup(root) {
  assert.deepEqual(await leftovers(root), [], 'temporary runtime directory must be removed');
}

test('bootstrap runs the approved commit from a temporary directory and cleans up', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root);

  const result = await runBootstrap(root, { sha, url });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(result.stdout, new RegExp(`Fetching approved release ${sha}`));
  assert.match(result.stdout, new RegExp(`Deploy runtime validated from ${sha}; running deploy`));

  const [passedSha, passedAction, executedPath] = (await marker(root)).split('|');
  assert.equal(passedSha, sha);
  assert.equal(passedAction, 'deploy');

  assert.notEqual(executedPath, RUNTIME_PATH);
  assert.doesNotMatch(executedPath, /\/opt\/agora\/bin\//);
  assert.match(executedPath, /agora-deploy-runtime\.[A-Za-z0-9]+\/deploy-backend\.sh$/);
  await assert.rejects(stat(executedPath), 'the executed temporary copy must not survive');
  await assertCleanup(root);
});

test('rollback reuses the same temporary bootstrap', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root);

  const result = await runBootstrap(root, { sha, action: 'rollback', url });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, new RegExp(`running rollback`));

  const [passedSha, passedAction, executedPath] = (await marker(root)).split('|');
  assert.equal(passedSha, sha);
  assert.equal(passedAction, 'rollback');
  assert.match(executedPath, /agora-deploy-runtime\.[A-Za-z0-9]+\/deploy-backend\.sh$/);
  await assertCleanup(root);

  const deploy = buildInvocation({ releaseSha: sha, action: 'deploy' });
  const rollback = buildInvocation({ releaseSha: sha, action: 'rollback' });
  assert.equal(deploy.slice(deploy.indexOf('\n')), rollback.slice(rollback.indexOf('\n')));
});

test('an unfetchable approved SHA aborts before running anything', async (t) => {
  const root = await workspace(t);
  const { url } = await createOrigin(root);

  const result = await runBootstrap(root, { sha: 'f'.repeat(40), url });
  assert.notEqual(result.status, 0);
  assert.equal(await marker(root), null);
  await assertCleanup(root);
});

test('a SHA that diverges from the approved one aborts', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root);
  const shimDir = join(root, 'shim');
  await mkdir(shimDir, { recursive: true });
  await writeFile(
    join(shimDir, 'git'),
    `#!/usr/bin/env bash
for argument in "$@"; do
  if [[ "$argument" == *FETCH_HEAD* ]]; then printf '%s\\n' 'b%.0s' {1..40}; exit 0; fi
done
exec "$REAL_GIT" "$@"
`,
    { encoding: 'utf8', mode: 0o755 },
  );
  const result = await runBootstrap(root, { sha, url, shimDir });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the approved SHA/);
  assert.equal(await marker(root), null);
  await assertCleanup(root);
});

test('a commit without the deploy runtime aborts', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root, { includeRuntime: false });

  const result = await runBootstrap(root, { sha, url });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`does not contain ${RUNTIME_PATH.replaceAll('/', '\\/')}`));
  assert.equal(await marker(root), null);
  await assertCleanup(root);
});

test('an empty deploy runtime aborts', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root, { runtime: '' });

  const result = await runBootstrap(root, { sha, url });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is empty/);
  assert.equal(await marker(root), null);
  await assertCleanup(root);
});

test('invalid runtime syntax aborts before execution and still cleans up', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root, { runtime: '#!/usr/bin/env bash\nif then\n' });

  const result = await runBootstrap(root, { sha, url });
  assert.notEqual(result.status, 0);
  assert.equal(await marker(root), null, 'bash -n must reject the runtime before it runs');
  await assertCleanup(root);
});

test('a rejected runtime aborts with the deploy script exit status', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root, { runtime: '#!/usr/bin/env bash\nexit 4\n' });

  const result = await runBootstrap(root, { sha, url });
  assert.equal(result.status, 4, `${result.stdout}${result.stderr}`);
  await assertCleanup(root);
});

test('bootstrap requires a full SHA and a known action', async (t) => {
  const root = await workspace(t);
  const { sha, url } = await createOrigin(root);

  for (const invalid of ['', 'abc', 'A'.repeat(40), '0123456789abcdef0123456789abcdef0123456', null, 42]) {
    const result = await runBootstrap(root, { sha: String(invalid ?? ''), url });
    assert.notEqual(result.status, 0, `SHA ${invalid} must be rejected`);
    assert.match(result.stderr, /AGORA_RELEASE_SHA must be a full 40-character/);
  }

  const result = await runBootstrap(root, { sha, action: 'promote', url });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AGORA_DEPLOY_ACTION must be deploy or rollback/);
  await assertCleanup(root);
});

test('SSM payload carries the bootstrap, not a persistent script', () => {
  const sha = 'c'.repeat(40);
  const parameters = buildSsmParameters({ releaseSha: sha, action: 'deploy' });
  assert.deepEqual(Object.keys(parameters), ['commands']);
  assert.equal(parameters.commands.length, 1);

  const [command] = parameters.commands;
  assert.match(command, new RegExp(`^sudo env AGORA_RELEASE_SHA=${sha} AGORA_DEPLOY_ACTION=deploy bash -se <<'AGORA_DEPLOY_RUNTIME'$`, 'm'));
  assert.match(command, /AGORA_DEPLOY_RUNTIME$/);
  assert.ok(command.includes(bootstrap), 'the bootstrap travels as plain Bash');
  assert.doesNotMatch(command, /base64/);
  assert.doesNotMatch(command, /\/opt\/agora\/bin/);
  assert.doesNotMatch(command, /deploy-backend\.sh\.previous/);
  assert.doesNotMatch(command, /install /);

  const rollback = buildSsmParameters({ releaseSha: sha, action: 'rollback' }).commands[0];
  assert.match(rollback, new RegExp(`^sudo env AGORA_RELEASE_SHA=${sha} AGORA_DEPLOY_ACTION=rollback bash -se`, 'm'));
  assert.equal(rollback.slice(rollback.indexOf('\n')), command.slice(command.indexOf('\n')));
});

test('invocation rejects unsafe or incomplete input', () => {
  const sha = 'd'.repeat(40);
  assert.throws(() => buildSsmParameters({ releaseSha: sha, action: 'destroy' }), /must be deploy or rollback/);
  assert.throws(() => buildSsmParameters({ releaseSha: 'short' }), /full 40-character/);
  assert.throws(() => buildSsmParameters({ releaseSha: sha, repositoryUrl: 'https://github.com/a;rm -rf /' }),
    /scheme-qualified origin/);
  assert.throws(() => buildSsmParameters({}), /full 40-character/);
});

test('bootstrap fetches and extracts only the approved commit', () => {
  assert.match(bootstrap, /^set -Eeuo pipefail$/m);
  assert.match(bootstrap, /if \[\[ ! "\$release_sha" =~ \^\[0-9a-f\]\{40\}\$ \]\]; then/);
  assert.match(bootstrap, /repository_url="\$\{REPOSITORY_URL:-https:\/\/github\.com\/GeovaniaLuiza\/agora-tech-park-fullstack\.git\}"/);
  assert.match(bootstrap, /workdir="\$\(mktemp -d "\$\{TMPDIR:-\/tmp\}\/agora-deploy-runtime\.XXXXXX"\)"/);
  assert.match(bootstrap, /trap cleanup EXIT/);
  assert.match(bootstrap, /trap 'exit 130' INT/);
  assert.match(bootstrap, /trap 'exit 143' TERM/);
  assert.match(bootstrap, /git init --quiet "\$repository"/);
  assert.match(bootstrap, /git -C "\$repository" remote add origin "\$repository_url"/);
  assert.match(bootstrap, /git -C "\$repository" fetch --quiet --depth 1 origin "\$release_sha"/);
  assert.match(bootstrap, /resolved_sha="\$\(git -C "\$repository" rev-parse --verify --quiet 'FETCH_HEAD\^\{commit\}' \|\| true\)"/);
  assert.match(bootstrap, /if \[\[ "\$resolved_sha" != "\$release_sha" \]\]; then/);
  assert.match(bootstrap, /git -C "\$repository" show "\$release_sha:\$runtime_path" > "\$runtime"/);
  assert.match(bootstrap, /if \[\[ ! -s "\$runtime" \]\]; then/);
  assert.match(bootstrap, /^bash -n "\$runtime"$/m);
  assert.match(bootstrap, /^bash "\$runtime" "\$release_sha" "\$action"$/m);
  assert.ok(bootstrap.indexOf('bash -n "$runtime"') < bootstrap.indexOf('bash "$runtime"'),
    'syntax validation must precede execution');
});

test('bootstrap has no moving reference and no persistent fallback', () => {
  assert.doesNotMatch(bootstrap, /\/opt\/agora\/bin/);
  assert.doesNotMatch(bootstrap, /deploy-backend\.sh\.previous/);
  assert.doesNotMatch(bootstrap, /\bbase64\b/);
  assert.doesNotMatch(bootstrap, /origin\/(?:main|master|HEAD)/);
  assert.doesNotMatch(bootstrap, /\blatest\b/);
  assert.doesNotMatch(bootstrap, /git (?:fetch|pull|clone|checkout)[\s\S]{0,80}\bmain\b/);
  assert.doesNotMatch(bootstrap, /--branch/);
  assert.doesNotMatch(bootstrap, /\b(?:cp|mv|install|ln)\b[^\n]*deploy-backend\.sh/);
});

test('the committed deploy runtime is present and syntactically valid', async () => {
  const source = await readFile(new URL(`../${RUNTIME_PATH}`, import.meta.url));
  assert.ok(source.length > 0, `${RUNTIME_PATH} must not be empty`);
  const check = spawnSync(shell, ['-n', new URL(`../${RUNTIME_PATH}`, import.meta.url).pathname.replace(/^\//, '')],
    { encoding: 'utf8', cwd: process.cwd() });
  assert.equal(check.status, 0, `${RUNTIME_PATH}: ${check.stderr}`);
  assert.doesNotMatch(source.toString('utf8'), /\/opt\/agora\/bin/);
});

test('production CD never reaches the persistent runtime', async () => {
  const workflow = await readFile(new URL('../.github/workflows/cd-production.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /\/opt\/agora\/bin\/deploy-backend\.sh/);
  assert.doesNotMatch(workflow, /deploy-backend\.sh\.previous/);
  assert.doesNotMatch(workflow, /base64/);
  assert.match(workflow, /\[\[ "\$RELEASE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(workflow, /node scripts\/prepare-deploy-runtime\.mjs deploy/);
  assert.match(workflow, /node scripts\/prepare-deploy-runtime\.mjs rollback/);
  assert.doesNotMatch(workflow, /jq -cn --arg command/);
});
