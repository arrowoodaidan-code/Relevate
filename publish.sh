#!/usr/bin/env bash
# Rebuild the site and (re)start the production server on $PORT (default 3000).
# Build runs in the foreground so errors surface; the server is launched in a new
# session (setsid) so it keeps running after this script — and your shell — exits.
#
# Restart discipline: this script stops ONLY the instance it previously started
# (identified by .run/server.pid plus a serve.ts cmdline check) and never signals
# any other process. serve.ts itself never kills anything; if the port is still
# held by something we did not start, the new server refuses to bind, fails
# loudly in .run/server.log, and this script surfaces that instead of pretending
# the publish succeeded.
set -euo pipefail
cd "$(dirname "$0")"

# Group-writable so any team member can publish over another member's build.
umask 002
mkdir -p .run

PORT="${PORT:-3000}"

# Stop the previous instance of THIS server, and only this one: the pid must
# exist AND its cmdline must still be this serve.ts (guards against pid reuse).
if [ -f .run/server.pid ]; then
  OLD_PID="$(cat .run/server.pid 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && [ -d "/proc/$OLD_PID" ] \
     && tr '\0' ' ' < "/proc/$OLD_PID/cmdline" 2>/dev/null | grep -q "serve.ts"; then
    kill "$OLD_PID" 2>/dev/null || true
    for _ in $(seq 1 25); do
      [ -d "/proc/$OLD_PID" ] || break
      sleep 0.2
    done
    [ -d "/proc/$OLD_PID" ] && echo "warning: previous server (pid $OLD_PID) still stopping" >&2
  fi
  rm -f .run/server.pid
fi

bun run build
PORT="$PORT" setsid nohup bun run start > .run/server.log 2>&1 < /dev/null &

# Wait for the new server to actually answer before reporting success, so a
# startup crash (e.g. port held by a process we never started) surfaces here
# instead of silently leaving the old page live.
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null "http://localhost:${PORT}"; then
    echo "site published; serving on port ${PORT}"
    exit 0
  fi
  sleep 0.2
done
echo "warning: published, but the server isn't responding — check .run/server.log" >&2
tail -5 .run/server.log >&2 || true
exit 1
