#!/usr/bin/env bash
# Local full stack for end-to-end testing:
#   DynamoDB emulator on :8000 (dynalite by default, DynamoDB Local in Docker with DB=docker)
#   backend (serverless-offline) on :3000, frontend (Vite, dev auth) on :5173.
# Usage: npm run stack    (Ctrl-C stops everything it started)
# Env:   BACKEND_DIR=/path/to/financeControlBackend   (default: ../financeControlBackend)
#        DB=docker                                     (use `npm run db:up` instead of `npm run db:lite`)
#        STACK_LOG_DIR=/some/dir                       (default: a fresh temp dir; logs of each process)
set -euo pipefail
cd "$(dirname "$0")/.."
FRONTEND_DIR="$PWD"
BACKEND_DIR="${BACKEND_DIR:-$(cd ../financeControlBackend 2> /dev/null && pwd || true)}"
DB="${DB:-lite}"
die() { echo "✖ $*" >&2; exit 1; }

# ---- preflight -------------------------------------------------------------------------------------------------
[ -n "$BACKEND_DIR" ] && [ -d "$BACKEND_DIR" ] \
  || die "Backend repo not found. Clone it next to this repo (../financeControlBackend) or set BACKEND_DIR=/path/to/financeControlBackend."
[ -f "$BACKEND_DIR/package.json" ] && [ -f "$BACKEND_DIR/serverless.yml" ] \
  || die "BACKEND_DIR=$BACKEND_DIR is not the financeControl backend repo (no package.json/serverless.yml)."
[ -d "$BACKEND_DIR/node_modules" ] || die "Backend dependencies are missing. Run: (cd $BACKEND_DIR && npm install)"
[ -d "$FRONTEND_DIR/node_modules" ] || die "Frontend dependencies are missing. Run: npm install"
command -v curl > /dev/null || die "curl is required."
command -v setsid > /dev/null || die "setsid (util-linux) is required."

case "$DB" in
  lite)
    grep -q '"db:lite"' "$BACKEND_DIR/package.json" \
      || die "The backend at $BACKEND_DIR has no 'db:lite' script (Docker-free DynamoDB). Merge/checkout branch chore/offline-dev in the backend repo, or run with DB=docker." ;;
  docker)
    command -v docker > /dev/null || die "DB=docker but the docker CLI is not installed."
    docker info > /dev/null 2>&1 || die "DB=docker but the Docker daemon is not running. Start it, or drop DB=docker to use dynalite." ;;
  *) die "Unknown DB=$DB (use 'lite' or 'docker')." ;;
esac

port_busy() {
  if command -v ss > /dev/null; then
    [ -n "$(ss -ltnH "sport = :$1" 2> /dev/null)" ]
  else
    (exec 3<> "/dev/tcp/127.0.0.1/$1") 2> /dev/null
  fi
}
for port in 8000 3000 5173; do
  port_busy "$port" && die "Port $port is already in use. Stop whatever is using it (ss -ltnp | grep :$port) and retry."
done

LOG_DIR="${STACK_LOG_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/fc-stack.XXXXXX")}"
mkdir -p "$LOG_DIR"

# ---- process management ----------------------------------------------------------------------------------------
# Every child runs in its own session/process group (setsid), so stopping it with `kill -- -PGID` also stops
# everything it spawned (npm → node → serverless-offline workers, tsx → dynalite, vite → esbuild).
PGIDS=()
NAMES=()
DOCKER_UP=0
STOPPING=0

start() { # start <name> <dir> <command...>
  local name="$1" dir="$2"; shift 2
  (cd "$dir" && exec setsid "$@") > "$LOG_DIR/$name.log" 2>&1 < /dev/null &
  PGIDS+=("$!")
  NAMES+=("$name")
}

cleanup() {
  [ "$STOPPING" = 1 ] && return
  STOPPING=1
  trap - INT TERM
  echo
  echo "Stopping stack…"
  local pg i
  for pg in "${PGIDS[@]}"; do kill -TERM -- "-$pg" 2> /dev/null || true; done
  for i in $(seq 1 50); do
    local alive=0
    for pg in "${PGIDS[@]}"; do kill -0 -- "-$pg" 2> /dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 0.2
  done
  for pg in "${PGIDS[@]}"; do kill -KILL -- "-$pg" 2> /dev/null || true; done
  if [ "$DOCKER_UP" = 1 ]; then (cd "$BACKEND_DIR" && docker compose down > /dev/null 2>&1) || true; fi
  echo "Stopped. Logs: $LOG_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail_with_log() { # fail_with_log <name> <message>
  echo "✖ $2" >&2
  echo "---- last lines of $LOG_DIR/$1.log ----" >&2
  tail -n 40 "$LOG_DIR/$1.log" >&2 || true
  exit 1
}

wait_for() { # wait_for <name> <pgid-or-empty> <timeout-seconds> <check-command...>
  local name="$1" pid="$2" timeout="$3"; shift 3
  local i
  for i in $(seq 1 "$timeout"); do
    "$@" && return 0
    if [ -n "$pid" ] && ! kill -0 "$pid" 2> /dev/null; then fail_with_log "$name" "$name exited before it was ready."; fi
    sleep 1
  done
  fail_with_log "$name" "$name was not ready within ${timeout}s."
}

http_code() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2> /dev/null || true; }
api_ready() { case "$(http_code http://localhost:3000/v1/me)" in 401 | 200) return 0 ;; *) return 1 ;; esac; }
vite_ready() { [ "$(http_code http://localhost:5173/)" = 200 ]; }
dynalite_ready() { grep -q 'dynalite ready' "$LOG_DIR/db.log" 2> /dev/null; }

echo "Logs: $LOG_DIR"

# ---- database --------------------------------------------------------------------------------------------------
if [ "$DB" = docker ]; then
  echo "▶ DynamoDB Local (Docker) on :8000"
  DOCKER_UP=1
  (cd "$BACKEND_DIR" && npm run db:up) > "$LOG_DIR/db.log" 2>&1 || fail_with_log db "npm run db:up failed."
else
  echo "▶ dynalite on :8000 (table fc-dev)"
  start db "$BACKEND_DIR" npm run db:lite
  wait_for db "${PGIDS[-1]}" 60 dynalite_ready
fi

# ---- backend ---------------------------------------------------------------------------------------------------
echo "▶ Backend (serverless-offline) on :3000"
start api "$BACKEND_DIR" env DYNAMO_ENDPOINT=http://localhost:8000 DYNAMO_TABLE=fc-dev TABLE_NAME=fc-dev RECEIPTS_BUCKET=local npm run dev
wait_for api "${PGIDS[-1]}" 120 api_ready

# ---- frontend --------------------------------------------------------------------------------------------------
echo "▶ Frontend (Vite, dev auth) on :5173"
start web "$FRONTEND_DIR" npm run dev:local -- --strictPort --port 5173
wait_for web "${PGIDS[-1]}" 60 vite_ready

echo "✔ Stack is up: frontend http://localhost:5173 · API http://localhost:3000/v1 · Ctrl-C to stop"

# Exit (and stop the rest) as soon as any process dies.
set +e
wait -n "${PGIDS[@]}"
code=$?
for idx in "${!PGIDS[@]}"; do
  if ! kill -0 "${PGIDS[$idx]}" 2> /dev/null; then echo "✖ ${NAMES[$idx]} stopped (exit $code); see $LOG_DIR/${NAMES[$idx]}.log" >&2; fi
done
exit "$code"
