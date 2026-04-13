#!/bin/sh
echo "--- Checking for Lavalink.jar ---"
ls -l /app/lavalink/Lavalink.jar

echo "--- Starting Lavalink ---"
cd /app/lavalink && java -jar Lavalink.jar &

echo "--- Waiting for boot ---"
sleep 25

echo "--- Starting Bot ---"
cd /app
node index.js