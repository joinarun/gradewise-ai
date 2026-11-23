#!/usr/bin/env bash
set -euo pipefail

project="${1:-gradewise-ai-2026}"
if [[ "$project" != gradewise-ai-* ]]; then
  echo 'Expected a dedicated GradeWise project ID beginning with gradewise-ai-.' >&2
  exit 2
fi
gcloud projects describe "$project" --format='value(projectId,lifecycleState)'
gcloud services enable --project "$project" \
  firebasevertexai.googleapis.com generativelanguage.googleapis.com
gcloud services list --enabled --project "$project" \
  --filter='config.name:(firebasevertexai.googleapis.com OR generativelanguage.googleapis.com)' \
  --format='value(config.name)'
echo 'Run the live smoke test before using cloud inference.'
