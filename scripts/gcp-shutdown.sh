#!/usr/bin/env bash
set -euo pipefail

project="${1:-gradewise-ai-2026}"
if [[ "$project" != gradewise-ai-* ]]; then
  echo 'Expected a dedicated GradeWise project ID beginning with gradewise-ai-.' >&2
  exit 2
fi
gcloud projects describe "$project" --format='value(projectId,lifecycleState)'
for service in firebasevertexai.googleapis.com generativelanguage.googleapis.com; do
  enabled="$(gcloud services list --enabled --project "$project" \
    --filter="config.name=$service" --format='value(config.name)')"
  if [[ "$enabled" == "$service" ]]; then
    gcloud services disable "$service" --project "$project" --quiet
  fi
done
remaining="$(gcloud services list --enabled --project "$project" \
  --filter='config.name:(firebasevertexai.googleapis.com OR generativelanguage.googleapis.com)' \
  --format='value(config.name)')"
if [[ -n "$remaining" ]]; then
  printf 'These APIs remain enabled:\n%s\n' "$remaining" >&2
  exit 1
fi
echo 'Firebase AI Logic and Gemini Developer API are disabled. Firebase Hosting and App Check registrations are retained.'
