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
make_release "$previous"
ln -s "$previous" "$APP_ROOT/current"
[[ -L "$APP_ROOT/current" ]] || { echo 'Native symlinks required for these tests'; exit 90; }
case "$SCENARIO" in
  active*) make_release "$candidate"; ln -sfn "releases/$sha" "$APP_ROOT/current" ;;
  existing) make_release "$candidate" ;;
  first*) rm "$APP_ROOT/current" ;;
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
  if [[ "$1" == clone ]]; then make_release "$5"; fi
}
node() { echo node >> "$TRACE"; return 99; }
pg_dump() { echo backup >> "$TRACE"; [[ "$SCENARIO" != backup ]] || return 1; printf 'SELECT 1;\n'; }
gzip() { [[ "$SCENARIO" != gzip ]] || { command cat >/dev/null; return 1; }; command gzip "$@"; }
npm() {
  local step="$1"
  [[ "$1" != run ]] || step="$2"
  echo "$step" >> "$TRACE"
  [[ "$SCENARIO" != "$step" ]]
}
systemctl() {
  local active count
  active=$(realpath "$APP_ROOT/current")
  echo "restart:$active" >> "$TRACE"
  count=$(grep -c '^restart:' "$TRACE")
  [[ "$SCENARIO" != restart && "$SCENARIO" != rollback_restart && "$SCENARIO" != first_restart ]] || [[ "$count" -gt 1 && "$SCENARIO" != rollback_restart ]]
}
curl() {
  local active
  active=$(realpath "$APP_ROOT/current")
  echo "health:$active" >> "$TRACE"
  case "$SCENARIO" in
    active_bad|rollback_health|first_health) return 1 ;;
    health) [[ "$active" == "$previous" ]] ;;
    *) return 0 ;;
  esac
}
rm() { echo rm >> "$TRACE"; command rm "$@"; }
export -f git node pg_dump gzip npm systemctl curl rm make_release
export previous
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

for (const scenario of ['new', 'active', 'active_bad', 'existing', 'clone', 'backup', 'gzip', 'ci', 'migrate:dry', 'migrate', 'restart', 'health', 'rollback_restart', 'rollback_health', 'first_restart', 'first_health', 'lock', 'concurrent', 'retention']) {
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
    const trace = output.split('\n').filter(line => /^(git|backup|ci|migrate(:dry)?|rm|restart:.*|health:.*)$/.test(line));
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
    if (['clone', 'backup', 'gzip', 'ci', 'migrate:dry', 'migrate'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.ok(!trace.some(line => /^(restart|health):/.test(line)));
      const stages = ['git', 'backup', 'ci', 'migrate:dry', 'migrate'];
      const last = scenario === 'clone' ? 'git' : scenario === 'gzip' ? 'backup' : scenario;
      assert.equal(trace.filter(line => line !== 'rm').at(-1), last);
      for (const later of stages.slice(stages.indexOf(last) + 1)) assert.ok(!trace.includes(later));
    }
    if (['restart', 'health', 'rollback_restart', 'rollback_health'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('PREVIOUS'));
      assert.equal(trace.filter(line => line.startsWith('restart:')).length, 2);
      assert.equal(trace.at(-1), `health:${value('PREVIOUS')}`);
      assert.match(result.stderr, scenario.startsWith('rollback') ? /Application recovery failed/ : /Application recovery succeeded/);
      assert.match(result.stderr, /Database migrations were not reversed/);
    }
    if (scenario.startsWith('first')) assert.match(result.stderr, /No valid previous release/);
    if (['new', 'retention'].includes(scenario)) {
      assert.equal(value('CURRENT'), value('CANDIDATE'));
      assert.match(output, /CANDIDATE_PRESERVED/);
      assert.deepEqual(trace.slice(0, 6), ['git', 'git', 'backup', 'ci', 'migrate:dry', 'migrate']);
    }
    if (scenario === 'retention') assert.equal(Number(value('COUNT')), 7);
  });
}
