#!/usr/bin/env bash
set -euo pipefail

# Reset local Supabase (migrations only), then replace public data from the *linked* cloud project.
# Requires: `supabase link` done for this repo, Docker running, `supabase start` (local stack up).
#
# Usage:
#   ./scripts/sync-local-db-from-cloud.sh
# Optional — also sync auth.users (sensitive; do not commit dumps):
#   SYNC_AUTH=1 ./scripts/sync-local-db-from-cloud.sh
# Optional — storage bucket definitions + files (requires experimental CLI storage commands).
#   Set comma-separated bucket ids (as in the Dashboard), e.g.:
#   SYNC_STORAGE=1 STORAGE_BUCKETS=my-bucket,avatars ./scripts/sync-local-db-from-cloud.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Resetting local DB (migrations, no seed)"
supabase db reset --no-seed --yes

mkdir -p supabase/snapshots
PUBLIC_DUMP="supabase/snapshots/cloud_public.sql"

echo "==> Dumping public data from linked cloud"
supabase db dump --linked --data-only --yes -s public -f "$PUBLIC_DUMP"

echo "==> Loading public data into local Postgres"
eval "$(supabase status -o env)"
if [[ -z "${DB_URL:-}" ]]; then
  echo "DB_URL missing. Run: supabase start" >&2
  exit 1
fi
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$PUBLIC_DUMP"

if [[ "${SYNC_AUTH:-}" == "1" ]]; then
  AUTH_DUMP="supabase/snapshots/cloud_auth.sql"
  echo "==> Dumping auth data from linked cloud (SYNC_AUTH=1)"
  supabase db dump --linked --data-only --yes -s auth -f "$AUTH_DUMP"
  echo "==> Loading auth data into local Postgres"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$AUTH_DUMP"
fi

if [[ "${SYNC_STORAGE:-}" == "1" ]]; then
  if [[ -z "${STORAGE_BUCKETS:-}" ]]; then
    echo "SYNC_STORAGE=1 requires STORAGE_BUCKETS (comma-separated bucket names), e.g. STORAGE_BUCKETS=posts,avatars" >&2
    exit 1
  fi
  ST_DUMP="supabase/snapshots/cloud_storage_meta.sql"
  echo "==> Dumping storage metadata from linked cloud (excluding storage.objects; files copied separately)"
  supabase db dump --linked --data-only --yes -s storage -x storage.objects -f "$ST_DUMP"
  echo "==> Loading storage metadata into local Postgres"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ST_DUMP"

  TMP_STORAGE="$(mktemp -d)"
  cleanup_storage_tmp() {
    rm -rf "$TMP_STORAGE"
  }
  trap cleanup_storage_tmp EXIT

  IFS=',' read -ra _bucket_arr <<< "$STORAGE_BUCKETS"
  for _b in "${_bucket_arr[@]}"; do
    _b_trimmed="${_b// /}"
    if [[ -z "$_b_trimmed" ]]; then
      continue
    fi
    echo "==> Storage: linked -> disk (recursive) ss:///${_b_trimmed}/"
    mkdir -p "$TMP_STORAGE/$_b_trimmed"
    supabase storage cp -r --experimental --linked --yes "ss:///${_b_trimmed}/" "$TMP_STORAGE/${_b_trimmed}/"
    echo "==> Storage: disk -> local (recursive) ss:///${_b_trimmed}/"
    supabase storage cp -r --experimental --local --yes "$TMP_STORAGE/${_b_trimmed}/" "ss:///${_b_trimmed}/"
  done

  trap - EXIT
  cleanup_storage_tmp
fi

echo "==> Done."
