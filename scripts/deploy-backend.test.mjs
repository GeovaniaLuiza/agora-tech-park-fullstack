import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
const shell = windows ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const source = (await readFile(new URL('../deploy/aws/deploy-backend.sh', import.meta.url), 'utf8')).replaceAll('\r', '');
// Only relocate the allowed root in the test copy; production keeps its /opt restriction.
const guard = '[[ ! "$APP_ROOT" =~ ^/opt/[a-zA-Z0-9._-]+$ ]]';
assert.ok(source.includes(guard));
const isolated = source.replace(guard, '[[ "$APP_ROOT" != "$TEST_ROOT" ]]');

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
}
make_joint_release() {
  make_release "$1"
  mkdir -p "$1/frontend/dist"
  printf '<html><body>Agora</body></html>\n' > "$1/frontend/dist/index.html"
  printf 'const api = "/api";\n' > "$1/frontend/dist/app.js"
}
make_release "$previous"
ln -s "$previous" "$APP_ROOT/current"
[[ -L "$APP_ROOT/current" ]] || { echo 'Native symlinks required for these tests'; exit 90; }
case "$SCENARIO" in
  active*) make_release "$candidate"; ln -sfn "releases/$sha" "$APP_ROOT/current" ;;
  existing) make_release "$candidate" ;;
  first*) rm "$APP_ROOT/current" ;;
  rollback_joint)
    rm -rf "$previous"
    make_joint_release "$previous"
    ln -sfn "$previous" "$APP_ROOT/current"
    ;;
  retention)
    touch -t 200001010000 "$previous"
    for n in {1..7}; do mkdir "$APP_ROOT/releases/old$n"; touch -t 203001010000 "$APP_ROOT/releases/old$n"; done ;;
esac
git() {
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
    "migrate:dry") [[ "$step" != "migrate:dry" ]] ;;
    migrate) [[ "$step" != migrate ]] ;;
    *) return 0 ;;
  esac
}
systemctl() {
  local active count
  active=$(realpath "$APP_ROOT/current")
  echo "restart:$active" >> "$TRACE"
  count=$(grep -c '^restart:' "$TRACE")
  [[ "$SCENARIO" != restart && "$SCENARIO" != rollback_restart && "$SCENARIO" != first_restart && "$SCENARIO" != rollback_joint ]] || [[ "$count" -gt 1 && "$SCENARIO" != rollback_restart ]]
}
curl() {
  local active
  active=$(realpath "$APP_ROOT/current")
  echo "health:$active" >> "$TRACE"
  case "$SCENARIO" in
    active_bad|rollback_health|first_health) return 1 ;;
    health|rollback_joint) [[ "$active" == "$previous" ]] ;;
    *) return 0 ;;
  esac
}
rm() { echo rm >> "$TRACE"; command rm "$@"; }
export -f git node pg_dump gzip npm systemctl curl rm make_release make_joint_release
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
  bash ./deploy.sh "$sha"
  status=$?
fi
set -e
echo "STATUS:$status"
echo "CURRENT:$(realpath -m "$APP_ROOT/current")"
echo "PREVIOUS:$previous"
echo "CANDIDATE:$candidate"
[[ ! -f "$previous/backend/src/server.js" ]] || echo PREVIOUS_PRESERVED
[[ ! -f "$candidate/backend/src/server.js" ]] || echo CANDIDATE_PRESERVED
if [[ "$SCENARIO" == retention ]]; then
  echo "COUNT:$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)"
fi
cat "$TRACE"
`;

const failureStages = ['clone', 'ci', 'ci:frontend', 'build', 'validator', 'missing_dist', 'missing_index', 'backup', 'gzip', 'migrate:dry', 'migrate'];
for (const scenario of [
  'new', 'active', 'active_bad', 'existing', 'clone', 'ci', 'ci:frontend', 'build', 'validator',
  'missing_dist', 'missing_index', 'backup', 'gzip', 'migrate:dry', 'migrate',
  'restart', 'health', 'rollback_restart', 'rollback_health', 'rollback_joint',
  'first_restart', 'first_health', 'lock', 'concurrent', 'retention',
]) {
  test(`backend deploy: ${scenario}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'agora-deploy-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, 'deploy.sh'), isolated);
    const result = spawnSync(shell, ['-c', harness], {
      cwd: directory, encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, SCENARIO: scenario, SIMULATE_FLOCK: windows ? '1' : '0' },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = result.stdout;
    const trace = output.split('\n').filter(line => /^(git|backup|ci(:.*)?|build(:.*)?|node:.*|migrate(:dry)?|rm|restart:.*|health:.*)$/.test(line));
    const value = name => output.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1];
    const success = ['new', 'active', 'retention', 'concurrent'].includes(scenario);
    assert.equal(value('STATUS') === '0', success, output + result.stderr);
    if (!scenario.startsWith('first')) assert.match(output, /PREVIOUS_PRESERVED/);
    if (['active', 'active_bad', 'existing'].includes(scenario)) {
      assert.match(output, /CANDIDATE_PRESERVED/);
      assert.ok(trace.every(line => line.startsWith('health:')), trace.join('\n'));
    }
    if (scenario === 'active') assert.match(output, /already active and healthy/);
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
      if (scenario === 'clone') last = 'git';
      else if (scenario === 'ci') last = 'ci:backend';
      else if (scenario === 'ci:frontend') last = 'ci:frontend';
      else if (scenario === 'build') last = 'build:frontend';
      else if (['validator', 'missing_dist', 'missing_index'].includes(scenario)) last = 'node:validate-frontend-artifact.mjs';
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
    if (scenario.startsWith('first')) assert.match(result.stderr, /No valid previous release/);
    if (['new', 'retention'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.match(output, /CANDIDATE_PRESERVED/);
      const cleanTrace = trace.filter(line => line !== 'rm');
      assert.deepEqual(cleanTrace.slice(0, 9), ['git', 'git', 'ci:backend', 'ci:frontend', 'build:frontend', 'node:validate-frontend-artifact.mjs', 'backup', 'migrate:dry', 'migrate']);
      assert.ok(trace.includes('rm'));
      assert.match(output, /build_env:\/api/);
      assert.match(output, /validate_env:\/api/);
    }
    if (scenario === 'retention') assert.equal(Number(value('COUNT')), 7);
  });
}
