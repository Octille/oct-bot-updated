const { readdirSync } = require('fs');
const ascii = require('ascii-table');

let table = new ascii('Commands');
table.setHeading('Command', 'Load status');

module.exports = (client) => {
  readdirSync('./commands/').forEach(dir => {
    const commands = readdirSync(`./commands/${dir}/`).filter(file => file.endsWith('.js'));
    for (let file of commands) {
      // Skip placeholder/broken files
      if (file === 'a.js') continue;
      try {
        const pull = require(`../commands/${dir}/${file}`);
        if (pull.name) {
          client.commands.set(pull.name, pull);
          table.addRow(file, '✅');
        } else {
          table.addRow(file, '❌  -> missing name');
        }
      } catch (err) {
        table.addRow(file, `❌  -> ${err.message}`);
      }
    }
  });
  console.log(table.toString());
};
