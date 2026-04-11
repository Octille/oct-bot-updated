const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'queue',
  aliases: ['q'],
  description: 'Show the queue with interactive controls',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel) return message.channel.send('You must be in a voice channel to use this command.');
    const queue = client.distube.getQueue(message);
    if (!queue || !queue.songs.length) return message.channel.send('No song is currently playing!');

    const songsPerPage = 10;
    let currentPage = 0;
    const totalPages = Math.ceil(queue.songs.length / songsPerPage);

    const buildEmbed = (page) => {
      const start = page * songsPerPage;
      const end = Math.min(start + songsPerPage, queue.songs.length);
      const songs = queue.songs.slice(start, end);

      const queueText = songs
        .map((song, i) => {
          const idx = start + i;
          return `${idx === 0 ? '▶️ NOW:' : `${idx}.`} [${song.name}](${song.url}) - \`${song.formattedDuration}\``;
        })
        .join('\n');

      return new EmbedBuilder()
        .setTitle(`**${message.guild.name}'s** Queue`)
        .setDescription(queueText || 'No songs in queue')
        .addFields({
          name: `Loop: \`${queue.repeatMode ? (queue.repeatMode === 2 ? 'All' : 'Song') : 'Off'}\` | Volume: \`${queue.volume}%\` | Page \`${page + 1}/${totalPages}\``,
          value: '_ _'
        })
        .setColor('Blue')
        .setFooter({ text: 'Use buttons below to control playback and navigate' });
    };

    const buildButtons = (page) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev_page').setLabel('◀️').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('next_page').setLabel('▶️').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1),
        new ButtonBuilder().setCustomId('pause_btn').setLabel('⏸️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('resume_btn').setLabel('▶️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skip_btn').setLabel('⏭️').setStyle(ButtonStyle.Secondary)
      );
    };

    const buildControlButtons = () => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vol_down').setLabel('🔉 Vol-').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vol_up').setLabel('🔊 Vol+').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop_btn').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
      );
    };

    const msg = await message.channel.send({
      embeds: [buildEmbed(currentPage)],
      components: [buildButtons(currentPage), buildControlButtons()]
    });

    const filter = (interaction) => interaction.user.id === message.author.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (interaction) => {
      try {
        await interaction.deferUpdate().catch(() => {});

        const q = client.distube.getQueue(message);
        if (!q || !q.songs.length) {
          return collector.stop();
        }

        switch (interaction.customId) {
          case 'prev_page':
            currentPage = Math.max(0, currentPage - 1);
            break;

          case 'next_page':
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            break;

          case 'pause_btn':
            if (!q.paused) {
              q.pause();
              await message.channel.send('⏸️ Queue paused.').then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            }
            break;

          case 'resume_btn':
            if (q.paused) {
              q.resume();
              await message.channel.send('▶️ Queue resumed.').then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            }
            break;

          case 'skip_btn':
            if (q.songs.length <= 1) {
              await message.channel.send('No song to skip to.').then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            } else {
              await q.skip();
              await message.channel.send('⏭️ Skipped!').then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            }
            break;

          case 'vol_down':
            const newVolDown = Math.max(0, q.volume - 10);
            q.setVolume(newVolDown);
            await message.channel.send(`🔉 Volume: \`${newVolDown}%\``).then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            break;

          case 'vol_up':
            const newVolUp = Math.min(500, q.volume + 10);
            q.setVolume(newVolUp);
            await message.channel.send(`🔊 Volume: \`${newVolUp}%\``).then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            break;

          case 'stop_btn':
            q.stop();
            await message.channel.send('🛑 Queue stopped.').then(m => setTimeout(() => m.delete().catch(() => {}), 2000));
            return collector.stop();
        }

        // Update message
        const updatedQ = client.distube.getQueue(message);
        if (updatedQ && updatedQ.songs.length > 0) {
          await msg.edit({
            embeds: [buildEmbed(currentPage)],
            components: [buildButtons(currentPage), buildControlButtons()]
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[Queue] Button error:', err);
      }
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  }
};

