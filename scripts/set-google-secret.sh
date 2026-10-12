#!/bin/sh
# Stores the Google OAuth client secret from the clipboard as the Worker secret GOOGLE_CLIENT_SECRET.
# Copy the secret in Google Cloud Console first, then run: sh scripts/set-google-secret.sh
# Refuses anything that doesn't look like a Google client secret, so a wrong clipboard is never stored.
s=$(pbpaste)
case "$s" in
  GOCSPX-*) ;;
  *) echo "Clipboard doesn't hold a Google client secret (should start with GOCSPX-). Copy it and run this again."; exit 1 ;;
esac
if [ "${#s}" -gt 60 ]; then echo "Clipboard holds more than a client secret. Copy just the secret and run this again."; exit 1; fi
printf %s "$s" | npx wrangler secret put GOOGLE_CLIENT_SECRET
