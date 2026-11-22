#!/bin/sh
set -eu

case "${1:-}" in
  '') qa_project="supportdesk-qa-$(date +%s)-$$" ;;
  *) printf '%s\n' 'Usage: sh scripts/verify-local.sh' >&2; exit 2 ;;
esac
qa_dir=$(mktemp -d)
qa_compose() {
  docker compose -p "$qa_project" -f compose.yaml -f compose.local.yaml "$@"
}
cleanup() {
  qa_compose down --volumes >/dev/null 2>&1 || true
  rm -f "$qa_dir/before.dump"
  rmdir "$qa_dir" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM
umask 077

corepack pnpm smoke
corepack pnpm audit
qa_reviewer=$(openssl rand -hex 16)
qa_support=$(openssl rand -hex 16)
qa_db=$(openssl rand -hex 20)
qa_admin=$(openssl rand -hex 20)
qa_reviewer_hash=$(printf '%s' "$qa_reviewer" | node .build/bootstrap.cjs --hash-password)
qa_support_hash=$(printf '%s' "$qa_support" | node .build/bootstrap.cjs --hash-password)
test "${#qa_reviewer_hash}" -eq 161
test "${#qa_support_hash}" -eq 161
export APP_ORIGIN=http://127.0.0.1:3000
export DESK_DB_PASSWORD="$qa_db" POSTGRES_PASSWORD="$qa_admin"
export REVIEWER_PASSWORD_HASH="$qa_reviewer_hash" SUPPORT_PASSWORD_HASH="$qa_support_hash"

if ! qa_compose up --build --wait; then
  qa_compose logs --no-color --tail=12 app >&2
  exit 1
fi
SUPPORT_INTEGRATION_URL="postgresql://desk:$qa_db@127.0.0.1:55448/support_desk" corepack pnpm test:integration
qa_app=$(qa_compose ps -q app)
docker run --rm --init --ipc=host --network "container:$qa_app" \
  -e SUPPORT_E2E_PASSWORD="$qa_support" -e REVIEWER_E2E_PASSWORD="$qa_reviewer" \
  -e RUSSMARKET_E2E_URL=http://127.0.0.1:3000 -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble node node_modules/@playwright/test/cli.js test

metric="SELECT (SELECT count(*) FROM cases), (SELECT count(*) FROM messages), (SELECT count(*) FROM snapshots)"
before=$(qa_compose exec -T db psql --username=postgres --dbname=support_desk -Atc "$metric")
qa_compose up --force-recreate --wait
after=$(qa_compose exec -T db psql --username=postgres --dbname=support_desk -Atc "$metric")
test "$before" = "$after"
qa_compose exec -T db pg_dump --username=postgres --dbname=support_desk --format=custom > "$qa_dir/before.dump"
qa_compose exec -T db createdb --username=postgres support_restore_check
qa_compose exec -T db pg_restore --username=postgres --dbname=support_restore_check --exit-on-error < "$qa_dir/before.dump"
restored=$(qa_compose exec -T db psql --username=postgres --dbname=support_restore_check -Atc "$metric")
test "$before" = "$restored"
printf '%s\n' 'PostgreSQL restart and backup restore checks passed.'
