const { ActivityType } = require('discord.js');

module.exports = async (client) => {
  console.log(`✅ ${client.user.tag} is now online!`);

  client.user.setPresence({
    activities: [{
      name: `games on ${client.guilds.cache.size} servers`,
      type: ActivityType.Streaming,
      url: 'https://bit.ly/38OiD4C',
    }],
    status: 'online',
  });

  
  try {
    await client.lavalink.init({ id: client.user.id, username: client.user.username });
    console.log(`[Lavalink] Manager initialised as ${client.user.tag}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const nodeCount = client.lavalink.nodeManager.nodes.size;
    if (nodeCount === 0) {
      console.error('⚠️ No Lavalink nodes connected!');
    } else {
      console.log(`[Lavalink] ${nodeCount} node(s) connected!`);
    }
  } catch (err) {
    console.error('[Lavalink] Initialization error:', err.message);
  }
};