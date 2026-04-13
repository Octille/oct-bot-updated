#!/bin/sh
echo "--- STEP 1: Booting Lavalink ---"
# We redirect Lavalink's output to a file and run it in the background
cd /app/lavalink && java -jar Lavalink.jar > /app/lavalink_boot.log 2>&1 &

echo "--- STEP 2: Waiting for Lavalink (30s) ---"
# Give it a long head start for plugins to load
sleep 30

# Print the last few lines of the Lavalink log so we can see the error if it crashed
echo "--- DEBUG: Last 20 lines of Lavalink Log ---"
tail -n 20 /app/lavalink_boot.log

echo "--- STEP 3: Booting Node Bot ---"
cd /app
node index.js