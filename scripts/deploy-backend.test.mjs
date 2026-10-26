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

const harness = String.raw`
set -Eeuo pipefail
export PATH="/usr/bin:$PATH"
export TEST_ROOT="$PWD/app" APP_ROOT="$PWD/app"
export MSYS=winsymlinks:nativestrict
export TRACE="$PWD/trace" SCENARIO
mkdir -p "$APP_ROOT/shared" "$APP_ROOT/releases"
printf 'DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/isolated\n' > "$APP_ROOT/shared/backend.env"
: > "$TRACE"
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
  mkdir -p "$1/frontend/dist"
  printf '<html><body>Agora</body></html>\n' > "$1/frontend/dist/index.html"
  printf 'const api = "/api";\n' > "$1/frontend/dist/app.js"
  printf '{\n  "sha": "%s"\n}\n' "$(basename "$1")" > "$1/frontend/dist/release.json"
}
make_joint_release "$previous"
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
  rollback_command|smoke_safe|smoke_unsafe)
    make_joint_release "$candidate"
    ln -sfn "$candidate" "$APP_ROOT/current"
    ln -s "$previous" "$APP_ROOT/previous"
    if [[ "$SCENARIO" == smoke_unsafe ]]; then printf 'legacy without revocation\n' > "$previous/backend/src/server.js"; fi
    ;;
  rollback_invalid)
    make_joint_release "$candidate"
    ln -sfn "$candidate" "$APP_ROOT/current"
    ln -s "$previous" "$APP_ROOT/previous"
    rm "$previous/frontend/dist/release.json"
    ;;
  legacy_marker) rm "$previous/frontend/dist/release.json" ;;
  retention)
    touch -t 200001010000 "$previous"
    for n in {1..7}; do mkdir "$APP_ROOT/releases/old$n"; touch -t 203001010000 "$APP_ROOT/releases/old$n"; done ;;
esac
git() {
  if [[ "$1" == -C && "$3" == rev-parse ]]; then
    if [[ "$SCENARIO" == wrong_sha && "$2" == "$candidate" ]]; then printf 'b%.0s' {1..40}; echo; else basename "$2"; fi
    return 0
  fi
  echo git >> "$TRACE"
  [[ "$SCENARIO" != clone ]] || return 1
  if [[ "$SCENARIO" == concurrent && "$1" == clone ]]; then
    touch "$APP_ROOT/started"
    while [[ ! -e "$APP_ROOT/continue" ]]; do sleep 0.05; done
  fi
  if [[ "$1" == clone ]]; then
    make_release "$5"
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
  case "$SCENARIO" in
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
  [[ -d "$dir" && -f "$dir/index.html" ]] || return 1
  return 0
}
pg_dump() { echo backup >> "$TRACE"; [[ "$SCENARIO" != backup ]] || return 1; printf 'SELECT 1;\n'; }
gzip() { [[ "$SCENARIO" != gzip ]] || { command cat >/dev/null; return 1; }; command gzip "$@"; }
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
    if [[ "$SCENARIO" != missing_dist ]]; then
      mkdir -p "$rel_dir/frontend/dist"
      printf 'const api = "/api";\n' > "$rel_dir/frontend/dist/app.js"
      if [[ "$SCENARIO" != missing_index ]]; then
        printf '<html><body>Agora</body></html>\n' > "$rel_dir/frontend/dist/index.html"
      fi
    fi
  fi
  case "$SCENARIO" in
    ci) [[ "$event" != "ci:backend" ]] ;;
    "ci:frontend") [[ "$event" != "ci:frontend" ]] ;;
    build|"build:frontend") [[ "$event" != "build:frontend" ]] ;;
    "migrate:dry"|unsafe_before_migrations|floor_safe_before_migrations) [[ "$step" != "migrate:dry" ]] ;;
    migrate) [[ "$step" != migrate ]] ;;
    *) return 0 ;;
  esac
}
systemctl() {
  if [[ "$1" == stop ]]; then echo stop >> "$TRACE"; return 0; fi
  local active count
  active=$(realpath "$APP_ROOT/current")
  echo "restart:$active" >> "$TRACE"
  count=$(grep -c '^restart:' "$TRACE")
  [[ "$SCENARIO" != restart && "$SCENARIO" != rollback_restart && "$SCENARIO" != first_restart && "$SCENARIO" != rollback_joint && "$SCENARIO" != unsafe_restart && "$SCENARIO" != explicit_recovery ]] || [[ "$count" -gt 1 && "$SCENARIO" != rollback_restart ]]
}
curl() {
  local active
  active=$(realpath "$APP_ROOT/current")
  echo "health:$active" >> "$TRACE"
  case "$SCENARIO" in
    active_bad|rollback_health|first_health) return 1 ;;
    unsafe_health|legacy_migration_only) return 1 ;;
    health|rollback_joint) [[ "$active" == "$previous" ]] ;;
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
  if [[ "$SCENARIO" == *after_migrations && "$*" == *current.next* ]]; then return 1; fi
  command mv "$@" || return
  if [[ "$*" == *current.next* ]]; then echo activation >> "$TRACE"; fi
  if [[ "$SCENARIO" == unsafe_after_activation && "$*" == *current.next* ]]; then return 1; fi
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
  elif [[ "$SCENARIO" == rollback_command || "$SCENARIO" == rollback_invalid || "$SCENARIO" == smoke_* ]]; then
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
for (const scenario of [
  'unsafe_restart', 'unsafe_health', 'unsafe_before_migrations', 'floor_unsafe_before_migrations',
  'after_migrations', 'explicit_recovery', 'smoke_safe', 'smoke_unsafe',
  'unsafe_after_migrations', 'unsafe_after_activation', 'legacy_migration_only', 'floor_safe_before_migrations',
  'new', 'active', 'active_bad', 'existing', 'clone', 'wrong_sha', 'ci', 'ci:frontend', 'build', 'validator',
  'missing_dist', 'missing_index', 'backup', 'gzip', 'migrate:dry', 'migrate',
  'restart', 'health', 'rollback_restart', 'rollback_health', 'rollback_joint',
  'rollback_command', 'rollback_invalid', 'legacy_marker', 'first_restart', 'first_health', 'lock', 'concurrent', 'retention',
]) {
  test(`backend deploy: ${scenario}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'agora-deploy-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'deploy.sh'), isolated);
    await writeFile(join(directory, 'smoke.sh'), 'set -Eeuo pipefail\n' + smokeDriver);
    await writeFile(join(directory, 'verify-session-recovery.mjs'), verifier);
    await writeFile(join(directory, 'session-recovery-contract.json'), JSON.stringify(fixtureContract));
    await writeFile(join(directory, 'harness.sh'), harness);
    const result = spawnSync(shell, ['harness.sh'], {
      cwd: directory, encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, SCENARIO: scenario, SIMULATE_FLOCK: windows ? '1' : '0' },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = result.stdout;
    const trace = output.split('\n').filter(line => /^(git|backup|ci(:.*)?|build(:.*)?|node:.*|migrate(:dry)?|rm|restart:.*|health:.*)$/.test(line));
    const lifecycle = output.split('\n').filter(line => /^(stop|activation|restart:.*)$/.test(line));
    if (lifecycle.includes('activation')) {
      assert.ok(lifecycle.indexOf('stop') >= 0 && lifecycle.indexOf('stop') < lifecycle.indexOf('activation'),
        'the old API must stop before the first activation');
    }
    const value = name => output.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1];
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
    if (scenario.startsWith('first')) assert.match(result.stderr, /SESSION_RECOVERY_BLOCKED/);
    if (['new', 'retention'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.match(output, /CANDIDATE_PRESERVED/);
      const cleanTrace = trace.filter(line => line !== 'rm');
      assert.deepEqual(cleanTrace.slice(0, 9), ['git', 'git', 'ci:backend', 'ci:frontend', 'build:frontend', 'node:validate-frontend-artifact.mjs', 'backup', 'migrate:dry', 'migrate']);
      assert.ok(trace.includes('rm'));
      assert.match(output, /build_env:\/api/);
      assert.match(output, /validate_env:\/api/);
    }
    if (['unsafe_restart', 'unsafe_health', 'smoke_unsafe', 'unsafe_after_activation', 'legacy_migration_only'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.match(output, /SESSION_FLOOR_PRESENT/);
      assert.match(result.stderr, /SESSION_RECOVERY_BLOCKED/);
      assert.ok(!trace.includes(`restart:${value('PREVIOUS')}`));
      assert.match(output, /^stop$/m);
      assert.equal(lifecycle.at(-1), 'stop', 'blocked recovery must leave the API stopped');
    }
    if (scenario === 'floor_unsafe_before_migrations') {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.match(result.stderr, /Active release violates the persistent session floor/);
      assert.ok(!trace.includes('backup'));
      assert.ok(!trace.some(line => line.startsWith('restart:')));
      assert.match(output, /^stop$/m);
    }
    if (scenario === 'unsafe_before_migrations') {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.ok(!trace.includes('migrate'));
      assert.doesNotMatch(output, /SESSION_FLOOR_PRESENT/);
    }
    if (['after_migrations', 'unsafe_after_migrations'].includes(scenario)) {
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
