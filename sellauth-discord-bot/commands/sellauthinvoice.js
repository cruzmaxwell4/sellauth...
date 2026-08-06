const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { money, formatDate, errorEmbed, encodeEmail } = require('../src/helpers');

function buildInvoiceEmbed(invoice) {
  const item = (invoice.items && invoice.items[0]) || {};
  const product = item.product_name || item.product?.name || 'Unknown product';
  const variant = item.variant_name || item.variant?.name || 'N/A';
  const delivered = item.delivered_at || invoice.delivered_at;

  return new EmbedBuilder()
    .setColor(0x2b6cff)
    .setTitle(`🧾 Invoice #${invoice.id ?? invoice.unique_id}`)
    .setDescription('**Here is everything on file for this invoice:**')
    .addFields(
      { name: '✅ Valid', value: '**Yes**', inline: true },
      { name: '💳 Payment Method', value: `**${invoice.gateway || 'Unknown'}**`, inline: true },
      { name: '💰 Paid', value: `**${money(invoice.paid_usd ?? invoice.price_usd)}**`, inline: true },
      { name: '🕒 Time Bought', value: `**${formatDate(invoice.created_at)}**`, inline: false },
      { name: '📧 Email', value: `**${invoice.email || 'Unknown'}**`, inline: true },
      { name: '📦 Product', value: `**${product}**`, inline: true },
      { name: '🎨 Variant', value: `**${variant}**`, inline: true },
      {
        name: '🚚 Delivery Status',
        value: `**${invoice.status === 'completed' ? (delivered ? 'Delivered' : 'Completed (no delivery data)') : invoice.status || 'Unknown'}**`,
        inline: false,
      }
    )
    .setFooter({ text: 'SellAuth Invoice Lookup' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthinvoice')
    .setDescription('Look up a SellAuth invoice by ID.')
    .addStringOption((opt) =>
      opt.setName('invoice_id').setDescription('The invoice ID').setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const invoiceId = interaction.options.getString('invoice_id');

    try {
      const invoice = await sellauth.getInvoice(invoiceId);
      const embed = buildInvoiceEmbed(invoice);

      const buttons = [];

      if (invoice.email) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`checkemail:${encodeEmail(invoice.email || '')}`)
            .setLabel('Check email')
            .setEmoji('📧')
            .setStyle(ButtonStyle.Primary)
        );
      }

      buttons.push(
        new ButtonBuilder()
          .setCustomId(`show_delivered:${interaction.user.id}:${invoiceId}`)
          .setLabel('Delivered')
          .setEmoji('📦')
          .setStyle(ButtonStyle.Secondary)
      );

      const row = new ActionRowBuilder().addComponents(buttons);

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not fetch invoice', err)] });
    }
  },
};
