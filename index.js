const { Collection, Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');

// Verify FFmpeg is available
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  console.log('[FFmpeg] Using ffmpeg-static path:', ffmpegPath);
} catch (err) {
  console.warn('[FFmpeg] ffmpeg-static not available, will use system PATH');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
client.events = new Collection();

// Load handlers
['command_handler', 'event_handler'].forEach(handler => {
  require(`./handlers/${handler}`)(client);
});

// Setup DisTube plugins
const distubePlugins = [];
let distubePluginName = 'Unknown';
try {
  const { YtDlpPlugin } = require('@distube/yt-dlp');
  distubePlugins.push(new YtDlpPlugin());
  distubePluginName = 'YtDlpPlugin';
  console.log('[DisTube] Using @distube/yt-dlp plugin for playback');
} catch (err) {
  console.warn('[DisTube] @distube/yt-dlp not available; falling back to YouTubePlugin');
  distubePlugins.push(new YouTubePlugin());
  distubePluginName = 'YouTubePlugin';
}

const disTubeOptions = {
  plugins: distubePlugins,
  emitNewSongOnly: true,
};

if (ffmpegPath) {
  disTubeOptions.ffmpeg = {
    path: ffmpegPath,
  };
}

client.distube = new DisTube(client, disTubeOptions);

console.log(`[DisTube] Initialized with ${distubePluginName}`);
console.log('[DisTube] FFmpeg Location:', ffmpegPath || 'system PATH');

// Monitor for unhandled rejections from FFmpeg
process.on('unhandledRejection', (reason, promise) => {
  if (reason?.message?.includes('ffmpeg') || reason?.toString?.().includes('ffmpeg')) {
    console.error('[FFmpeg Error] Unhandled rejection:', reason);
  }
});

process.on('uncaughtException', (err) => {
  if (err?.message?.includes('ffmpeg') || err?.stack?.includes('ffmpeg')) {
    console.error('[FFmpeg Error] Uncaught exception:', err.message);
  }
});

// DisTube events
client.distube
  .on('playSong', (queue, song) => {
    console.log(`▶️ Playing: ${song.name} (${song.formattedDuration})`);
    
    // Listen to voice connection errors
    if (queue.voice?.connection && !queue.voice._streamErrorListenerAttached) {
      queue.voice.connection.on('error', err => {
        console.error('[VoiceConnection Error]', err.message);
      });
      queue.voice.connection.on('stateChange', (oldState, newState) => {
        console.log(`[VoiceConnection State] ${oldState.status} -> ${newState.status}`);
      });
      queue.voice._streamErrorListenerAttached = true;
    }
    
    // Listen to audio player errors
    if (queue.voice?.audioPlayer && !queue.voice._playerErrorListenerAttached) {
      queue.voice.audioPlayer.on('error', err => {
        console.error('[AudioPlayer Error]', err.message, err.resource?.metadata?.title);
      });
      queue.voice.audioPlayer.on('stateChange', (oldState, newState) => {
        console.log(`[AudioPlayer State] ${oldState.status} -> ${newState.status}`);
      });
      queue.voice._playerErrorListenerAttached = true;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🎶 Now Playing')
      .setDescription(`[${song.name}](${song.url})\n\nDuration: \`${song.formattedDuration}\` | Volume: \`${queue.volume}%\` | Loop: \`${queue.repeatMode ? (queue.repeatMode === 2 ? 'All Queue' : 'This Song') : 'Off'}\``)
      .setThumbnail(song.thumbnail)
      .setColor('Blue');
    queue.textChannel?.send({ embeds: [embed] });
  })
  .on('addSong', (queue, song) => {
    const embed = new EmbedBuilder()
      .setTitle('New song added to queue 👍')
      .setDescription(`[${song.name}](${song.url})\n\nDuration: \`${song.formattedDuration}\``)
      .setThumbnail(song.thumbnail)
      .setColor('Blue');
    queue.textChannel?.send({ embeds: [embed] });
  })
  .on('addList', (queue, playlist) => {
    queue.textChannel?.send(`Added \`${playlist.name}\` playlist (${playlist.songs.length} songs) to queue`);
  })
  .on('disconnect', queue => {
    console.log('⏹️ Bot disconnected from voice channel');
  })
  .on('empty', queue => {
    console.log('⚠️ Voice channel is empty, but bot is still connected');
  })
  .on('error', (error, queue, song) => {
    const textChannel = queue?.textChannel ?? error?.channel;
    console.error('[DisTube Error]', error?.name, error?.message);

    const errorMsg = error?.message || 'Unknown playback error';
    if (textChannel?.send) {
      textChannel.send(`❌ Playback error: \`${errorMsg}\``).catch(() => {});
    }
  })
  .on('finish', queue => {
    queue.textChannel?.send('Queue finished! No more songs to play.');
  });

// MongoDB
mongoose.connect(process.env.MONGODB_SRV, {})
  .then(() => console.log('Connected to MongoDB!'))
  .catch(err => console.error('MongoDB error:', err));

client.login(process.env.token);
