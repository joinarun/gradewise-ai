#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" != 4 ]]; then
  echo 'Usage: scripts/assemble-demo.sh cloud-recording.webm offline-recording.webm review-recording.mp4 output.mp4' >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
cloud="$1"
offline="$2"
review="$3"
output="$4"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

render() {
  local source="$1" segment="$2" narration="$3" duration speech_length source_length=0
  local -a visual_options=(-i "$source")
  say -v Samantha -r 167 -o "$scratch/$segment.aiff" "$narration"
  speech_length="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$scratch/$segment.aiff")"
  if [[ "$source" == *.png ]]; then
    visual_options=(-loop 1 -i "$source")
  else
    source_length="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$source")"
  fi
  duration="$(awk -v speech="$speech_length" -v video="$source_length" 'BEGIN {
    seconds = speech + 0.5
    if (video > seconds) seconds = video
    printf "%.3f", seconds
  }')"
  ffmpeg -hide_banner -loglevel error -y "${visual_options[@]}" -i "$scratch/$segment.aiff" \
    -vf 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xf5f3ff,setsar=1,fps=25,tpad=stop_mode=clone:stop_duration=120,format=yuv420p' \
    -af apad -map 0:v:0 -map 1:a:0 -t "$duration" -c:v libx264 -preset fast -crf 20 \
    -c:a aac -ar 48000 -ac 2 "$scratch/$segment.mp4"
  printf 'file %s.mp4\n' "$segment" >> "$scratch/segments.txt"
}

ffmpeg -hide_banner -loglevel error -y \
  -i "$root/apps/android/screenshots/teacher-workspace.png" -i "$root/apps/ios/screenshots/teacher-workspace.png" \
  -filter_complex '[0:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2:color=0xf5f3ff,setsar=1[left];[1:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2:color=0xf5f3ff,setsar=1[right];[left][right]hstack=inputs=2' \
  -frames:v 1 -update 1 "$scratch/native.png"

render "$root/apps/web/screenshots/assessment-overview.png" opening \
  'GradeWise A I helps teachers apply the same marking scheme across a class. It uses cloud Gemini to prepare the rubric, then grades locally on supported devices.'
render "$cloud" cloud \
  'We create a synthetic science exam and give Firebase A I Logic its paper and answer key. Gemini prepares an editable rubric. The teacher approves it. On a browser without the local model, GradeWise asks permission before sending an answer to Gemini.'
render "$offline" offline \
  'Here is the same workflow after the browser goes offline. Chrome runs the device model and Firebase reports the source as on device. The paraphrased roots answer receives two marks, with a quote supporting each criterion. The teacher approves the score, and it remains after an offline reload.'
render "$review" review \
  'The teacher can inspect each criterion, enter a final score, and export the class results. The seven-entry synthetic benchmark included correct, partial, incorrect, ambiguous, and malformed answers. Validated device proposals matched three teacher scores. Cloud proposals matched four.'
render "$scratch/native.png" native \
  'The Android and i O S apps share the marking rules. Both passed real Firebase cloud grading and App Check. The project uses synthetic examples, and the delivery report documents the measured results.'
render "$root/apps/web/screenshots/assessment-overview.png" closing \
  'Try GradeWise A I at grade wise A I twenty twenty six dot web dot app. The site includes a sample exam you can explore.'

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$scratch/segments.txt" -c copy \
  -metadata title='GradeWise AI – BuildHybridAI 2026 demonstration' -movflags +faststart "$output"
