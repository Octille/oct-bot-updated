#!/bin/sh
# Lavalink container entrypoint (docker-compose.yml). Uses the official Lavalink.jar from the image,
# or the patched SoundCloud build when LAVALINK_PATCHED=true and lavalink/Lavalink-soundcloud-fix.jar
# has been copied to the server (it's 100 MB and not in git; see docs/DEPLOY.md).
cd /opt/Lavalink
JAR=/opt/Lavalink/Lavalink.jar
if [ "$LAVALINK_PATCHED" = "true" ]; then
  if [ -f /opt/Lavalink/custom/Lavalink-soundcloud-fix.jar ]; then
    JAR=/opt/Lavalink/custom/Lavalink-soundcloud-fix.jar
  else
    echo "LAVALINK_PATCHED=true but lavalink/Lavalink-soundcloud-fix.jar is missing: using the official build"
  fi
fi
echo "Starting $JAR"
# shellcheck disable=SC2086
exec java $JAVA_OPTS -jar "$JAR"
