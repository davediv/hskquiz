#!/usr/bin/env bash
# Keeps the screenshot dev server alive. Parallel builders editing at once make vite's HMR
# fall over (seen: exit 144), and a dead server silently invalidates every critic's evidence.
# Only acts when the port is actually unserved, so it never disturbs a healthy server.
cd "$(dirname "$0")/.." || exit 1
while true; do
	if ! curl -s -o /dev/null -m 8 http://127.0.0.1:5177/ 2>/dev/null; then
		echo "$(date '+%H:%M:%S') dev server down — restarting"
		npx vite dev --port 5177 --strictPort --host 127.0.0.1 >> /tmp/hskquiz-dev.log 2>&1 &
		sleep 90
	fi
	sleep 20
done
