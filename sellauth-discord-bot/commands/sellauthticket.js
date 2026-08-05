const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed } = require('../src/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthticket')
    .setDescription('Replies to a SellAuth support ticket from Discord.')
    .addStringOption((opt) => opt.setName('ticket_id').setDescription('The ticket ID').setRequired(true))
    .addStringOption((opt) => opt.setName('message').setDescription('Your reply').setRequired(true)),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const ticketId = interaction.options.getString('ticket_id');
    const message = interaction.options.getString('message');

    try {
      await sellauth.replyTicket(ticketId, message);
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('💬 Reply sent')
        .setDescription(`Sent to ticket \`${ticketId}\`:\n\n> ${message}`)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not send ticket reply', err)] });
    }
  },
};
