#!/bin/sh
echo "--- Starting All-in-One Container ---"

# Start Lavalink
cd /app/lavalink && java -jar Lavalink.jar &

# Wait for it to be ready
echo "--- Giving Lavalink time to boot ---"
sleep 20

# Start the bot
echo "--- Launching Bot ---"
cd /app
node index.js