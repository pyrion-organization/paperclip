#!/bin/sh
set -eu

server_pid=""
worker_pid=""

email_worker_enabled() {
  case "${PAPERCLIP_EMAIL_WORKER_ENABLED:-true}" in
    0|false|FALSE|False|no|NO|No) return 1 ;;
    *) return 0 ;;
  esac
}

terminate() {
  if [ -n "$worker_pid" ] && kill -0 "$worker_pid" 2>/dev/null; then
    kill "$worker_pid" 2>/dev/null || true
  fi
  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap 'terminate; exit 143' INT TERM

node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js &
server_pid="$!"

if ! email_worker_enabled; then
  set +e
  wait "$server_pid"
  status="$?"
  set -e
  exit "$status"
fi

port="${PORT:-3100}"
health_url="http://127.0.0.1:${port}/api/health"
timeout_seconds="${PAPERCLIP_DOCKER_STARTUP_TIMEOUT_SECONDS:-120}"
elapsed=0

echo "Waiting for Paperclip API at ${health_url} before starting inbound email worker"
while ! curl -fsS "$health_url" >/dev/null 2>&1; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    set +e
    wait "$server_pid"
    status="$?"
    set -e
    exit "$status"
  fi
  if [ "$elapsed" -ge "$timeout_seconds" ]; then
    echo "Timed out waiting for Paperclip API after ${timeout_seconds}s" >&2
    terminate
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/email-worker.js &
worker_pid="$!"

while :; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    set +e
    wait "$server_pid"
    status="$?"
    set -e
    terminate
    exit "$status"
  fi
  if ! kill -0 "$worker_pid" 2>/dev/null; then
    set +e
    wait "$worker_pid"
    status="$?"
    set -e
    terminate
    exit "$status"
  fi
  sleep 2
done
