const { ActivityType } = require('discord.js');

module.exports = (client) => {
  console.log(`Hi, ${client.user.tag} is now online!`);
  client.user.setPresence({
    activities: [{
      name: `games on ${client.guilds.cache.size} servers`,
      type: ActivityType.Streaming,
      url: 'https://bit.ly/38OiD4C',
    }],
    status: 'online',
  });
};
