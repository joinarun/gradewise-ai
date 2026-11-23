#!/bin/sh
set -eu

root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$root"
output="$(mktemp -d "${TMPDIR:-/tmp}/gradewise-ios.XXXXXXXX")"
trap 'rm -rf "$output"' EXIT INT TERM

xcrun swiftc -o "$output/GradeWiseCoreChecks" \
  apps/ios/GradeWise/GradingContract.swift \
  apps/ios/GradeWise/GradingPolicy.swift \
  apps/ios/GradeWise/WorkspaceModels.swift \
  apps/ios/GradeWise/DocumentImport.swift \
  apps/ios/Tests/Host/GradeWiseCoreChecks.swift
"$output/GradeWiseCoreChecks"
