const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { WORKER_HOURLY, MANAGER_COST, MAX_WORKERS, workerCost, calcPendingWages, applyPrestige } = require('../../functions/economy');

module.exports = {
  name: 'company',
  aliases: ['comp', 'c'],
  description: 'Hire workers for passive income. Use `!collect` to claim wages.',

  async execute(message, args, cmd, client, profileData) {
    const user = message.mentions.users.first() || message.author;

    let targetData;
    try { targetData = await profileModel.findOne({ userID: user.id }); }
    catch { targetData = profileData; }
    if (!targetData) return message.channel.send('That user has no account.');

    const myWorkers   = profileData.Company?.workers    || 0;
    const hasManager  = profileData.Company?.hasManager || false;
    const prestige    = profileData.prestige || 0;
    const cost        = workerCost(myWorkers);
    const hourly      = applyPrestige(myWorkers * WORKER_HOURLY, prestige);
    const pending     = calcPendingWages(profileData.Company, prestige);

    // ── !company shop ─────────────────────────────────────────────────────────
    if (args[0] === 'shop') {
      const embed = new EmbedBuilder()
        .setColor('#6b32a8')
        .setTitle('🏢 Company Shop')
        .setDescription(
          `Workers generate **₪ ${WORKER_HOURLY.toLocaleString()}/hr** each (+ prestige bonus).\n` +
          `Use \`!collect\` to claim wages, or buy a **Manager** to auto-collect.`
        )
        .addFields(
          {
            name:  `👷 Worker — ₪ ${cost.toLocaleString()}`,
            value: `You own: **${myWorkers}/${MAX_WORKERS}** | +₪ ${WORKER_HOURLY.toLocaleString()}/hr each\nPrice increases as you hire more.`,
          },
          {
            name:  `🧑‍💼 Manager — ₪ ${MANAGER_COST.toLocaleString()} ${hasManager ? '(owned)' : ''}`,
            value: hasManager
              ? '✅ Auto-collecting wages every hour.'
              : 'Auto-collects your workers\' wages passively. One-time purchase.',
          }
        )
        .setFooter({ text: '!company buy worker [amount] | !company buy manager' });
      return message.channel.send({ embeds: [embed] });
    }

    // ── !company buy ──────────────────────────────────────────────────────────
    if (args[0] === 'buy') {
      // Buy Manager
      if (args[1] === 'manager') {
        if (hasManager) return message.channel.send('You already have a Manager!');
        if (profileData.coins < MANAGER_COST)
          return message.channel.send(`You need **₪ ${MANAGER_COST.toLocaleString()}** for a Manager. You have ₪ ${profileData.coins.toLocaleString()}.`);

        await profileModel.findOneAndUpdate(
          { userID: message.author.id },
          { $inc: { coins: -MANAGER_COST }, $set: { 'Company.hasManager': true } }
        );
        return message.channel.send(
          `🧑‍💼 **Manager hired** for **₪ ${MANAGER_COST.toLocaleString()}**!\n` +
          `Your workers' wages are now collected automatically. No more \`!collect\` needed.`
        );
      }

      // Buy Workers
      if (args[1] === 'worker') {
        const amount = Math.max(1, parseInt(args[2]) || 1);
        if (myWorkers + amount > MAX_WORKERS)
          return message.channel.send(`You can only have **${MAX_WORKERS} workers** max. You have ${myWorkers}.`);

        const total = cost * amount;
        if (total > profileData.coins)
          return message.channel.send(`You need **₪ ${total.toLocaleString()}** to hire ${amount} worker(s). You have ₪ ${profileData.coins.toLocaleString()}.`);

        // Snapshot current pending wages before changing worker count
        if (pending > 0 && !hasManager) {
          await profileModel.findOneAndUpdate(
            { userID: message.author.id },
            { $inc: { 'Company.pendingWages': pending }, $set: { 'Company.lastCollected': new Date() } }
          );
        }

        await profileModel.findOneAndUpdate(
          { userID: message.author.id },
          {
            $inc: { coins: -total, 'Company.workers': amount },
            $set: { 'Company.lastCollected': new Date() },
          }
        );
        return message.channel.send(
          `👷 Hired **${amount}** worker(s) for **₪ ${total.toLocaleString()}**!\n` +
          `Total workers: **${myWorkers + amount}** | Hourly income: **₪ ${applyPrestige((myWorkers + amount) * WORKER_HOURLY, prestige).toLocaleString()}**\n` +
          (hasManager ? '' : `Use \`!collect\` to claim wages.`)
        );
      }

      return message.channel.send('Usage: `!company buy worker [amount]` or `!company buy manager`');
    }

    // ── !company (view) ───────────────────────────────────────────────────────
    const viewWorkers = targetData.Company?.workers    || 0;
    const viewManager = targetData.Company?.hasManager || false;
    const viewHourly  = applyPrestige(viewWorkers * WORKER_HOURLY, targetData.prestige || 0);
    const viewPending = calcPendingWages(targetData.Company, targetData.prestige || 0);

    const embed = new EmbedBuilder()
      .setColor('#6b32a8')
      .setAuthor({ name: `${user.username}'s Company`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .addFields(
        { name: '👷 Workers',        value: `${viewWorkers}/${MAX_WORKERS}`,             inline: true },
        { name: '💵 Hourly income',  value: `₪ ${viewHourly.toLocaleString()}`,           inline: true },
        { name: '📅 Daily income',   value: `₪ ${(viewHourly * 24).toLocaleString()}`,   inline: true },
        { name: '🧑‍💼 Manager',      value: viewManager ? '✅ Auto-collecting' : '❌ Not hired', inline: true },
        { name: '💼 Uncollected',    value: `₪ ${viewPending.toLocaleString()}`,          inline: true },
      )
      .setFooter({ text: viewManager ? 'Wages collected automatically.' : '!collect to claim wages | !company shop to hire' });

    message.channel.send({ embeds: [embed] });
  },
};