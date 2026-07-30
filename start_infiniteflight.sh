#!/bin/bash
# start_infiniteflight.sh - launch / restart / stop the InfiniteFlight local server
#
#   ./start_infiniteflight.sh            start the server and open the sim in Chrome
#   ./start_infiniteflight.sh --joystick start and open the joystick test/calibration page
#   ./start_infiniteflight.sh --restart  stop then start again
#   ./start_infiniteflight.sh --stop     stop the server
#   ./start_infiniteflight.sh --no-open  start the server, do not open a browser
#
# The sim MUST be served over http:// (not opened as a file://). Browsers block
# ES module imports and the Gamepad API behaves badly on file:// URLs.

set -u

PORT=8471
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$DIR/logs"
LOG="$LOGDIR/infiniteflight-$(date +%Y-%m-%d).log"
PAGE="index.html"
OPEN_BROWSER=1

mkdir -p "$LOGDIR"

stop_server() {
  local pids
  pids=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Stopping server on port $PORT (pid $pids)"
    kill $pids 2>/dev/null
    sleep 1
    pids=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
    echo "Stopped."
  else
    echo "No server running on port $PORT."
  fi
}

start_server() {
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Server already running on port $PORT (reusing it)."
  else
    echo "Starting server on port $PORT ..."
    ( cd "$DIR" && nohup python3 -m http.server $PORT >>"$LOG" 2>&1 & )
    sleep 1
    if lsof -nP -iTCP:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "Server up. Log: $LOG"
    else
      echo "FAILED to start the server. Check $LOG"
      exit 1
    fi
  fi

  local url="http://localhost:$PORT/$PAGE"
  echo ""
  echo "  Flight sim ......... http://localhost:$PORT/index.html"
  echo "  Joystick test ...... http://localhost:$PORT/joystick_test_v01.0.0_July6.html"
  echo ""
  echo "  Stop it with: ./start_infiniteflight.sh --stop"
  echo ""

  if [ "$OPEN_BROWSER" -eq 1 ]; then
    echo "Opening $url in Chrome ..."
    open -a "Google Chrome" "$url" 2>/dev/null || open "$url"
  fi
}

case "${1:-}" in
  --stop)
    stop_server
    exit 0
    ;;
  --restart)
    stop_server
    start_server
    ;;
  --joystick)
    PAGE="joystick_test_v01.0.0_July6.html"
    start_server
    ;;
  --no-open)
    OPEN_BROWSER=0
    start_server
    ;;
  "")
    start_server
    ;;
  *)
    echo "Usage: $0 [--restart | --stop | --joystick | --no-open]"
    exit 1
    ;;
esac
