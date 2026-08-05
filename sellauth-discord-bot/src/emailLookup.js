const { EmbedBuilder } = require('discord.js');
const sellauth = require('./sellauthApi');
const { money, formatDate, truncate } = require('./helpers');

async function buildEmailHistoryEmbed(email) {
  const res = await sellauth.listInvoices({
    email,
    perPage: 50,
    orderColumn: 'created_at',
    orderDirection: 'desc',
  });

  const invoices = res.data || res.invoices || res || [];

  if (!invoices.length) {
    return new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`📧 ${email}`)
      .setDescription('No purchases found for this email.');
  }

  const lines = invoices.map((inv, i) => {
    const item = (inv.items && inv.items[0]) || {};
    const product = item.product_name || item.product?.name || 'Unknown';
    return `**${i + 1}.** \`#${inv.id}\` — ${truncate(product, 30)} — ${money(
      inv.paid_usd ?? inv.price_usd
    )} — ${inv.status} — ${formatDate(inv.created_at)}`;
  });

  return new EmbedBuilder()
    .setColor(0x2b6cff)
    .setTitle(`📧 Last ${invoices.length} purchase(s) — ${email}`)
    .setDescription(lines.join('\n').slice(0, 4090))
    .setFooter({ text: 'SellAuth Email Lookup' })
    .setTimestamp();
}

module.exports = { buildEmailHistoryEmbed };
