#!/bin/sh
set -eu

source_plist="$SRCROOT/GoogleService-Info.plist"
destination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/GoogleService-Info.plist"
if [ -f "$source_plist" ]; then
  /usr/bin/plutil -lint "$source_plist" >/dev/null
  /bin/cp "$source_plist" "$destination"
else
  /bin/rm -f "$destination"
fi
