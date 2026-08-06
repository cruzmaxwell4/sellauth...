const { EmbedBuilder } = require('discord.js');
const { truncate } = require('./helpers');

// SellAuth stores the delivered account/serial/code under a handful of
// possible fields depending on the delivery type (stock serials, dynamic
// custom text, etc). This checks the common shapes in order and falls back
// gracefully if nothing is found.
function extractDeliveredContent(invoice) {
  const items = invoice.items || [];
  const parts = [];

  items.forEach((item, idx) => {
    const product = item.product_name || item.product?.name || `Item ${idx + 1}`;
    const variant = item.variant_name || item.variant?.name;

    let content =
      item.delivered_content ||
      item.content ||
      item.delivered ||
      item.serial ||
      item.custom_field_value ||
      null;

    // Some responses return delivered items as an array of objects.
    if (!content && Array.isArray(item.delivered_items) && item.delivered_items.length) {
      content = item.delivered_items
        .map((d) => (typeof d === 'string' ? d : d.content || d.value || d.serial || JSON.stringify(d)))
        .join('\n');
    }

    if (!content && Array.isArray(item.serials) && item.serials.length) {
      content = item.serials
        .map((s) => (typeof s === 'string' ? s : s.content || s.value || JSON.stringify(s)))
        .join('\n');
    }

    if (content) {
      const label = variant ? `${product} — ${variant}` : product;
      parts.push({ label, content: String(content) });
    }
  });

  return parts;
}

function buildDeliveredEmbed(invoice) {
  const parts = extractDeliveredContent(invoice);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`📦 Delivered — Invoice #${invoice.id ?? invoice.unique_id}`)
    .setFooter({ text: 'SellAuth Delivered Content' })
    .setTimestamp();

  if (!parts.length) {
    embed.setDescription('No delivered content was found on file for this invoice.');
    return embed;
  }

  embed.setDescription('**Here is exactly what the customer received:**');

  parts.forEach((part) => {
    embed.addFields({
      name: truncate(part.label, 256),
      value: '```\n' + truncate(part.content, 1000) + '\n```',
    });
  });

  return embed;
}

module.exports = { buildDeliveredEmbed, extractDeliveredContent };
