const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function formatDuration(ms) {
  if (!ms || ms === 0) return 'Live';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  name: 'queue',
  aliases: ['q'],
  description: 'Show the queue with interactive controls',
  async execute(message, args, cmd, client) {
    if (!message.member.voice.channel)
      return message.channel.send('You must be in a voice channel to use this command.');
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player?.queue?.current) return message.channel.send('No song is currently playing!');

    const allSongs = [player.queue.current, ...player.queue.tracks];
    const songsPerPage = 10;
    let currentPage = 0;
    const totalPages = Math.ceil(allSongs.length / songsPerPage);

    const buildEmbed = (page) => {
      const start = page * songsPerPage;
      const end = Math.min(start + songsPerPage, allSongs.length);
      const songs = allSongs.slice(start, end);
      const queueText = songs
        .map((track, i) => {
          const idx = start + i;
          return `${idx === 0 ? '▶️ NOW:' : `${idx}.`} [${track.info.title}](${track.info.uri}) - \`${formatDuration(track.info.duration)}\``;
        })
        .join('\n');
      return new EmbedBuilder()
        .setTitle(`**${message.guild.name}'s** Queue`)
        .setDescription(queueText || 'No songs in queue')
        .addFields({
          name: `Loop: \`${player.repeatMode === 'track' ? 'Song' : player.repeatMode === 'queue' ? 'All' : 'Off'}\` | Volume: \`${player.volume}%\` | Page \`${page + 1}/${totalPages}\``,
          value: '_ _',
        })
        .setColor('Blue')
        .setFooter({ text: 'Use buttons below to control playback and navigate' });
    };

    const buildButtons = (page, paused) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev_page').setLabel('◀️').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('next_page').setLabel('▶️').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1),
        new ButtonBuilder().setCustomId('pause_toggle').setLabel(paused ? '▶️' : '⏸️').setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skip_btn').setLabel('⏭️').setStyle(ButtonStyle.Secondary)
      );

    const buildControlButtons = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vol_down').setLabel('🔉 Vol-').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vol_up').setLabel('🔊 Vol+').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop_btn').setLabel('🛑 Stop').setStyle(ButtonStyle.Danger)
      );

    const msg = await message.channel.send({
      embeds: [buildEmbed(currentPage)],
      components: [buildButtons(currentPage, player.paused), buildControlButtons()],
    });

    const filter = (i) => i.user.id === message.author.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (interaction) => {
      try {
        await interaction.deferUpdate().catch(() => {});
        const p = client.lavalink.getPlayer(message.guild.id);
        if (!p?.queue?.current) return collector.stop();

        switch (interaction.customId) {
          case 'prev_page':
            currentPage = Math.max(0, currentPage - 1);
            break;
          case 'next_page':
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            break;
          case 'pause_toggle':
            if (p.paused) {
              await p.resume();
            } else {
              await p.pause();
            }
            break;
          case 'skip_btn':
            if (!p.queue.tracks.length) {
              await p.stopPlaying(true, false);
              p.destroy();
              return collector.stop();
            } else {
              await p.skip();
            }
            break;
          case 'vol_down': {
            const v = Math.max(0, p.volume - 10);
            await p.setVolume(v);
            break;
          }
          case 'vol_up': {
            const v = Math.min(500, p.volume + 10);
            await p.setVolume(v);
            break;
          }
          case 'stop_btn':
            p.queue.tracks.length = 0;
            await p.stopPlaying(true, false);
            p.destroy();
            return collector.stop();
        }

        const updatedP = client.lavalink.getPlayer(message.guild.id);
        if (updatedP?.queue?.current) {
          const updatedSongs = [updatedP.queue.current, ...updatedP.queue.tracks];
          const updatedPages = Math.ceil(updatedSongs.length / songsPerPage);
          currentPage = Math.min(currentPage, updatedPages - 1);
          await msg.edit({ embeds: [buildEmbed(currentPage)], components: [buildButtons(currentPage, updatedP.paused), buildControlButtons()] }).catch(() => {});
        }
      } catch (err) {
        console.error('[Queue] Button error:', err);
      }
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};