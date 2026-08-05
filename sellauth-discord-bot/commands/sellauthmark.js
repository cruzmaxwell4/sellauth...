const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed } = require('../src/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthmark')
    .setDescription('Marks a manual order (e.g. PayPal F&F) as paid so the buyer gets their delivery.')
    .addStringOption((opt) =>
      opt.setName('invoice_id').setDescription('The invoice ID to mark as paid').setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const invoiceId = interaction.options.getString('invoice_id');

    try {
      await sellauth.processInvoice(invoiceId);
      const invoice = await sellauth.getInvoice(invoiceId).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Invoice marked as paid')
        .setDescription(
          `Invoice \`${invoiceId}\` has been processed. The customer should now receive their delivery` +
            (invoice?.email ? ` at **${invoice.email}**.` : '.')
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not mark invoice as paid', err)] });
    }
  },
};
