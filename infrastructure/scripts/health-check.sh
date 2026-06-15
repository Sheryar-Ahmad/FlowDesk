#!/usr/bin/env sh
set -eu

BACKEND_URL=${BACKEND_URL:-http://localhost:8000}
FRONTEND_URL=${FRONTEND_URL:-http://localhost:5173}

curl --fail --silent --show-error "${BACKEND_URL}/health"
printf "\n"
curl --fail --silent --show-error "${FRONTEND_URL}/" >/dev/null

echo "FlowDesk frontend and backend are reachable."
