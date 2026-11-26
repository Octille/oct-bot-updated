# OctBot Privacy Policy

> **Before publishing:** replace every `CONTACT_EMAIL` below with a real address. Don't put this page's
> link into the Discord developer portal until that's done.

_Last updated: LAUNCH_DATE_

OctBot is a Discord bot run by Octille, one person, as a hobby project. This page explains what it stores and why. There is no website, no ads, and nothing is sold or shared.

## What OctBot stores

OctBot only stores what it needs to run its features. All of it is tied to Discord IDs (numbers), not to your name or email.

**About you, once you use OctBot:**
- Your **game profile**: coins, bank, items, levels and XP, quests, achievements, pets, businesses, cosmetics, cooldowns, stats, and when you were last active.
- A **log of coin and item changes** (for example "+500 coins from /work"). It's used to fix bugs, undo exploits and keep the economy fair.
- Your **level in each server** you chat in.
- An **AFK note** you set yourself with /afk, until you come back.

**About servers that use OctBot:**
- Server settings chosen by the server's admins: channels, roles, the welcome message, level rewards and similar.
- Moderation records made by that server's moderators with OctBot: warnings (the reason they typed, who gave it and when) and case numbers.
- Ticket records: who opened a ticket, its number, and when it was opened and closed. The ticket's messages stay in Discord. OctBot doesn't copy them.
- Role panels and the role each button gives.

**Message text.** OctBot can read messages so it can:
- ignore very short messages for chat XP;
- remove invite links, when a server turns that on;
- reply to old `!commands` with a pointer to the new slash commands.

It doesn't save message text, apart from the warning reasons and AFK notes described above.

**Music.** OctBot keeps the queue and recent songs in memory while it's playing in your server. Nothing about music is saved. To find songs, what you type in /play is sent to Spotify, SoundCloud and Deezer. Only the search words are sent, not who typed them.

## Data from the original OctBot (2021–2022)

The original OctBot's data was kept when the bot came back:
- Profiles of players who were active then were converted to the new bot. Converted profiles are stored like any other profile (see above).
- **Every other old profile is deleted 12 months after the relaunch** (LAUNCH_DATE), if its player hasn't used OctBot again by then. Until then, the profile is only kept so that it can be converted if that player comes back.

## Where it's stored and who can see it

- The data is stored with MongoDB Atlas, and the bot runs on Google Cloud.
- Backups are kept for 30 days.
- Only the bot's owner can access the database. Other players see only what the bot shows in Discord, such as your balance, level or profile card.

## How long it's kept

- Your profile and logs are kept while OctBot runs, so your progress isn't lost.
- Server settings stay if the bot is removed from a server, so they're still there if it's added back.
- You can ask for deletion at any time (below).

## Your choices

- **Delete your data:** email CONTACT_EMAIL with your Discord user ID. Your profile, logs and server levels will be deleted within 30 days. Warnings a server's moderators gave you belong to that server's moderation records: ask that server's staff.
- **Server data:** a server owner can email CONTACT_EMAIL to have their server's settings and records deleted.
- **Questions:** CONTACT_EMAIL.

OctBot isn't meant for anyone under the minimum age to use Discord in their country.

## Changes

If this policy changes, the date at the top changes too. Big changes are announced in the bot.
