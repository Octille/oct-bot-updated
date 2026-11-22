const { readdirSync, statSync } = require('fs');
const path = require('path');
const ascii = require('ascii-table');

let table = new ascii('Commands');
table.setHeading('Command', 'Load status');

module.exports = (client) => {
  const commandFolders = readdirSync('./commands/').filter((dir) =>
    statSync(path.join('./commands', dir)).isDirectory()
  );

  // Tracks every name/alias so two commands can't silently overwrite each other
  const taken = new Map();

  commandFolders.forEach((dir) => {
    const commands = readdirSync(`./commands/${dir}/`).filter((file) =>
      file.endsWith('.js')
    );

    for (let file of commands) {
      if (file === 'a.js') continue;

      try {
        const pull = require(`../commands/${dir}/${file}`);

        if (!pull.name) {
          table.addRow(file, '❌ -> missing name');
          continue;
        }

        const keys = [pull.name, ...(pull.aliases || [])].map((k) => k.toLowerCase());
        const clash = keys.find((k) => taken.has(k));
        if (clash) {
          table.addRow(file, `❌ -> "${clash}" already used by ${taken.get(clash)}`);
          continue;
        }

        keys.forEach((k) => taken.set(k, file));
        pull.category = dir;
        client.commands.set(pull.name, pull);
        table.addRow(file, '✅');
      } catch (err) {
        table.addRow(file, `❌ -> ${err.message}`);
      }
    }
  });

  console.log(table.toString());
};
