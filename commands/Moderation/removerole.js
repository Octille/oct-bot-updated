const { changeRole } = require('./giverole');
module.exports = {
  name: 'removerole',
  aliases: ['takerole'],
  description: 'Remove a role from a member',
  async execute(message, args, cmd, client, profileData, settings) {
    return changeRole(message, args, settings, 'remove');
  },
};
