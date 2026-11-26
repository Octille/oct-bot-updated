# Deploying OctBot 3.0

This guide gets the bot running 24/7 on a server, for a beginner. Part 1 works on **any Ubuntu
server with Docker**. Part 2 covers Google Cloud, the current host. Then there are sections for
testing with a copy of the data, everyday tasks, and moving to a new host.

> **Golden rule:** only one copy of the bot may run on a token at a time. Two copies on the same token
> answer every command twice and fight over music. Before you start a bot anywhere, stop it everywhere else,
> including on your laptop (`Ctrl+C` in the terminal running `npm run dev`).

## What runs on the server

Docker Compose (`docker-compose.yml`) starts these containers, and restarts them after a crash or a reboot:

| Container | What it is |
|---|---|
| `bot` | OctBot itself, built from this repo. |
| `lavalink` | The music server. It runs the official build, or the patched SoundCloud build when `LAVALINK_PATCHED=true`. Only the bot can reach it; no ports are opened. |
| `backup` | Makes a `mongodump` of the database every day at 04:00 UTC into `backups/`. It keeps 14 days of backups. |
| `mongo` | **Only for staging** (`COMPOSE_PROFILES=staging`): a local database holding a *copy* of the data. The live bot uses MongoDB Atlas and doesn't run this. |

---

## Part 1: Any Ubuntu server with Docker

You need an Ubuntu 22.04 or 24.04 server with about 4 GB RAM, 2 CPUs and 20 GB disk, and SSH access to it.

### 1. Install Docker (once per server)

```sh
curl -fsSL https://raw.githubusercontent.com/Octille/oct-bot-updated/v3/deploy/setup-ubuntu.sh | sh
```

Then **log out and back in**, so you can use `docker` without `sudo`. To check it worked, run `docker run --rm hello-world`, which should print "Hello from Docker!".

### 2. Get the code

```sh
git clone -b v3 https://github.com/Octille/oct-bot-updated.git
cd oct-bot-updated
```

### 3. Create the `.env` file (the bot's secrets)

```sh
cp .env.example .env
nano .env
```

Fill these in. Save with `Ctrl+O`, `Enter`, and exit with `Ctrl+X`.

| Setting | Value |
|---|---|
| `token`, `CLIENT_ID` | From the Discord developer portal. Use the **test bot** for staging and the **real bot** only at the cutover. |
| `MONGODB_URI` | **Live:** your Atlas connection string. **Staging:** `mongodb://mongo:27017/octbot_staging?replicaSet=rs0` |
| `COMPOSE_PROFILES` | **Live:** leave it empty. **Staging:** `staging` |
| `LAVALINK_PASSWORD` | Any long random password, for example the output of `openssl rand -hex 24`. |
| `LAVALINK_PATCHED` | `true` to use the patched SoundCloud jar (step 4), otherwise `false`. |
| `OWNER_ID`, `ERROR_LOG_CHANNEL_ID`, `SPOTIFY_*` | Same as on your laptop. |

Leave these out on the server:
- `MONGODB_DEV_URI`
- `ALLOW_LIVE_DB`
- `MONGODB_SRV` (use `MONGODB_URI`)
- `ANTI_ALT_*` (test bot only)

Docker sets `NODE_ENV=production` by itself.

The `.env` holds passwords. Never commit it or paste it anywhere. `chmod 600 .env` makes it readable by you only.

### 4. (Optional) The patched SoundCloud Lavalink jar

