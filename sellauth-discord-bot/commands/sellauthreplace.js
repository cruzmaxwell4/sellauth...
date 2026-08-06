const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed, truncate } = require('../src/helpers');
const config = require('../config.json');

// Pulls whatever "content to deliver" field SellAuth put on a variant. The
// exact shape isn't fully documented, so we check the common possibilities
// in order of likelihood before giving up.
//
// Helper: given a single deliverable entry (string or object), pull out its
// textual content.
function extractDeliverableText(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') {
    return (
      entry.content ||
      entry.delivery ||
      entry.deliverable ||
      entry.value ||
      entry.text ||
      entry.data ||
      null
    );
  }
  return null;
}

// Given the response from sellauth.getVariantStock(), pull out a single
// deliverable/stock item's textual content. The exact response shape isn't
// fully documented, so we walk through the common wrapper shapes
// (array response, { data: [...] }, { stock: [...] }, single object, etc.)
// before giving up.
function extractStockItemContent(stockResponse) {
  if (!stockResponse) return null;

  // Response is directly an array of stock items.
  if (Array.isArray(stockResponse) && stockResponse.length) {
    const text = extractDeliverableText(stockResponse[0]);
    if (text) return text;
  }

  if (typeof stockResponse === 'object') {
    // Response wraps the items in a common "list" key.
    const list =
      stockResponse.data ||
      stockResponse.stock ||
      stockResponse.items ||
      stockResponse.stocks ||
      stockResponse.stock_items;
    if (Array.isArray(list) && list.length) {
      const text = extractDeliverableText(list[0]);
      if (text) return text;
    }

    // Response is a single stock item object itself.
    const text = extractDeliverableText(stockResponse);
    if (text) return text;
  }

  if (typeof stockResponse === 'string' && stockResponse) return stockResponse;

  return null;
}

function variantLabel(variant) {
  const name = variant.name || variant.variant || `Variant #${variant.id}`;
  const stockCount = variant.stock_count ?? variant.stock?.length ?? variant.quantity;
  return stockCount != null ? `${name} (stock: ${stockCount})` : name;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthreplace')
    .setDescription('Replaces the delivered account/item on an invoice with a fresh one from stock.')
    .addStringOption((opt) =>
      opt.setName('invoice_id').setDescription('The invoice ID to replace').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('product_id')
        .setDescription('Start typing a product name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('variant')
        .setDescription('The variant to pull fresh stock from')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addRoleOption((opt) =>
      opt.setName('notify_role').setDescription('Role to notify with the replacement result').setRequired(true)
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    try {
      if (focusedOption.name === 'product_id') {
        const result = await sellauth.listProducts({ perPage: 25, name: focusedOption.value || undefined });
        const products = result.data || result || [];
        await interaction.respond(
          products.slice(0, 25).map((p) => ({ name: `${p.name} (#${p.id})`, value: String(p.id) }))
        );
        return;
      }

      if (focusedOption.name === 'variant') {
        const productId = interaction.options.getString('product_id');
        if (!productId) {
          await interaction.respond([]);
          return;
        }

        const product = await sellauth.getProduct(productId);
        const variants = product.variants || product.data?.variants || [];
        const search = (focusedOption.value || '').toLowerCase();
        const filtered = search
          ? variants.filter((v) => variantLabel(v).toLowerCase().includes(search))
          : variants;

        await interaction.respond(
          filtered.slice(0, 25).map((v) => ({ name: truncate(variantLabel(v), 100), value: String(v.id) }))
        );
        return;
      }

      await interaction.respond([]);
    } catch (err) {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const invoiceId = interaction.options.getString('invoice_id');
    const productId = interaction.options.getString('product_id');
    const variantId = interaction.options.getString('variant');
    const role = interaction.options.getRole('notify_role');

    try {
      const invoice = await sellauth.getInvoice(invoiceId);
      const item = (invoice.items && invoice.items[0]) || null;

      if (!item) {
        await interaction.editReply('This invoice has no items to replace.');
        return;
      }

      const product = await sellauth.getProduct(productId);
      const variants = product.variants || product.data?.variants || [];
      const variant = variants.find((v) => String(v.id) === String(variantId));

      if (!variant) {
        await interaction.editReply('Could not find that variant on the selected product.');
        return;
      }

      // Pull an actual deliverable out of the variant's stock pool. The
      // variant object itself only carries metadata (e.g. `stock: 69` is a
      // count of available items, not an item) so we need a dedicated call
      // to fetch a real stock item to deliver.
      const stockResponse = await sellauth.getVariantStock(productId, variant.id);
      const replacement = extractStockItemContent(stockResponse);

      if (!replacement) {
        await interaction.editReply(
          'That variant has no available stock/content to deliver. Pick a different variant.'
        );
        return;
      }

      // SellAuth's "replace delivered" endpoint expects an invoice_item_id
      // and a `replacements` object containing the replacement content to
      // deliver in place of the existing item.
      const replaceDeliveredBody = {
        invoice_item_id: item.id,
        replacements: {
          content: replacement,
        },
      };

      // Debug logging: the replaceDelivered call has been observed to 404
      // even when getInvoice succeeds with the same invoiceId. Log the
      // exact values being sent so we can spot mutation/trimming/encoding
      // issues before the request goes out.
      console.log('[sellauthreplace] Debug before replaceDelivered call:', {
        invoiceId,
        invoiceIdType: typeof invoiceId,
        invoiceIdLength: invoiceId ? invoiceId.length : null,
        invoiceIdJSON: JSON.stringify(invoiceId),
        invoiceIdCharCodes: invoiceId ? Array.from(invoiceId).map((c) => c.charCodeAt(0)) : null,
        productId,
        productIdType: typeof productId,
        variantId,
        variantIdType: typeof variantId,
        requestBody: replaceDeliveredBody,
        requestBodyJSON: JSON.stringify(replaceDeliveredBody),
      });

      const result = await sellauth.replaceDelivered(invoiceId, replaceDeliveredBody);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔄 Item replaced')
        .setDescription(
          `Invoice \`${invoiceId}\` — **${truncate(item.product_name || 'Unknown product', 60)}** was replaced with **${truncate(
            product.name || 'Unknown product',
            60
          )} — ${truncate(variantLabel(variant), 60)}**.`
        )
        .addFields({
          name: 'New delivered content',
          value: '```\n' + truncate(replacement, 1000) + '\n```',
        })
        .setTimestamp();

      const logChannelId = config.replaceLogChannelId;
      const targetChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : interaction.channel;

      await targetChannel.send({ content: `${role}`, embeds: [embed] });
      await interaction.editReply(`✅ Replaced and posted to ${targetChannel}.`);
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not replace delivered item', err)] });
    }
  },
};
