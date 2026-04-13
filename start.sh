#!/bin/sh

# 1. Start Lavalink in the background
echo "Starting Lavalink..."
cd lavalink && java -jar Lavalink.jar &

# 2. Wait for Lavalink to warm up
# It takes a bit to load plugins and Java. 20s is safe.
echo "Waiting 20 seconds for Lavalink to boot..."
sleep 20

# 3. Start the Bot
echo "Starting the Bot..."
cd /app
node index.js