The official Lavalink 4.2.2 can't play SoundCloud's new AAC streams (lavaplayer issue #204). Your patched build fixes that and also skips DRM-protected search results. It's 100 MB, so it isn't in git. Copy it from your laptop into `lavalink/` on the server:

```sh
# On your laptop (any provider):
scp "lavalink server/Lavalink-soundcloud-fix.jar" USER@SERVER_IP:oct-bot-updated/lavalink/
```

Google Cloud has an upload button for this; see Part 2, step 6. Then set `LAVALINK_PATCHED=true` in `.env`.

If the jar is missing, Lavalink logs a warning and uses the official build. Music still works for Bandcamp and links, but SoundCloud search won't. When an official Lavalink release includes the fix, follow PLAN.md §4 (Music): check that it also skips DRM results before you drop the patched jar.

### 5. Start it

```sh
docker compose up -d --build
docker compose ps            # all containers should say "running" (mongo: "healthy")
docker compose logs -f bot   # watch the bot start; Ctrl+C stops watching (the bot keeps running)
```

You should see `Connected to MongoDB` and `Logged in as …`. The first build takes a few minutes.

### 6. Register the slash commands

```sh
docker compose exec bot node dist/deploy-commands.js --guild     # test servers (instant)
docker compose exec bot node dist/deploy-commands.js --global    # real bot only, at the cutover (up to an hour to show up)
```

---

## Part 2: Google Cloud (Compute Engine)

### What to pick, and what it costs

- **Region:** `northamerica-northeast2` (Toronto), any zone (for example `northamerica-northeast2-a`).
- **Machine:** `e2-medium` (2 shared vCPUs, 4 GB RAM).
  - The bot uses about 250 MB of memory, Lavalink about 350–600 MB, and the staging Mongo about 300 MB, so this leaves plenty of room.
  - `e2-small` (2 GB) is too tight once music is playing.
- **Disk:** 20 GB "Balanced persistent disk", Ubuntu 24.04 LTS (x86/64).
- **Estimated cost:** about **$33–36 per month** in Toronto. These are approximate; the "Create VM" page shows the exact monthly estimate on the right, so check it there.

| Item | Approx. per month |
|---|---|
| e2-medium VM, running 24/7 | ~$27 |
| 20 GB balanced disk | ~$2 |
| Static external IP | ~$3.65 |
| Internet traffic (voice audio to Discord) | ~$1–4 |

- **Trial credit:** your $300 free trial started around **2026-11-22**. It lasts 90 days, so it ends around **2027-02-20**. Three months at ~$36 is about **$110**, well inside $300, with room for a second test VM if you ever need one.

### Steps you do yourself in the Google Cloud console

You have to do these in the browser. I can't do them for you.

**1. Set a budget alert first.** In the console, go to **Billing → Budgets & alerts → Create budget**.
- **Name:** `OctBot`.
- **Projects:** your project.
- **Amount:** `$50` per month, as a specified amount.
- **Alert thresholds:** 50%, 90% and 100%, with email alerts to you.

An alert only emails you; it doesn't stop anything. If you get the 90% email early in a month, something is wrong (for example a second VM left running).

**2. Turn on Compute Engine.** Go to **Compute Engine → VM instances**. If asked, click **Enable** and wait a minute.

**3. Reserve a static IP.** Go to **VPC network → IP addresses → Reserve external static IP address**.
- **Name:** `octbot-ip`.
- **Network Service Tier:** Premium.
- **Type:** Regional, region `northamerica-northeast2`.
- **Attached to:** None for now.

Write down the IP address. Atlas will need it at the cutover (see "Going live").

**4. Create the VM.** Click **Compute Engine → VM instances → Create instance**.
- **Name:** `octbot`. **Region:** `northamerica-northeast2`. **Zone:** any.
- **Machine configuration:** E2 → `e2-medium`.
- **OS and storage → Change:**
  - Ubuntu, Ubuntu 24.04 LTS (x86/64).
  - Balanced persistent disk, 20 GB.
  - Untick "Delete boot disk when instance is deleted", so your data survives an accidental delete.
- **Networking:**
  - Network interface → External IPv4 address → `octbot-ip` (the one you reserved).
  - Leave **Allow HTTP/HTTPS traffic unticked**. The bot needs no incoming traffic.
- **Data protection** (or Observability): leave the defaults.
- Click **Create**.

**5. Firewall.** You don't need to do anything. The default network only allows SSH (port 22) in, and that's all you need. Don't open port 2333 (Lavalink) or 27017 (Mongo) to the internet.

**6. Connect.** In the VM list, click **SSH** next to `octbot`. A terminal opens in your browser.
- Now follow **Part 1** in that window.
- To copy the patched jar over, use the **Upload file** button (the ⬆ icon at the top of the SSH window). It uploads to your home folder; then run `mv ~/Lavalink-soundcloud-fix.jar ~/oct-bot-updated/lavalink/`.
- To download a file (for example a backup), use **Download file** with the full path, such as `/home/YOU/oct-bot-updated/backups/octbot-20261201-040000.archive.gz`.

**7. Check reboots work (once).** Click **Stop**, then **Start** in the VM list. After a minute, SSH in and run `cd oct-bot-updated && docker compose ps`. Everything should be running again without you doing anything.

### When the free trial ends (around 2027-02-20, or when $300 is used up)

- Google **stops** the VM and keeps the disk for about 30 days. The bot goes offline; nothing is deleted straight away.
- **To keep the bot on Google Cloud:**
  - **Before** the end date, click **Activate full account** (top of the console) to turn on paid billing. The VM keeps running, and the bill is about $35 a month.
  - Keep the budget alert.
- **To move somewhere cheaper:** follow "Moving to a new host" below, *before* the trial ends.
- The always-free `e2-micro` is only in some US regions, and its 1 GB of RAM is too small for Lavalink.

---

## Staging: running against a COPY of the data (Phase 7c)

Use this to test the real migrated data on the server without touching the live database. It uses the **test bot's** token.

**On your laptop**, make a migrated copy and package it:

```sh
cd ~/Documents/Projects/oct-bot-updated/bot
sh scripts/copy-live-db.sh                    # fresh read-only copy of live -> local octbot_v2copy (+ a backup)
npm run migrate -- --uri "mongodb://localhost:27017/octbot_v2copy?directConnection=true"   # writes to the LOCAL copy only
docker exec octbot-mongo mongodump --db octbot_v2copy --archive --gzip > ~/octbot-backups/staging.archive.gz
```

**On the server**, with `.env` set for staging (`COMPOSE_PROFILES=staging`, the staging `MONGODB_URI`, and the test bot's `token`/`CLIENT_ID`):

```sh
mkdir -p ~/oct-bot-updated/backups
# Upload staging.archive.gz (Google Cloud: "Upload file", then:)
mv ~/staging.archive.gz ~/oct-bot-updated/backups/
cd ~/oct-bot-updated
docker compose up -d mongo              # starts the staging database
docker compose exec mongo mongorestore --archive=/backups/staging.archive.gz --gzip --drop \
  --nsFrom 'octbot_v2copy.*' --nsTo 'octbot_staging.*'
docker compose up -d --build            # starts the bot, Lavalink and backups
docker compose exec bot node dist/deploy-commands.js --guild
```

**Stop the test bot on your laptop first** (the golden rule). Then try it in your test server:
- A veteran's `/balance`: the badge shows, and the balance is under ₪500k.
- `/play` something on SoundCloud.
- `/eco stats`.
- Reboot the VM once, and check everything comes back.

---

## Everyday tasks

All of these run inside `~/oct-bot-updated` on the server.

| Task | Command |
|---|---|
| See what's running | `docker compose ps` |
| Follow the bot's logs | `docker compose logs -f bot`. Use `lavalink` or `backup` for the others; `--since 1h` limits how far back. |
| Restart the bot | `docker compose restart bot` |
| Update to the latest code | `sh deploy/update.sh` (git pull, rebuild, restart; about a minute offline) |
| Stop everything | `docker compose down` (data and backups stay) |
| List backups | `ls -lh backups/` |
| Make a backup now | `docker compose exec backup sh -c 'mongodump --uri "$MONGODB_URI" --archive=/backups/manual-$(date +%Y%m%d).archive.gz --gzip'` |
| Disk space | `df -h /`. Clear old images with `docker system prune -f`. |

Logs are capped at 50 MB per container, so they can't fill the disk.

The backups live on the same disk as the bot. Once a week or so, download the newest one to your laptop (Google Cloud: SSH window → **Download file**), so a lost VM doesn't take your backups with it.

**Restoring a backup:** this overwrites data, so check which file and which database first.

```sh
docker compose exec backup mongorestore --uri "$MONGODB_URI" --archive=/backups/FILE.archive.gz --gzip --drop
```

---

## Going live (Phase 7d, the cutover, done together)

1. **Atlas Network Access:** in the Atlas dashboard, go to **Security → Network Access → Add IP Address**, enter the VM's static IP (`octbot-ip`) and confirm. Without this, the bot can't connect to Atlas.
2. **Back up live** from your laptop with `sh scripts/copy-live-db.sh`. That also refreshes the local copy.
3. **Migrate live** from your laptop:
   ```sh
   npm run migrate -- --uri "<atlas uri>" --live --i-have-a-backup
   ```
   Run the `--dry-run` version first and compare it with the copy.
4. **Stop the old v2 bot** wherever it runs, and stop the test bot if it uses the same token. Never two copies on one token.
5. On the server:
   - **Edit `.env`:**
     - Real bot `token` and `CLIENT_ID`.
     - Atlas `MONGODB_URI`.
     - Empty `COMPOSE_PROFILES`.
     - No `ANTI_ALT_*`.
     - `LAUNCH_DATE` set to today.
     - The real `SEASON_1_START`.
   - **Run:** `docker compose down`, then `docker compose up -d --build`. Finally, register the commands with `docker compose exec bot node dist/deploy-commands.js --global`.
6. **Stop the staging database:** `docker compose rm -sf mongo` (and `docker volume rm oct-bot-updated_mongo-data` once you're sure).

---

## Moving to a new host

Do these in order. Everything stays on the old host until the new one is proven.

1. **Set up the new server** with Part 1 (Docker, `git clone`). Don't start the bot yet.
2. **Copy `.env`** from the old server to the new one, privately (download/upload or `scp`, never chat or email). Then run `chmod 600 .env`.
3. **Copy the patched jar** into `lavalink/` if `LAVALINK_PATCHED=true`.
4. **Atlas IP allowlist:** add the **new** server's IP in Atlas → Network Access. Keep the old one for now.
5. **Firewall:** incoming SSH only. Don't open Lavalink (2333) or Mongo (27017) ports. On a plain Ubuntu host you can run `sudo ufw allow OpenSSH && sudo ufw enable`.
6. **Backups:** make a fresh backup on the old host and download it, so you have a copy that's on neither server.
7. **Start new, then stop old:** the golden rule says never two copies on one token, so the switch needs a moment of downtime.
   1. On the new server, run `docker compose build` (this builds without starting anything).
   2. On the old server, run `docker compose down`.
   3. On the new server, run `docker compose up -d` and watch `docker compose logs -f bot` until it says `Logged in`.
   4. Try a few commands, including music.
8. **Clean up the old host** a few days later: remove its IP from Atlas Network Access, download any backups you want, then delete the server. On Google Cloud, also release the static IP; a reserved IP that's no longer attached still costs money.

---

## Troubleshooting

| Problem | Likely cause |
|---|---|
| Logs say `MongoServerSelectionError` or the connection times out | The server's IP isn't in Atlas Network Access, or `MONGODB_URI` is wrong. |
| `Invalid environment: …` | A required `.env` value is missing (`token`, `CLIENT_ID`, `MONGODB_URI`). |
| Music: "Song search is temporarily unavailable" | The official Lavalink is running. Copy the patched jar over and set `LAVALINK_PATCHED=true`, then run `docker compose up -d lavalink`. |
| Commands answer twice | Two copies of the bot are running on one token. Stop one. |
| Slash commands missing | Run the `deploy-commands` step. Global commands take up to an hour. |
| `docker: permission denied` | Log out and back in after the setup script. |
