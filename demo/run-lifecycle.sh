#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/private/tmp/dogfood-lifecycle-browsers}"

DEMO_CONTAINER="dogfood-lifecycle-demo-$$"
DEMO_APP_CONTAINER="dogfood-lifecycle-app-$$"
DEMO_NETWORK="dogfood-lifecycle-net-$$"
# Production image built by `podman compose up -d --build`.
DEMO_IMAGE="${DEMO_IMAGE:-docker.io/library/dogfood-platform-web:latest}"
DEMO_DB_PORT="${DEMO_DB_PORT:-55439}"
DEMO_APP_PORT="3001"
DEMO_DATABASE_URL="postgresql://dogfood:dogfood@127.0.0.1:${DEMO_DB_PORT}/dogfood_demo"

if ! podman image exists docker.io/library/postgres:17; then
  echo "Missing local image docker.io/library/postgres:17; pull it before running this offline demo." >&2
  exit 1
fi
if ! podman image exists "$DEMO_IMAGE"; then
  echo "Missing app image ${DEMO_IMAGE}; build it with 'podman compose build web' first." >&2
  exit 1
fi
if podman ps --format '{{.Ports}}' | grep -q "127\.0\.0\.1:${DEMO_DB_PORT}->"; then
  echo "Demo database port ${DEMO_DB_PORT} is already in use; set DEMO_DB_PORT to another free port." >&2
  exit 1
fi
if (echo >/dev/tcp/127.0.0.1/"$DEMO_APP_PORT") >/dev/null 2>&1; then
  echo "Demo app port ${DEMO_APP_PORT} is already in use; stop the conflicting process before running this demo." >&2
  exit 1
fi

cleanup() {
  podman stop "$DEMO_APP_CONTAINER" "$DEMO_CONTAINER" >/dev/null 2>&1 || true
  podman network rm "$DEMO_NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

podman network create "$DEMO_NETWORK" >/dev/null

podman run --detach --rm \
  --name "$DEMO_CONTAINER" \
  --network "$DEMO_NETWORK" --network-alias db \
  --env POSTGRES_USER=dogfood \
  --env POSTGRES_PASSWORD=dogfood \
  --env POSTGRES_DB=dogfood_demo \
  --publish "127.0.0.1:${DEMO_DB_PORT}:5432" \
  docker.io/library/postgres:17 >/dev/null

ready=0
for attempt in $(seq 1 60); do
  if podman exec "$DEMO_CONTAINER" pg_isready -U dogfood -d dogfood_demo >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Disposable demo PostgreSQL did not become ready." >&2
  exit 1
fi

(
  cd packages/db
  DATABASE_URL="$DEMO_DATABASE_URL" bun src/seed.ts
)
podman run --detach --rm \
  --name "$DEMO_APP_CONTAINER" \
  --network "$DEMO_NETWORK" \
  --env DATABASE_URL=postgresql://dogfood:dogfood@db:5432/dogfood_demo \
  --env APP_URL="http://localhost:${DEMO_APP_PORT}" \
  --env DOGFOOD_MODE=local \
  --env DOGFOOD_SEED_FIXTURES=0 \
  --publish "127.0.0.1:${DEMO_APP_PORT}:3000" \
  "$DEMO_IMAGE" >/dev/null

ready=0
for attempt in $(seq 1 90); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${DEMO_APP_PORT}/"; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Demo app container did not become ready." >&2
  podman logs "$DEMO_APP_CONTAINER" >&2 || true
  exit 1
fi

DATABASE_URL="$DEMO_DATABASE_URL" APP_URL="http://localhost:${DEMO_APP_PORT}" \
  bunx playwright test --config demo/playwright.config.ts

VIDEO_PATH="$(find demo/artifacts/test-results -type f -name '*.webm' -print -quit)"
if [[ -n "$VIDEO_PATH" ]]; then
  VIDEO_SIZE="$(wc -c < "$VIDEO_PATH" | tr -d ' ')"
  if (( VIDEO_SIZE <= 25000000 )); then
    cp "$VIDEO_PATH" demo/artifacts/lifecycle.webm
    echo "Recorded demo: demo/artifacts/lifecycle.webm (${VIDEO_SIZE} bytes)"
  else
    echo "Recorded test video is ${VIDEO_SIZE} bytes (>25 MB); left it at ${VIDEO_PATH} and skipped the distributable copy." >&2
  fi
else
  echo "Playwright completed without a video file." >&2
  exit 1
fi
