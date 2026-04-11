const fs = require('fs');
module.exports = {
  name: 'reload',
  description: 'Reloads a command',
  execute(message, args, cmd, client) {
    const commandName = args[0]?.toLowerCase();
    if (!commandName) return message.channel.send('Please provide a command name to reload.');
    const command = client.commands.get(commandName) || client.commands.find(c => c.aliases?.includes(commandName));
    if (!command) return message.channel.send(`No command found with name \`${commandName}\`.`);
    const commandFolders = fs.readdirSync('./commands');
    const folderName = commandFolders.find(folder => fs.readdirSync(`./commands/${folder}`).includes(`${command.name}.js`));
    if (!folderName) return message.channel.send(`Could not find file for \`${command.name}\`.`);
    delete require.cache[require.resolve(`../${folderName}/${command.name}.js`)];
    try {
      const newCommand = require(`../${folderName}/${command.name}.js`);
      client.commands.set(newCommand.name, newCommand);
      message.channel.send(`Command \`${command.name}\` was reloaded!`);
    } catch (error) {
      console.error(error);
      message.channel.send(`Error reloading \`${command.name}\`: ${error.message}`);
    }
  }
};
