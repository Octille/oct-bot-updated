# Setting Up Your Lavalink Server

## Why Lavalink?
Lavalink offloads all audio processing to a separate Java server, making your bot significantly lighter and more stable. Your bot simply sends commands; Lavalink handles the actual streaming.

---

## Step 1 — Install Java 17+

Lavalink requires Java 17 or newer.

- **Windows/Mac**: Download from https://adoptium.net
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt install openjdk-17-jre-headless
  ```

Verify: `java -version`

---

## Step 2 — Download Lavalink

Download the latest `Lavalink.jar` from:
https://github.com/lavalink-devs/Lavalink/releases/latest

Place it in the `lavalink/` folder next to `application.yml`.

---

## Step 3 — Download the YouTube Plugin

Since Lavalink v4 removed built-in YouTube support, you need the plugin.

Create a `plugins/` folder inside `lavalink/` and download the jar from:
https://github.com/lavalink-devs/youtube-source/releases/latest

Your folder structure should look like:
```
lavalink/
  Lavalink.jar
  application.yml
  plugins/
    youtube-plugin-x.x.x.jar
```

Alternatively, just leave the `plugins:` block in `application.yml` — Lavalink will auto-download it on first start if you have internet access.

---

## Step 4 — Configure

Edit `lavalink/application.yml` if you want to change the port or password.
Then update your bot's `.env` to match:
```
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
```

---

## Step 5 — Start Lavalink

```bash
cd lavalink
java -jar Lavalink.jar
```

You should see `Lavalink is ready to accept connections`.

---

## Step 6 — Start Your Bot

In a separate terminal, from the bot's root directory:
```bash
npm install
npm start
```

---

## Hosting Lavalink Remotely (Optional)

If you're hosting your bot on a VPS or cloud service, run Lavalink there too and set `LAVALINK_HOST` to the server's IP or domain. For free options, look into:
- Your existing VPS (cheapest)
- Oracle Cloud Free Tier
- Railway.app (has a Lavalink template)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ECONNREFUSED` | Lavalink isn't running — start it first |
| `Invalid password` | Password mismatch between `application.yml` and `.env` |
| No search results | YouTube plugin not loaded — check Lavalink console for errors |
| Bot joins but no audio | Check firewall allows UDP on Lavalink's port |
