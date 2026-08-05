const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { requireOwner } = require('../src/permissions');
const { tiersSummaryLine } = require('../src/claimRole');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthclaimpanel')
    .setDescription('Edit and send the "Claim Role" panel to this channel.'),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;

    const defaultDescription =
      "Bought form us before? put your invoice id here to claim your role!\n\n" +
      `Claim your invoice to get a role: ${tiersSummaryLine()}`;

    const modal = new ModalBuilder().setCustomId('claimpanel_edit').setTitle('Edit Claim Role Panel');

    const titleInput = new TextInputBuilder()
      .setCustomId('panel_title')
      .setLabel('Panel title')
      .setStyle(TextInputStyle.Short)
      .setValue('Claim Role 🛒')
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId('panel_description')
      .setLabel('Panel description')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(defaultDescription)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput)
    );

    await interaction.showModal(modal);
  },
};
