const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { calcMineOutput, TOOLS, awardXP, isJailed } = require('../../functions/economy');

const ORE_FLAVOUR = {
  Coal:     ['You chip away at the rockface and haul out some coal.', 'A dusty run — mostly coal, but coins are coins.', 'The tunnel echoes as chunks of coal tumble into your cart.'],
  Iron:     ['Your pickaxe rings off a thick seam of iron ore.', 'Solid iron. Not glamorous, but the market pays well.', 'You strike a reliable vein of iron — a good haul.'],
  Gold:     ['Gold catches the torchlight — you grin.', '🟡 A rich vein of gold glints in your lantern light.', 'You whistle as gold nuggets tumble into your cart.'],
  Diamond:  ['Your tool hits something impossibly hard. DIAMONDS.', '💎 Diamonds! You let out an actual gasp.', 'A flawless diamond seam. You stand there for a second just looking at it.'],
  Amethyst: ['A deep purple glow floods the tunnel — Amethyst!', '🔮 Enormous amethyst crystals, pristine and glowing.', 'You\'ve never seen anything like it. The whole tunnel sparkles.'],
};

module.exports = {
  name: 'mine',
  aliases: ['m'],
  cooldown: 30 * 60,
  description: 'Mine for coins. Upgrade tools with `!mineupgrade`.',

  async execute(message, args, cmd, client, profileData) {
    if (isJailed(profileData)) {
      const secs = Math.ceil((new Date(profileData.jailUntil) - Date.now()) / 1000);
      return message.channel.send(`🚔 You can't mine from jail. **${secs}s** left on your sentence.`);
    }

    const toolTier = profileData.Mine?.toolTier ?? -1;
    const prestige = profileData.prestige || 0;
    const { ore, total } = calcMineOutput(toolTier, prestige);
    const tool = toolTier >= 0 ? TOOLS[toolTier] : null;

    await profileModel.findOneAndUpdate(
      { userID: message.author.id },
      { $inc: { coins: total, 'Mine.totalMined': total } }
    );

    const flavours = ORE_FLAVOUR[ore.name] || ORE_FLAVOUR.Coal;
    const flavour  = flavours[Math.floor(Math.random() * flavours.length)];
    const oreColors = { Coal: '#5c5c5c', Iron: '#b5b5b5', Gold: '#ffd700', Diamond: '#00cfff', Amethyst: '#9b59b6' };

    const embed = new EmbedBuilder()
      .setColor(oreColors[ore.name] || '#888')
      .setAuthor({ name: `${message.author.username} went mining`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setDescription(flavour)
      .addFields(
        { name: '⛏️ Tool',    value: tool ? `${tool.emoji} ${tool.name}` : 'Bare Hands', inline: true },
        { name: `${ore.emoji} Ore`, value: `${ore.name} (${ore.mult}× haul)`,            inline: true },
        { name: '💰 Earned',  value: `**₪ ${total.toLocaleString()}**`,                  inline: true },
      );

    // Tease next upgrade
    if (toolTier < TOOLS.length - 1) {
      const next     = TOOLS[toolTier + 1];
      const balance  = profileData.coins + total;
      const canAfford = balance >= next.cost;
      embed.setFooter({
        text: canAfford
          ? `💡 You can afford the ${next.name}! Type !mineupgrade buy`
          : `Next: ${next.emoji} ${next.name} — ₪ ${next.cost.toLocaleString()} | !mineupgrade`,
      });
    } else {
      embed.setFooter({ text: 'You have the best tool in the game. Absolute endgame.' });
    }

    await message.channel.send({ embeds: [embed] });
    await awardXP(message, profileModel, 'mine');
  },
};