import { fileURLToPath } from 'node:url';

export const REPOSITORY_URL = 'https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git';
export const RUNTIME_PATH = 'deploy/aws/deploy-backend.sh';
export const HEREDOC_TAG = 'AGORA_DEPLOY_RUNTIME';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
// Scheme-qualified origin with no whitespace, quotes or shell metacharacters.
const URL_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[a-zA-Z0-9._~:/?%+-]+$/;

export function buildBootstrapScript() {
  return `set -Eeuo pipefail

release_sha="\${AGORA_RELEASE_SHA:-}"
action="\${AGORA_DEPLOY_ACTION:-deploy}"
repository_url="\${REPOSITORY_URL:-${REPOSITORY_URL}}"
runtime_path='${RUNTIME_PATH}'

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'AGORA_RELEASE_SHA must be a full 40-character Git commit SHA.' >&2
  exit 2
fi
if [[ "$action" != deploy && "$action" != rollback ]]; then
  echo 'AGORA_DEPLOY_ACTION must be deploy or rollback.' >&2
  exit 2
fi

workdir="$(mktemp -d "\${TMPDIR:-/tmp}/agora-deploy-runtime.XXXXXX")"
cleanup() {
  local status=$?
  if [[ -n "\${workdir:-}" && -d "$workdir" ]]; then rm -rf -- "$workdir"; fi
  return "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

repository="$workdir/repository"
git init --quiet "$repository"
git -C "$repository" remote add origin "$repository_url"
echo "Fetching approved release $release_sha"
git -C "$repository" fetch --quiet --depth 1 origin "$release_sha"
resolved_sha="$(git -C "$repository" rev-parse --verify --quiet 'FETCH_HEAD^{commit}' || true)"
if [[ "$resolved_sha" != "$release_sha" ]]; then
  echo "Fetched commit '\${resolved_sha:-none}' does not match the approved SHA $release_sha." >&2
  exit 4
fi

runtime="$workdir/deploy-backend.sh"
if ! git -C "$repository" show "$release_sha:$runtime_path" > "$runtime"; then
  echo "Commit $release_sha does not contain $runtime_path." >&2
  exit 4
fi
if [[ ! -s "$runtime" ]]; then
  echo "Deploy runtime extracted from $release_sha is empty." >&2
  exit 4
fi
chmod 0755 "$runtime"
bash -n "$runtime"

echo "Deploy runtime validated from $release_sha; running $action"
bash "$runtime" "$release_sha" "$action"`;
}

export function buildInvocation({ releaseSha, action = 'deploy', repositoryUrl } = {}) {
  if (typeof releaseSha !== 'string' || !SHA_PATTERN.test(releaseSha)) {
    throw new Error('RELEASE_SHA must be a full 40-character Git commit SHA.');
  }
  if (action !== 'deploy' && action !== 'rollback') {
    throw new Error('Deploy action must be deploy or rollback.');
  }
  const origin = repositoryUrl || REPOSITORY_URL;
  if (!URL_PATTERN.test(origin)) {
    throw new Error('Deploy repository URL must be a scheme-qualified origin without shell metacharacters.');
  }
  const assignments = [`AGORA_RELEASE_SHA=${releaseSha}`, `AGORA_DEPLOY_ACTION=${action}`];
  if (repositoryUrl) assignments.push(`REPOSITORY_URL=${origin}`);
  return `sudo env ${assignments.join(' ')} bash -se <<'${HEREDOC_TAG}'\n${buildBootstrapScript()}\n${HEREDOC_TAG}`;
}

export function buildSsmParameters(options) {
  return { commands: [buildInvocation(options)] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const parameters = buildSsmParameters({ releaseSha: process.env.RELEASE_SHA, action: process.argv[2] || 'deploy' });
  process.stdout.write(`${JSON.stringify(parameters)}\n`);
}
