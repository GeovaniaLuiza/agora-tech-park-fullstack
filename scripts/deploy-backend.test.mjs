import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const windows = process.platform === 'win32';
const shell = windows ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const source = (await readFile(new URL('../deploy/aws/deploy-backend.sh', import.meta.url), 'utf8')).replaceAll('\r', '');
// Relocate the allowed root and verifier in the isolated copy; production keeps
// its /opt restriction and the SHA-bound runtime layout.
const guard = '[[ ! "$APP_ROOT" =~ ^/opt/[a-zA-Z0-9._-]+$ ]]';
assert.ok(source.includes(guard));
const isolated = source.replace(guard, '[[ "$APP_ROOT" != "$TEST_ROOT" ]]')
  .replace('$RUNTIME_DIR/../../scripts/verify-session-recovery.mjs', '$RUNTIME_DIR/verify-session-recovery.mjs');
const fixtureFiles = {
  'backend/src/server.js': 'original\n', 'backend/package.json': '{}\n',
  'backend/package-lock.json': '{}\n', 'database/migrations/022_user_session_version.sql': '-- fixture session version\n',
};
const fixtureContract = { version: 1, files: Object.fromEntries(Object.entries(fixtureFiles)
  .map(([path, text]) => [path, createHash('sha256').update(text).digest('hex')])) };
const workflow = (await readFile(new URL('../.github/workflows/cd-production.yml', import.meta.url), 'utf8')).replaceAll('\r', '');
const smokeDriver = workflow.split('      - name: Production smoke tests\n        run: |\n')[1]
  .split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
assert.ok(smokeDriver.includes('prepare-deploy-runtime.mjs rollback'));
const verifier = await readFile(new URL('./verify-session-recovery.mjs', import.meta.url), 'utf8');
const approvalFixture = `import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
const [path, release, policy] = process.argv.slice(2);
await writeFile(path, JSON.stringify({ version: 1, recoverySha: basename(release), evidence: 'isolated-test-rehearsal',
  contractSha256: createHash('sha256').update(await readFile(policy)).digest('hex'),
  checks: { databasePermissions: true, isolatedRestore: true, serviceReadability: true,
    revocationReplay: true, dependenciesInstalled: true } }), { mode: 0o600 });
`;

