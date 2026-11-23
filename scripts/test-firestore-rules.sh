#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ "$(uname -s)" == Darwin ]] && /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
  export JAVA_HOME
  JAVA_HOME="$(/usr/libexec/java_home -v 21)"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
npm exec --yes --package firebase-tools@15.37.0 -- firebase emulators:exec \
  --only firestore --project demo-gradewise-ai 'node --test tests/integration/firestore.rules.test.mjs'
