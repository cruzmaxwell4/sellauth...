const { SlashCommandBuilder } = require('discord.js');
const { requireOwner } = require('../src/permissions');
const { errorEmbed } = require('../src/helpers');
const { buildEmailHistoryEmbed } = require('../src/emailLookup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthemail')
    .setDescription("Shows a customer's last 50 purchases by email.")
    .addStringOption((opt) =>
      opt.setName('email').setDescription('Customer email').setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const email = interaction.options.getString('email');
    try {
      const embed = await buildEmailHistoryEmbed(email);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not fetch purchase history', err)] });
    }
  },
};
