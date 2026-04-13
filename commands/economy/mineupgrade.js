const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { TOOLS } = require('../../functions/economy');

module.exports = {
  name: 'mineupgrade',
  aliases: ['mu', 'pickaxe'],
  description: 'Upgrade your mining tool. `!mineupgrade` to view, `!mineupgrade buy` to purchase.',

  async execute(message, args, cmd, client, profileData) {
    const toolTier = profileData.Mine?.toolTier ?? -1;
    const level    = profileData.level || 1;
    const coins    = profileData.coins;

    // ── Buy next tier ────────────────────────────────────────────────────────
    if (args[0] === 'buy') {
      const nextTier = toolTier + 1;
      if (nextTier >= TOOLS.length)
        return message.channel.send('You already own the **Excavator** — the most powerful tool in the game!');

      const next = TOOLS[nextTier];

      if (level < next.level)
        return message.channel.send(`🔒 The **${next.name}** requires **Level ${next.level}**. You're Level ${level}. Keep grinding!`);

      if (coins < next.cost) {
        const diff = (next.cost - coins).toLocaleString();
        return message.channel.send(`You need **₪ ${next.cost.toLocaleString()}** for the ${next.emoji} **${next.name}**. You're ₪ ${diff} short.`);
      }

      await profileModel.findOneAndUpdate(
        { userID: message.author.id },
        { $inc: { coins: -next.cost }, $set: { 'Mine.toolTier': nextTier } }
      );

      const prev     = toolTier >= 0 ? TOOLS[toolTier] : null;
      const prevMult = prev ? prev.mult : 1;

      return message.channel.send(
        `${next.emoji} **${next.name}** purchased for **₪ ${next.cost.toLocaleString()}**!\n` +
        `Mining power: **${prevMult}× → ${next.mult}×** — your hauls just got way bigger.`
      );
    }

    // ── View shop ────────────────────────────────────────────────────────────
    const currentTool = toolTier >= 0 ? TOOLS[toolTier] : null;

    const embed = new EmbedBuilder()
      .setColor('#6b32a8')
      .setTitle('⛏️ Mine Upgrade Shop')
      .setDescription(
        `**Your tool:** ${currentTool ? `${currentTool.emoji} ${currentTool.name} (${currentTool.mult}× output)` : 'Bare Hands (1× output)'}\n` +
        `**Level:** ${level} | **Wallet:** ₪ ${coins.toLocaleString()}\n\n` +
        `Buy upgrades in order — you must own the previous tier.\n` +
        `Type \`!mineupgrade buy\` to purchase the next one.`
      );

    for (const tool of TOOLS) {
      const owned    = tool.tier <= toolTier;
      const isNext   = tool.tier === toolTier + 1;
      const levelOk  = level >= tool.level;
      const canAfford = coins >= tool.cost;

      let status;
      if (owned)               status = '✅ Owned';
      else if (tool.tier > toolTier + 1) status = '🔒 Buy previous tier first';
      else if (!levelOk)       status = `🔒 Requires Level ${tool.level}`;
      else if (!canAfford)     status = `Need ₪ ${(tool.cost - coins).toLocaleString()} more`;
      else                     status = '✅ You can afford this!';

      embed.addFields({
        name:  `${isNext ? '▶ ' : ''}${tool.emoji} ${tool.name} — ${owned ? '~~' : ''}₪ ${tool.cost.toLocaleString()}${owned ? '~~' : ''}`,
        value: `${tool.mult}× output | Req. Level ${tool.level} | ${status}`,
      });
    }

    embed.setFooter({ text: '!mine every 30 min | !mineupgrade buy to upgrade' });
    message.channel.send({ embeds: [embed] });
  },
};