const harness = String.raw`
set -Eeuo pipefail
export PATH="/usr/bin:$PATH"
export TEST_ROOT="$PWD/app" APP_ROOT="$PWD/app"
export MSYS=winsymlinks:nativestrict
export TRACE="$PWD/trace" SCENARIO
mkdir -p "$APP_ROOT/shared" "$APP_ROOT/releases"
printf 'DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/isolated\n' > "$APP_ROOT/shared/backend.env"
: > "$TRACE"
fault="$SCENARIO"
if [[ -n "$FAILURE_STAGE" ]]; then fault="$FAILURE_STAGE"; fi
export fault
sha=$(printf 'a%.0s' {1..40})
previous="$APP_ROOT/releases/$(printf 'b%.0s' {1..40})"
candidate="$APP_ROOT/releases/$sha"
make_release() {
  mkdir -p "$1/backend/src"
  printf 'original\n' > "$1/backend/src/server.js"
  printf '{}\n' > "$1/backend/package.json"
  printf '{}\n' > "$1/backend/package-lock.json"
  mkdir -p "$1/database/migrations"
  printf '%s\n' '-- fixture session version' > "$1/database/migrations/022_user_session_version.sql"
}
make_joint_release() {
  make_release "$1"
  mkdir -p "$1/backend/node_modules"
  ln -s "$APP_ROOT/shared/backend.env" "$1/backend/.env"
  mkdir -p "$1/frontend/dist"
  printf '<html><body>Agora</body></html>\n' > "$1/frontend/dist/index.html"
  printf 'const api = "/api";\n' > "$1/frontend/dist/app.js"
  printf '{\n  "sha": "%s"\n}\n' "$(basename "$1")" > "$1/frontend/dist/release.json"
}
approve_recovery() {
  command node ./approve.mjs "$APP_ROOT/shared/session-recovery-approved.json" "$1" "$PWD/session-recovery-contract.json"
}
make_joint_release "$previous"
approve_recovery "$previous"
ln -s "$previous" "$APP_ROOT/current"
[[ -L "$APP_ROOT/current" ]] || { echo 'Native symlinks required for these tests'; exit 90; }
case "$SCENARIO" in
  unsafe_restart|unsafe_health|unsafe_before_migrations|unsafe_after_migrations|unsafe_after_activation|legacy_migration_only|explicit_recovery)
    printf 'legacy without revocation\n' > "$previous/backend/src/server.js"
    if [[ "$SCENARIO" != legacy_migration_only ]]; then rm "$previous/database/migrations/022_user_session_version.sql"; fi
    if [[ "$SCENARIO" == explicit_recovery ]]; then
      recovery="$APP_ROOT/releases/$(printf 'c%.0s' {1..40})"
      make_joint_release "$recovery"
      ln -s "$recovery" "$APP_ROOT/recovery"
      approve_recovery "$recovery"
    fi
    ;;
  floor_unsafe_before_migrations)
    printf 'legacy without revocation\n' > "$previous/backend/src/server.js"
    touch "$APP_ROOT/shared/session-revocation-required"
    ;;
  floor_safe_before_migrations) touch "$APP_ROOT/shared/session-revocation-required" ;;
  active*) make_joint_release "$candidate"; ln -sfn "releases/$sha" "$APP_ROOT/current" ;;
  existing) make_joint_release "$candidate" ;;
  first*) rm "$APP_ROOT/current" ;;
  rollback_joint)
    rm -rf "$previous"
    make_joint_release "$previous"
    ln -sfn "$previous" "$APP_ROOT/current"
    ;;
  rollback_command|rollback_before_activation|smoke_safe|smoke_unsafe)
    make_joint_release "$candidate"
    ln -sfn "$candidate" "$APP_ROOT/current"
    ln -s "$previous" "$APP_ROOT/previous"
    if [[ "$SCENARIO" != rollback_before_activation ]]; then touch "$APP_ROOT/shared/session-revocation-required"; fi
    if [[ "$SCENARIO" == smoke_unsafe ]]; then printf 'legacy without revocation\n' > "$previous/backend/src/server.js"; fi
    ;;
  rollback_invalid)
    make_joint_release "$candidate"
    ln -sfn "$candidate" "$APP_ROOT/current"
    ln -s "$previous" "$APP_ROOT/previous"
    rm "$previous/frontend/dist/release.json"
    touch "$APP_ROOT/shared/session-revocation-required"
    ;;
  legacy_marker)
    rm "$previous/frontend/dist/release.json"
    recovery="$APP_ROOT/releases/$(printf 'c%.0s' {1..40})"
    make_joint_release "$recovery"
    ln -s "$recovery" "$APP_ROOT/recovery"
    approve_recovery "$recovery"
    ;;
  transition_*)
    recovery="$APP_ROOT/releases/$(printf 'c%.0s' {1..40})"
    make_joint_release "$recovery"
    ln -s "$recovery" "$APP_ROOT/recovery"
    approve_recovery "$recovery"
    if [[ "$SCENARIO" == transition_legacy ]]; then
      printf 'legacy without revocation\n' > "$previous/backend/src/server.js"
      rm "$previous/database/migrations/022_user_session_version.sql"
    else
      # Reviewed authenticator source stays the same; only prior dependencies differ.
      printf '{"previousReviewedDependencies":true}\n' > "$previous/backend/package-lock.json"
      if [[ "$SCENARIO" == transition_active ]]; then
        touch "$APP_ROOT/shared/session-revocation-required"
      else
        mkdir -p "$previous/backend/src/config"
        printf 'reviewed startup guard\n' > "$previous/backend/src/config/sessionSchema.js"
      fi
    fi
    case "$fault" in
      recovery_missing) rm "$APP_ROOT/recovery" ;;
      approval_missing) rm "$APP_ROOT/shared/session-recovery-approved.json" ;;
      approval_stale) printf '{"version":1}\n' > "$APP_ROOT/shared/session-recovery-approved.json" ;;
      recovery_contract) printf 'unapproved\n' > "$recovery/backend/src/server.js" ;;
    esac
    ;;
  retention)
    touch -t 200001010000 "$previous"
    for n in {1..7}; do mkdir "$APP_ROOT/releases/old$n"; touch -t 203001010000 "$APP_ROOT/releases/old$n"; done ;;
esac
git() {
  if [[ "$1" == -C && "$3" == rev-parse ]]; then
    if [[ "$fault" == wrong_sha && "$2" == "$candidate" ]]; then printf 'b%.0s' {1..40}; echo; else basename "$2"; fi
    return 0
  fi
  echo git >> "$TRACE"
  [[ "$fault" != clone ]] || return 1
  if [[ "$SCENARIO" == concurrent && "$1" == clone ]]; then
    touch "$APP_ROOT/started"
    while [[ ! -e "$APP_ROOT/continue" ]]; do sleep 0.05; done
  fi
  if [[ "$1" == clone ]]; then
    make_release "$5"
    if [[ "$fault" == candidate_contract ]]; then printf 'unapproved\n' > "$5/backend/package-lock.json"; fi
    mkdir -p "$5/scripts" "$5/frontend"
    printf '{}\n' > "$5/frontend/package.json"
  fi
}
node() {
  if [[ "$1" == scripts/smoke-test.mjs ]]; then
    if [[ "$RELEASE_SHA" == "$sha" ]]; then echo 'simulated public smoke failure' >&2; return 1; fi
    return 0
  fi
  if [[ "$1" == scripts/prepare-deploy-runtime.mjs ]]; then printf '{}\n'; return; fi
  if [[ "$1" == *verify-session-recovery.mjs ]]; then command node "$@"; return; fi
  local script="$1"
  local dir="$2"
  local rel_dir="$candidate"
  echo "node:$(basename "$script")" >> "$TRACE"
  echo "validate_env:$VITE_API_URL" >> "$TRACE"
  case "$fault" in
    validator) return 1 ;;
    missing_dist)
      rm -rf "$rel_dir/frontend/dist"
      return 1
      ;;
    missing_index)
      rm -f "$rel_dir/frontend/dist/index.html"
      return 1
      ;;
  esac
  if [[ "$fault" == recovery_lost_before_backup ]]; then rm "$APP_ROOT/shared/session-recovery-approved.json"; fi
  [[ -d "$dir" && -f "$dir/index.html" ]] || return 1
  return 0
}
pg_dump() { echo backup >> "$TRACE"; [[ "$fault" != backup ]] || return 1; printf 'SELECT 1;\n'; }
gzip() { [[ "$fault" != gzip ]] || { command cat >/dev/null; return 1; }; command gzip "$@"; }
npm() {
  local cmd="$1"
  local target="backend"
  local rel_dir="$candidate"
  for arg in "$@"; do
    if [[ "$arg" == *frontend* ]]; then target="frontend"; fi
  done
  local step="$cmd"
  if [[ "$cmd" == run ]]; then
    step="$2"
  fi
  local event="$step"
  if [[ "$step" == ci || "$step" == build ]]; then
    event="$step:$target"
  fi
  echo "$event" >> "$TRACE"
  if [[ "$step" == build ]]; then
    echo "build_env:$VITE_API_URL" >> "$TRACE"
    if [[ "$fault" != missing_dist ]]; then
      mkdir -p "$rel_dir/frontend/dist"
      printf 'const api = "/api";\n' > "$rel_dir/frontend/dist/app.js"
      if [[ "$fault" != missing_index ]]; then
        printf '<html><body>Agora</body></html>\n' > "$rel_dir/frontend/dist/index.html"
      fi
    fi
  fi
  if [[ "$fault" == recovery_lost_before_migrate && "$step" == migrate:dry ]] \
    || [[ "$fault" == recovery_lost_after_migrate && "$step" == migrate ]]; then
    rm "$APP_ROOT/shared/session-recovery-approved.json"
  fi
  case "$fault" in
    ci) [[ "$event" != "ci:backend" ]] ;;
    "ci:frontend") [[ "$event" != "ci:frontend" ]] ;;
    build|"build:frontend") [[ "$event" != "build:frontend" ]] ;;
    "migrate:dry"|unsafe_before_migrations|floor_safe_before_migrations) [[ "$step" != "migrate:dry" ]] ;;
    migrate) [[ "$step" != migrate ]] ;;
    *) return 0 ;;
  esac
}
systemctl() {
  if [[ "$1" == stop ]]; then echo stop >> "$TRACE"; [[ "$fault" != stop ]]; return; fi
  local active count
  active=$(realpath "$APP_ROOT/current")
  echo "restart:$active" >> "$TRACE"
  count=$(grep -c '^restart:' "$TRACE")
  if [[ "$count" == 1 && "$fault" == recovery_lost_after_activation ]]; then
    rm "$APP_ROOT/shared/session-recovery-approved.json"
    return 1
  fi
  if [[ "$count" == 1 && "$fault" == recovery_changed_after_activation ]]; then
    printf 'legacy without revocation\n' > "$APP_ROOT/recovery/backend/src/server.js"
    return 1
  fi
  [[ "$fault" != restart && "$fault" != rollback_restart && "$fault" != first_restart && "$fault" != rollback_joint && "$fault" != unsafe_restart && "$fault" != explicit_recovery ]] || [[ "$count" -gt 1 && "$fault" != rollback_restart ]]
}
curl() {
  local active
  active=$(realpath "$APP_ROOT/current")
  echo "health:$active" >> "$TRACE"
  case "$fault" in
    active_bad|rollback_health|first_health) return 1 ;;
    unsafe_health|legacy_migration_only) return 1 ;;
    health|rollback_joint) [[ "$active" != "$candidate" ]] ;;
    *) return 0 ;;
  esac
}
aws() {
  if [[ "$2" == send-command ]]; then
    if bash ./deploy.sh "$sha" rollback > rollback.log 2>&1; then echo Success > rollback.status; else echo Failed > rollback.status; fi
    echo test-command-id
  elif [[ "$2" == wait ]]; then
    [[ "$(cat rollback.status)" == Success ]]
  elif [[ "$*" == *'--query Status'* ]]; then
    cat rollback.status
  else
    cat rollback.log
  fi
}
export -f aws
rm() { echo rm >> "$TRACE"; command rm "$@"; }
mv() {
  if [[ "$fault" == *after_migrations && "$*" == *current.next* ]]; then return 1; fi
  if [[ "$fault" == floor && "$*" == *session-revocation-required.next* ]]; then return 1; fi
  if [[ "$fault" == previous_link && "$*" == *previous.next* ]]; then return 1; fi
  command mv "$@" || return
  if [[ "$*" == *current.next* ]]; then echo activation >> "$TRACE"; fi
  if [[ ( "$fault" == after_activation || "$fault" == unsafe_after_activation ) && "$*" == *current.next* ]]; then return 1; fi
}
export -f git node pg_dump gzip npm systemctl curl rm mv make_release make_joint_release
export previous candidate sha
# Windows has no flock. Model contention explicitly; Linux uses the real flock.
if [[ "$SIMULATE_FLOCK" == 1 ]]; then
  flock() {
    mkdir "$APP_ROOT/held" 2>/dev/null || return 1
    trap 'rmdir "$APP_ROOT/held"' EXIT
  }
  export -f flock
fi
if [[ "$SCENARIO" == lock ]]; then
  if [[ "$SIMULATE_FLOCK" == 1 ]]; then
    mkdir "$APP_ROOT/held"
  else
    exec 8>"$APP_ROOT/deploy.lock"
    flock -n 8
  fi
fi
set +e
if [[ "$SCENARIO" == concurrent ]]; then
  bash ./deploy.sh "$sha" > first.log 2>&1 &
  first=$!
  for attempt in {1..100}; do
    [[ ! -e "$APP_ROOT/started" ]] || break
    sleep 0.05
  done
  bash ./deploy.sh "$sha" > second.log 2>&1
  second_status=$?
  echo "SECOND_STATUS:$second_status"
  cat second.log
  touch "$APP_ROOT/continue"
  wait "$first"
  status=$?
  cat first.log
else
  if [[ "$SCENARIO" == smoke_* ]]; then
    RELEASE_SHA="$sha" RUNNER_TEMP="$PWD" EC2_INSTANCE_ID=isolated-test bash ./smoke.sh
  elif [[ "$SCENARIO" == rollback_command || "$SCENARIO" == rollback_invalid || "$SCENARIO" == rollback_before_activation ]]; then
    bash ./deploy.sh "$sha" rollback
  else
    bash ./deploy.sh "$sha"
  fi
  status=$?
fi
set -e
echo "STATUS:$status"
echo "CURRENT:$(realpath -m "$APP_ROOT/current")"
echo "PREVIOUS:$previous"
echo "CANDIDATE:$candidate"
[[ ! -f "$APP_ROOT/shared/session-revocation-required" ]] || echo SESSION_FLOOR_PRESENT
[[ ! -e "$APP_ROOT/recovery" ]] || echo "RECOVERY:$(realpath "$APP_ROOT/recovery")"
if [[ -f "$APP_ROOT/current/frontend/dist/release.json" ]]; then
  echo "CURRENT_MARKER:$(grep '"sha"' "$APP_ROOT/current/frontend/dist/release.json")"
fi
[[ ! -f "$previous/backend/src/server.js" ]] || echo PREVIOUS_PRESERVED
[[ ! -f "$candidate/backend/src/server.js" ]] || echo CANDIDATE_PRESERVED
if [[ "$SCENARIO" == retention ]]; then
  echo "COUNT:$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)"
fi
cat "$TRACE"
`;

