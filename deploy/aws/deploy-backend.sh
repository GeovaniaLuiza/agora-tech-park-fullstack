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

for command_name in git npm node pg_dump gzip curl systemctl flock realpath; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required command: $command_name" >&2
    exit 3
  }
done

[[ -f "$ENV_FILE" ]] || {
  echo "Environment file not found: $ENV_FILE" >&2
  exit 4
}

# Keep this descriptor open through recovery and retention. Never unlink the lock.
if ! { exec 9>>"$APP_ROOT/deploy.lock"; } || ! flock -n 9; then
  echo "Cannot acquire backend deploy lock; no release changes made." >&2
  exit 6
fi

RELEASES_ROOT="$(realpath -m "$APP_ROOT/releases")"
if [[ "$RELEASES_ROOT" != "$APP_ROOT/releases" ]]; then
  echo "Release root must not resolve outside the configured releases directory." >&2
  exit 4
fi

release_path() {
  local resolved
  resolved="$(realpath -m -- "$1")" || return 1
  [[ "$resolved" == "$RELEASES_ROOT/"* ]] || return 1
  printf '%s\n' "$resolved"
}

valid_release() {
  [[ -d "$1/backend" && -f "$1/backend/src/server.js" && -f "$1/backend/package.json" ]]
}

health_check() {
  curl --fail --silent --show-error --retry 5 --retry-delay 3 "$HEALTH_URL" >/dev/null
}

if ! RELEASE_DIR="$(release_path "$RELEASE_DIR")"; then
  echo "Invalid release destination." >&2
  exit 4
fi
if [[ -L "$CURRENT_LINK" ]]; then
  if ! PREVIOUS_RELEASE="$(release_path "$CURRENT_LINK")"; then
    echo "Current must resolve inside the releases directory." >&2
    exit 4
  fi
elif [[ -e "$CURRENT_LINK" ]]; then
  echo "Current exists but is not a symlink." >&2
  exit 4
fi

if [[ "$PREVIOUS_RELEASE" == "$RELEASE_DIR" ]]; then
  if valid_release "$RELEASE_DIR" && health_check; then
    echo "Backend SHA $RELEASE_SHA is already active and healthy; no changes made."
    exit 0
  fi
  echo "Active release is missing, invalid or unhealthy; preserved for investigation." >&2
  exit 5
fi
if [[ -e "$RELEASE_DIR" || -L "$APP_ROOT/releases/$RELEASE_SHA" ]]; then
  echo "Release directory already exists and is not active; preserved for operator investigation." >&2
  exit 4
fi

mkdir -p "$APP_ROOT/releases" "$BACKUP_DIR"
git clone --quiet --no-checkout "$REPOSITORY_URL" "$RELEASE_DIR"
git -C "$RELEASE_DIR" checkout --quiet --detach "$RELEASE_SHA"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL must be defined in $ENV_FILE}"

BACKUP_FILE="$BACKUP_DIR/agora-$(date -u +%Y%m%dT%H%M%SZ)-$RELEASE_SHA.sql.gz"
echo "Creating database backup: $BACKUP_FILE"
BACKUP_TEMP="$(mktemp "$BACKUP_FILE.tmp.XXXXXX")"
if pg_dump --dbname="$DATABASE_URL" --format=plain --no-owner --no-privileges | gzip -9 > "$BACKUP_TEMP" \
  && test -s "$BACKUP_TEMP" \
  && gzip -t "$BACKUP_TEMP" \
  && mv -- "$BACKUP_TEMP" "$BACKUP_FILE"; then
  echo "Database backup completed: $BACKUP_FILE"
else
  rm -f -- "$BACKUP_TEMP"
  echo "Database backup failed; deploy aborted." >&2
  exit 1
fi

ln -s "$ENV_FILE" "$RELEASE_DIR/backend/.env"
npm ci --omit=dev --prefix "$RELEASE_DIR/backend"

echo "Validating migrations"
npm run migrate:dry --prefix "$RELEASE_DIR/backend"

echo "Applying pending migrations"
npm run migrate --prefix "$RELEASE_DIR/backend"

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$CURRENT_LINK"

if ! systemctl restart "$SERVICE_NAME" || ! health_check; then
  echo "Application restart or health failed; attempting application recovery." >&2
  if [[ -n "$PREVIOUS_RELEASE" ]] && valid_release "$PREVIOUS_RELEASE"; then
    if ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current.next" \
      && mv -Tf "$APP_ROOT/current.next" "$CURRENT_LINK"; then
      recovery_restart=0
      systemctl restart "$SERVICE_NAME" || recovery_restart=$?
      if health_check && [[ "$recovery_restart" == 0 ]]; then
        echo "Application recovery succeeded." >&2
      else
        echo "Application recovery failed: restart or health check failed." >&2
      fi
    else
      echo "Application recovery failed: could not restore current." >&2
    fi
  else
    echo "No valid previous release; application rollback is unavailable." >&2
  fi
  echo "Database migrations were not reversed; inspect them before the next attempt." >&2
  exit 5
fi

# Validate all protected destinations before deleting anything.
CURRENT_REAL="$(release_path "$CURRENT_LINK")"
RELEASE_DIR="$(release_path "$RELEASE_DIR")"
if [[ -n "$PREVIOUS_RELEASE" ]]; then
  PREVIOUS_RELEASE="$(release_path "$PREVIOUS_RELEASE")"
fi
find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +6 \
  | cut -d' ' -f2- \
  | while IFS= read -r old_release; do
      old_real="$(release_path "$old_release")" || exit 4
      if [[ "$old_real" != "$CURRENT_REAL" && "$old_real" != "$PREVIOUS_RELEASE" && "$old_real" != "$RELEASE_DIR" ]]; then
        rm -rf -- "$old_release"
      fi
    done

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'agora-*.sql.gz' \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Backend release $RELEASE_SHA deployed successfully."
