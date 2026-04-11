const { getVoiceConnection } = require('@discordjs/voice');
const ytSearch = require('yt-search');

module.exports = {
  name: 'play',
  aliases: ['p'],
  description: 'Play a song',
  async execute(message, args, cmd, client) {
    const voiceChannel = message.member.voice.channel;
    
    if (!voiceChannel) {
      return message.channel.send('You must be in a voice channel to use this command.');
    }

    const permissions = voiceChannel.permissionsFor(message.guild.members.me);
    if (!permissions?.has('Connect')) {
      return message.channel.send('I do not have permission to join your voice channel.');
    }
    if (!permissions.has('Speak')) {
      return message.channel.send('I do not have permission to speak in your voice channel.');
    }
    if (!voiceChannel.joinable) {
      return message.channel.send('I cannot join your voice channel. Please check my permissions.');
    }

    if (!args.length) {
      return message.channel.send('Please provide a song name or URL.');
    }

    const query = args.join(' ');

    message.channel.send(`🔍 Searching for \`${query}\`...`);

    let queryToPlay = query;
    let searchResult;

    if (!query.startsWith('http')) {
      searchResult = await ytSearch(query);
      const video = searchResult?.videos?.[0];
      if (!video) {
        return message.channel.send('**No search results:** I could not find a song for that query. Try a better search term or use a direct URL.');
      }
      queryToPlay = video.url;
    }

    // 1. Handle existing connections
    const connection = getVoiceConnection(message.guild.id);
    
    // If the bot is in a VC but DisTube doesn't have a queue, 
    // it's likely a "ghost" connection. We destroy it so DisTube can start fresh.
    if (connection && !client.distube.getQueue(message)) {
        connection.destroy();
    }

    try {
      await client.distube.play(voiceChannel, queryToPlay, {
        member: message.member,
        textChannel: message.channel,
        message,
      });
      
      // Verify queue was created
      const queue = client.distube.getQueue(message);
      if (!queue) {
        console.warn('[Play] Warning: Queue not found after play()');
      } else if (!queue.songs.length) {
        console.warn('[Play] Warning: Queue has no songs');
      }
    } catch (err) {
      console.error('[Play] Error:', err);
      const errConnection = getVoiceConnection(message.guild.id);
      if (errConnection) errConnection.destroy();

      if (err.errorCode === 'VOICE_CONNECT_FAILED') {
        return message.channel.send('❌ **Connection Timeout:** The bot joined but the audio handshake failed. Ensure your Mac firewall allows UDP traffic.');
      }
      if (err.errorCode === 'NO_RESULT') {
        return message.channel.send('❌ **No search results:** I could not find a song for that query. Try a longer search term or use a direct URL.');
      }
      
      message.channel.send(`❌ An error occurred: \`${err.message}\``);
    }
  }
};