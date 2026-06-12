#!/bin/zsh
set -e

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Please install Node.js first."
  echo "Download: https://nodejs.org/"
  read -k 1 "?Press any key to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

PORT="${PORT:-3000}"
while lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:$PORT"

echo "Starting Kie Media Studio..."
echo "URL: $URL"
echo
echo "Keep this Terminal window open while using the app."
echo "Press Control-C here to stop the server."
echo

(
  sleep 2
  open "$URL" >/dev/null 2>&1 || true
) &

PORT="$PORT" npm run dev
