#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
    printf 'Usage: %s BOOTED_SIMULATOR_ID APPCHECK_DEBUG_TOKEN_FILE\n' "$0" >&2
    exit 2
fi

simulator="$1"
token_file="$2"
root="$(cd "$(dirname "$0")/../../.." && pwd)"
app="$root/apps/ios/Build/Build/Products/Debug-iphonesimulator/GradeWise.app"
if [ ! -f "$app/GoogleService-Info.plist" ]; then
    printf 'Build the Debug simulator app with the registered iOS Firebase configuration.\n' >&2
    exit 2
fi
if [ ! -s "$token_file" ]; then
    printf 'Supply a file containing the registered iOS App Check debug token.\n' >&2
    exit 2
fi

bundle_id=app.gradewise.ios
test_id="$(uuidgen)"
xcrun simctl install "$simulator" "$app"
SIMCTL_CHILD_GRADEWISE_LIVE_SMOKE_ID="$test_id" \
    SIMCTL_CHILD_FIRAAppCheckDebugToken="$(cat "$token_file")" \
    xcrun simctl launch --terminate-running-process "$simulator" "$bundle_id" >&2
container="$(xcrun simctl get_app_container "$simulator" "$bundle_id" data)"
python3 - "$container/tmp/gradewise-live-$test_id.json" <<'PY'
import json
from pathlib import Path
import sys
import time

report_path = Path(sys.argv[1])
deadline = time.monotonic() + 150
while time.monotonic() < deadline:
    if report_path.is_file():
        report = json.loads(report_path.read_text())
        if report["finished"]:
            print(json.dumps(report, indent=2, sort_keys=True))
            expected = {"appCheck", "cloudRubric", "cloudGrade", "sdkHybrid"}
            checks = report["checks"]
            passed = expected <= checks.keys() and all(checks[name]["status"] == "passed" for name in expected)
            raise SystemExit(0 if passed else 1)
    time.sleep(1)
if report_path.is_file():
    print(json.dumps(json.loads(report_path.read_text()), indent=2, sort_keys=True))
print("The iOS Firebase smoke did not finish before its deadline.", file=sys.stderr)
raise SystemExit(1)
PY
