#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_SHA="${1:-}"
APP_ROOT="${APP_ROOT:-/opt/agora}"
REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
SERVICE_NAME="${SERVICE_NAME:-agora-api}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/shared/backend.env}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_SHA"
CURRENT_LINK="$APP_ROOT/current"
BACKUP_DIR="$APP_ROOT/backups"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PREVIOUS_RELEASE=""

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character Git commit SHA is required." >&2
  exit 2
fi

if [[ ! "$APP_ROOT" =~ ^/opt/[a-zA-Z0-9._-]+$ ]] || [[ ! "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "APP_ROOT must be a direct child of /opt and retention must be numeric." >&2
  exit 2
fi

for command_name in git npm node pg_dump gzip curl systemctl; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required command: $command_name" >&2
    exit 3
  }
done

[[ -f "$ENV_FILE" ]] || {
  echo "Environment file not found: $ENV_FILE" >&2
  exit 4
}

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

mkdir -p "$APP_ROOT/releases" "$BACKUP_DIR"
rm -rf "$RELEASE_DIR"
git clone --quiet --no-checkout "$REPOSITORY_URL" "$RELEASE_DIR"
git -C "$RELEASE_DIR" checkout --quiet --detach "$RELEASE_SHA"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL must be defined in $ENV_FILE}"

BACKUP_FILE="$BACKUP_DIR/agora-$(date -u +%Y%m%dT%H%M%SZ)-$RELEASE_SHA.sql.gz"
echo "Creating database backup: $BACKUP_FILE"
PGDATABASE="$DATABASE_URL" pg_dump --format=plain --no-owner --no-privileges | gzip -9 > "$BACKUP_FILE"
test -s "$BACKUP_FILE"

ln -s "$ENV_FILE" "$RELEASE_DIR/backend/.env"
npm ci --omit=dev --prefix "$RELEASE_DIR/backend"

echo "Validating migrations"
npm run migrate:dry --prefix "$RELEASE_DIR/backend"

echo "Applying pending migrations"
npm run migrate --prefix "$RELEASE_DIR/backend"

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$CURRENT_LINK"
systemctl restart "$SERVICE_NAME"

if ! curl --fail --silent --show-error --retry 5 --retry-delay 3 "$HEALTH_URL" >/dev/null; then
  echo "Health check failed; rolling application symlink back." >&2
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current.next"
    mv -Tf "$APP_ROOT/current.next" "$CURRENT_LINK"
    systemctl restart "$SERVICE_NAME"
  fi
  echo "Database migrations were not reversed; inspect them before the next attempt." >&2
  exit 5
fi

find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +6 \
  | cut -d' ' -f2- \
  | while IFS= read -r old_release; do
      [[ "$old_release" == "$PREVIOUS_RELEASE" ]] || rm -rf -- "$old_release"
    done

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'agora-*.sql.gz' \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Backend release $RELEASE_SHA deployed successfully."
