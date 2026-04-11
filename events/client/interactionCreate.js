module.exports = async (client, interaction) => {
  try {
    const chess = client.commands.get('chess');
    if (!chess?.handleInteraction) return;

    await chess.handleInteraction(interaction);
  } catch (err) {
    console.error('Chess interaction error:', err);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ Something went wrong.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Something went wrong.',
        ephemeral: true,
      });
    }
  }
};