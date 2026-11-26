# OctBot

A Discord economy and music bot, built on slash commands. Type `/menu` in any server to start.

- **Economy:** jobs, businesses, fishing, mining, hunting, digging, crime and robbing, a shop with daily rotation, items and pets, trading, quests, crates.
- **Levels:** chat and voice XP, rank and profile cards, achievements, prestige, server reward roles, seasons and leaderboards.
- **Games and events:** casino games, chat drops, weekly boss raids and community goals.
- **Music:** search as you type, Spotify and Apple Music links, SoundCloud, Bandcamp and audio files, with a now-playing panel.
- **Server tools:** moderation with a mod log, role panels, polls, AFK, `/settings` for admins.

OctBot asks Discord for no privileged intents: it never reads message text or downloads member lists.

## Stack

TypeScript on Node 20, discord.js 14, MongoDB (mongoose), Lavalink 4 for music (lavalink-client), Vitest. Production runs in Docker Compose: the bot, Lavalink, a signature helper for Lavalink's YouTube plugin, daily backups and an offsite copy.

## Running it

- **Server (production):** follow [docs/DEPLOY.md](docs/DEPLOY.md): any Ubuntu host with Docker, or Google Cloud.
- **Local development:**
  1. `npm ci`, then copy `.env.example` to `.env`. Use the **test bot's** token, and point `MONGODB_DEV_URI` at a local MongoDB replica set. The bot refuses a hosted database outside production.
  2. Start a Lavalink 4 server with `lavalink/application.yml`.
  3. `npm run dev`, and register the commands in your test servers with `npm run deploy:guild`.

| Command | What it does |
|---|---|
| `npm run dev` | Run the bot from source, restarting on changes |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled bot |
| `npm test` | The test suite (uses an in-memory MongoDB) |
| `npm run typecheck` | Type-check everything, tests included |
| `npm run deploy:guild` / `deploy:global` | Register slash commands in test servers / everywhere |
| `npm run migrate` | The one-time import from the original bot's data (see PLAN.md §6) |

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md): servers, backups, YouTube sign-in, going live, moving hosts
- [PLAN.md](PLAN.md): architecture, decisions and the phase checklist
- [BALANCE.md](BALANCE.md): economy numbers
- [docs/TERMS.md](docs/TERMS.md) and [docs/PRIVACY.md](docs/PRIVACY.md)