const failureStages = ['clone', 'wrong_sha', 'ci', 'ci:frontend', 'build', 'validator', 'missing_dist', 'missing_index', 'backup', 'gzip', 'migrate:dry', 'migrate'];
async function runDeployment(t, scenario, failureStage) {
  const directory = await mkdtemp(join(tmpdir(), 'agora-deploy-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [path, content] of Object.entries({
    'deploy.sh': isolated, 'smoke.sh': 'set -Eeuo pipefail\n' + smokeDriver,
    'verify-session-recovery.mjs': verifier, 'approve.mjs': approvalFixture,
    'session-recovery-contract.json': JSON.stringify(fixtureContract), 'harness.sh': harness,
  })) await writeFile(join(directory, path), content);
  const result = spawnSync(shell, ['harness.sh'], {
    cwd: directory, encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, SCENARIO: scenario, FAILURE_STAGE: failureStage || '', SIMULATE_FLOCK: windows ? '1' : '0' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return { directory, result };
}
for (const scenario of [
  'unsafe_restart', 'unsafe_health', 'unsafe_before_migrations', 'floor_unsafe_before_migrations',
  'after_migrations', 'explicit_recovery', 'smoke_safe', 'smoke_unsafe',
  'unsafe_after_migrations', 'unsafe_after_activation', 'legacy_migration_only', 'floor_safe_before_migrations',
  'new', 'active', 'active_bad', 'existing', 'clone', 'wrong_sha', 'ci', 'ci:frontend', 'build', 'validator',
  'missing_dist', 'missing_index', 'backup', 'gzip', 'migrate:dry', 'migrate',
  'restart', 'health', 'rollback_restart', 'rollback_health', 'rollback_joint',
  'rollback_command', 'rollback_invalid', 'rollback_before_activation', 'legacy_marker', 'first_restart', 'first_health', 'lock', 'concurrent', 'retention',
]) {
  test(`backend deploy: ${scenario}`, async (t) => {
    const { directory, result } = await runDeployment(t, scenario);
    const output = result.stdout;
    const trace = output.split('\n').filter(line => /^(git|backup|ci(:.*)?|build(:.*)?|node:.*|migrate(:dry)?|rm|restart:.*|health:.*)$/.test(line));
    const lifecycle = output.split('\n').filter(line => /^(stop|activation|restart:.*)$/.test(line));
    if (lifecycle.includes('activation')) {
      assert.ok(lifecycle.indexOf('stop') >= 0 && lifecycle.indexOf('stop') < lifecycle.indexOf('activation'),
        'the old API must stop before the first activation');
    }
    const value = name => output.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1];
    if (scenario === 'rollback_before_activation') {
      assert.notEqual(value('STATUS'), '0');
      assert.match(result.stderr, /Rollback before revocation activation is refused/);
      assert.deepEqual(trace, []);
      assert.deepEqual(lifecycle, []);
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.doesNotMatch(output, /SESSION_FLOOR_PRESENT/);
      return;
    }
    if (scenario.startsWith('unsafe_') || scenario.startsWith('first')
      || ['legacy_migration_only', 'floor_unsafe_before_migrations'].includes(scenario)) {
      assert.notEqual(value('STATUS'), '0');
      assert.match(result.stderr, /SESSION_DEPLOY_NOT_READY/);
      assert.deepEqual(trace, [], 'unprepared deploy must not clone, back up or migrate');
      assert.deepEqual(lifecycle, [], 'preflight must preserve the active service');
      if (!scenario.startsWith('first')) assert.equal(value('CURRENT'), value('PREVIOUS'));
      if (scenario !== 'floor_unsafe_before_migrations') assert.doesNotMatch(output, /SESSION_FLOOR_PRESENT/);
      return;
    }
    if (scenario.startsWith('unsafe_') || scenario === 'smoke_unsafe' || scenario === 'legacy_migration_only') {
      assert.ok(!trace.includes(`restart:${value('PREVIOUS')}`), 'an incompatible backend must never be restarted');
    }
    const success = ['new', 'active', 'retention', 'concurrent', 'rollback_command', 'legacy_marker'].includes(scenario);
    assert.equal(value('STATUS') === '0', success, output + result.stderr);
    if (!scenario.startsWith('first')) assert.match(output, /PREVIOUS_PRESERVED/);
    if (['active', 'active_bad', 'existing'].includes(scenario)) {
      assert.match(output, /CANDIDATE_PRESERVED/);
      assert.ok(trace.every(line => line.startsWith('health:')), trace.join('\n'));
    }
    if (scenario === 'active') assert.match(output, /already active and healthy/);
    if (scenario === 'smoke_safe') assert.match(result.stderr, /previous joint release .* restored and verified/);
    if (scenario === 'smoke_unsafe') assert.match(result.stderr, /SESSION_RECOVERY_BLOCKED_OR_FAILED/);
    if (scenario === 'rollback_command' || scenario === 'smoke_safe') {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.match(output, /Joint release restored/);
      assert.match(output, new RegExp(`^ROLLBACK_SHA=${'b'.repeat(40)}$`, 'm'));
      assert.equal(trace.filter(line => line.startsWith('restart:')).length, 1);
      assert.equal(trace.at(-1), `health:${value('PREVIOUS')}`);
      assert.match(value('CURRENT_MARKER'), new RegExp(`"sha": "${'b'.repeat(40)}"`));
    }
    if (scenario === 'rollback_invalid') {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.ok(!trace.some(line => line.startsWith('restart:')));
    }
    if (scenario === 'legacy_marker') {
      assert.match(output, /PREVIOUS_PRESERVED/);
      assert.match(await readFile(join(directory, 'app/releases', 'b'.repeat(40), 'frontend/dist/release.json'), 'utf8'), new RegExp('"sha": "' + 'b'.repeat(40) + '"'));
    }
    if (scenario === 'existing') assert.match(result.stderr, /already exists and is not active/);
    if (scenario === 'lock') {
      assert.deepEqual(trace, []);
      assert.match(result.stderr, /Cannot acquire backend deploy lock/);
    }
    if (scenario === 'concurrent') {
      assert.equal(value('SECOND_STATUS'), '6');
      assert.equal(trace.filter(line => line === 'git').length, 2);
      assert.equal(trace.filter(line => line.startsWith('restart:')).length, 1);
      assert.match(output, /Cannot acquire backend deploy lock/);
    }
    assert.doesNotMatch(output + result.stderr, /postgresql:\/\/|unused:unused/);
    if (failureStages.includes(scenario)) {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.ok(!trace.some(line => /^(restart|health):/.test(line)));
      const stages = ['git', 'ci:backend', 'ci:frontend', 'build:frontend', 'node:validate-frontend-artifact.mjs', 'backup', 'migrate:dry', 'migrate'];
      let last = scenario;
      if (['clone', 'wrong_sha'].includes(scenario)) last = 'git';
      else if (scenario === 'ci') last = 'ci:backend';
      else if (scenario === 'ci:frontend') last = 'ci:frontend';
      else if (['build', 'missing_dist'].includes(scenario)) last = 'build:frontend';
      else if (['validator', 'missing_index'].includes(scenario)) last = 'node:validate-frontend-artifact.mjs';
      else if (scenario === 'gzip') last = 'backup';
      assert.equal(trace.filter(line => line !== 'rm').at(-1), last);
      for (const later of stages.slice(stages.indexOf(last) + 1)) assert.ok(!trace.includes(later));
    }
    if (['restart', 'health', 'rollback_restart', 'rollback_health', 'rollback_joint'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.equal(trace.filter(line => line.startsWith('restart:')).length, 2);
      assert.equal(trace.at(-1), `health:${value('PREVIOUS')}`);
      assert.match(result.stderr, scenario.startsWith('rollback_restart') || scenario === 'rollback_health' ? /Application recovery failed/ : /Application recovery succeeded/);
      assert.match(result.stderr, /Database migrations were not reversed/);
    }
    if (['new', 'retention'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.match(output, /CANDIDATE_PRESERVED/);
      const cleanTrace = trace.filter(line => line !== 'rm');
      assert.deepEqual(cleanTrace.slice(0, 9), ['git', 'git', 'ci:backend', 'ci:frontend', 'build:frontend', 'node:validate-frontend-artifact.mjs', 'backup', 'migrate:dry', 'migrate']);
      assert.ok(trace.includes('rm'));
      assert.match(output, /build_env:\/api/);
      assert.match(output, /validate_env:\/api/);
    }
    if (scenario === 'smoke_unsafe') {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.match(output, /SESSION_FLOOR_PRESENT/);
      assert.match(result.stderr, /SESSION_RECOVERY_BLOCKED/);
      assert.ok(!trace.includes(`restart:${value('PREVIOUS')}`));
      assert.match(output, /^stop$/m);
      assert.equal(lifecycle.at(-1), 'stop', 'blocked recovery must leave the API stopped');
    }
    if (scenario === 'after_migrations') {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.ok(trace.includes('migrate'));
      assert.match(output, /SESSION_FLOOR_PRESENT/);
      assert.ok(!trace.some(line => line.startsWith('restart:')));
      assert.match(result.stderr, /SESSION_ACTIVATION_FAILED/);
      assert.equal(lifecycle.at(-1), 'stop', 'unexpected cutover failure must leave the API stopped');
    }
    if (scenario === 'floor_safe_before_migrations') {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.match(output, /SESSION_FLOOR_PRESENT/);
      assert.ok(!trace.includes('migrate'));
      assert.ok(!trace.some(line => line.startsWith('restart:')));
    }
    if (scenario === 'explicit_recovery') {
      assert.equal(value('CURRENT'), value('RECOVERY'));
      assert.ok(trace.includes(`restart:${value('RECOVERY')}`));
      assert.ok(!trace.includes(`restart:${value('PREVIOUS')}`));
      assert.match(result.stderr, /Application recovery succeeded/);
    }
    if (scenario === 'retention') assert.equal(Number(value('COUNT')), 7);
  });
}

const preparationFailures = [
  'recovery_missing', 'approval_missing', 'approval_stale', 'recovery_contract',
  'clone', 'wrong_sha', 'ci', 'ci:frontend', 'build', 'validator', 'missing_dist', 'missing_index',
  'candidate_contract', 'backup', 'gzip', 'migrate:dry', 'migrate',
  'recovery_lost_before_backup', 'recovery_lost_before_migrate', 'recovery_lost_after_migrate',
];
const cutoverFailures = ['stop', 'floor', 'previous_link', 'after_migrations', 'after_activation'];
const recoveryFailures = ['rollback_restart', 'rollback_health', 'recovery_lost_after_activation', 'recovery_changed_after_activation'];
for (const state of ['legacy', 'active', 'detected']) {
  for (const fault of ['none', ...preparationFailures, ...cutoverFailures, 'restart', 'health', ...recoveryFailures]) {
    if (state === 'active' && fault === 'floor') continue; // An existing floor is never rewritten.
    test(`session transition: ${state}, ${fault}`, async (t) => {
      const { result } = await runDeployment(t, `transition_${state}`, fault);
      const output = result.stdout;
      const value = name => output.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1];
      const events = output.split('\n').filter(line => /^(git|backup|migrate(:dry)?|stop|activation|restart:.*)$/.test(line));
      const restarts = events.filter(line => line.startsWith('restart:'));
      const beforeCutover = preparationFailures.includes(fault);
      assert.equal(value('STATUS') === '0', fault === 'none', output + result.stderr);
      assert.doesNotMatch(output + result.stderr, /postgresql:\/\/|unused:unused/);
      assert.ok(!restarts.includes(`restart:${value('PREVIOUS')}`), 'prior dependencies/code must never be restored by assumption');
      assert.equal(/SESSION_FLOOR_PRESENT/.test(output), state === 'active' || (!beforeCutover && !['stop', 'floor'].includes(fault)));
      if (beforeCutover) {
        assert.equal(value('CURRENT'), value('PREVIOUS'));
        assert.ok(!events.includes('stop'), 'a preparation failure must preserve the active process');
        assert.ok(!events.includes('activation'));
        assert.deepEqual(restarts, []);
        if (['recovery_missing', 'approval_missing', 'approval_stale', 'recovery_contract'].includes(fault)) {
          assert.match(result.stderr, /SESSION_DEPLOY_NOT_READY/);
          assert.deepEqual(events, [], 'operational readiness is required before clone, backup or migrations');
        }
        if (['candidate_contract', 'recovery_lost_before_backup'].includes(fault)) assert.ok(!events.includes('backup'));
        if (fault === 'recovery_lost_before_migrate') assert.ok(!events.includes('migrate'));
        if (fault === 'recovery_lost_after_migrate') assert.ok(events.includes('migrate'));
      } else {
        assert.ok(events.includes('migrate'));
        assert.ok(events.includes('stop'));
        if (events.includes('activation')) assert.ok(events.indexOf('stop') < events.indexOf('activation'));
        if (cutoverFailures.includes(fault)) {
          assert.deepEqual(restarts, []);
          assert.equal(value('CURRENT'), fault === 'after_activation' ? value('CANDIDATE') : value('PREVIOUS'));
          if (fault !== 'stop') assert.equal(events.at(-1), 'stop', 'unexpected cutover failure must keep the API stopped');
        }
        if (fault === 'none') {
          assert.equal(value('CURRENT'), value('CANDIDATE'));
          assert.deepEqual(restarts, [`restart:${value('CANDIDATE')}`]);
          assert.equal(events.filter(event => event === 'stop').length, 1, 'only the planned cutover stop is allowed');
        }
        if (['restart', 'health', 'rollback_restart', 'rollback_health'].includes(fault)) {
          assert.equal(value('CURRENT'), value('RECOVERY'));
          assert.deepEqual(restarts, [`restart:${value('CANDIDATE')}`, `restart:${value('RECOVERY')}`]);
        }
        if (recoveryFailures.includes(fault)) {
          assert.match(result.stderr, /SESSION_RECOVERY_BLOCKED/);
          assert.equal(events.at(-1), 'stop');
          if (['recovery_lost_after_activation', 'recovery_changed_after_activation'].includes(fault)) {
            assert.equal(value('CURRENT'), value('CANDIDATE'));
            assert.deepEqual(restarts, [`restart:${value('CANDIDATE')}`]);
          }
        }
      }
    });
  }
}

test('production CD stays blocked until both deployment and rollout readiness are explicitly enabled', () => {
  const condition = workflow.match(/ {4}if: >-\n([\s\S]*?) {4}runs-on:/)?.[1];
  assert.ok(condition);
  const clauses = condition.trim().split('&&').map(clause => {
    const match = clause.trim().match(/^([\w.]+)\s*==\s*'([^']+)'$/);
    assert.ok(match, `Unsupported or bypassing CD condition: ${clause}`);
    return [match[1], match[2]];
  });
  const approved = {
    'github.event.workflow_run.conclusion': 'success',
    'github.event.workflow_run.event': 'push',
    'github.event.workflow_run.head_branch': 'main',
    'vars.DEPLOY_ENABLED': 'true',
    'vars.SESSION_REVOCATION_ROLLOUT_READY': 'true',
  };
  assert.deepEqual(clauses.map(([key]) => key).sort(), Object.keys(approved).sort());
  const permitted = context => clauses.every(([key, value]) => context[key] === value);
  assert.equal(permitted(approved), true);
  for (const key of Object.keys(approved)) {
    assert.equal(permitted({ ...approved, [key]: undefined }), false, `Missing ${key} must block CD`);
    assert.equal(permitted({ ...approved, [key]: 'false' }), false, `Disabled ${key} must block CD`);
  }
  assert.equal(permitted({ ...approved, 'github.event.workflow_run.event': 'pull_request' }), false);
});
