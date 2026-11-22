// Helpers for the Minecraft commands.
// Hypixel's official API needs a key (developer.hypixel.net) set as HYPIXEL_API_KEY.

class HypixelError extends Error {}

async function getUUID(name) {
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (res.status === 404 || res.status === 204) throw new HypixelError('That Minecraft player does not exist.');
  if (!res.ok) throw new HypixelError('Could not reach the Mojang API. Try again later.');
  return res.json(); // { id, name }
}

async function hypixel(path, params = {}, needsKey = true) {
  if (needsKey && !process.env.HYPIXEL_API_KEY)
    throw new HypixelError('Hypixel stats are not configured on this bot (missing `HYPIXEL_API_KEY`).');
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.hypixel.net/v2/${path}${query ? `?${query}` : ''}`, {
    headers: needsKey ? { 'API-Key': process.env.HYPIXEL_API_KEY } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) throw new HypixelError('The Hypixel API key is invalid or expired.');
  if (res.status === 429) throw new HypixelError('Hypixel is rate limiting me, try again in a minute.');
  if (!data.success) throw new HypixelError(data.cause || 'Hypixel API error.');
  return data;
}

// Looks up a player and returns { name, uuid, player } where player is Hypixel's raw player object
async function getPlayer(name) {
  const { id, name: realName } = await getUUID(name);
  const { player } = await hypixel('player', { uuid: id });
  if (!player) throw new HypixelError(`**${realName}** has never joined Hypixel.`);
  return { name: realName, uuid: id, player };
}

const num = (n) => (n || 0).toLocaleString();
const ratio = (a, b) => (b ? (a || 0) / b : a || 0).toFixed(2);
const networkLevel = (exp = 0) => Math.floor(Math.sqrt(2 * exp + 30625) / 50 - 2.5);

// Runs a command body and turns HypixelErrors into friendly replies
async function run(message, fn) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HypixelError) return message.channel.send(`❌ ${err.message}`);
    console.error('[Minecraft] Error:', err);
    message.channel.send('❌ Something went wrong fetching that data.');
  }
}

module.exports = { HypixelError, getUUID, hypixel, getPlayer, num, ratio, networkLevel, run };
