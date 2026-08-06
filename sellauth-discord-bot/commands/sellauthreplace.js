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

function extractVariantContent(variant) {
  if (!variant) return null;

  // 1. SellAuth commonly nests the actual stock/content under a
  // `deliverables` array on the variant. Prefer this first.
  if (Array.isArray(variant.deliverables) && variant.deliverables.length) {
    const text = extractDeliverableText(variant.deliverables[0]);
    if (text) return text;
  }

  // 2. Plain string fields directly on the variant.
  if (typeof variant.content === 'string' && variant.content) return variant.content;
  if (typeof variant.delivery === 'string' && variant.delivery) return variant.delivery;
  if (typeof variant.deliverable === 'string' && variant.deliverable) return variant.deliverable;
  if (typeof variant.value === 'string' && variant.value) return variant.value;

  // 3. Other possible array fields holding stock/deliverable entries.
  const stockList = variant.stock || variant.items || variant.stocks || variant.stock_items;
  if (Array.isArray(stockList) && stockList.length) {
    const text = extractDeliverableText(stockList[0]);
    if (text) return text;
  }

  // 4. Sometimes the variant object itself *is* the deliverable (e.g. when
  // the API returns a flattened stock entry rather than a variant wrapper).
  // If it has an identifiable stock indicator and no nested structure was
  // found above, treat the variant as the deliverable content itself.
  const looksLikeStockCount = Number(variant.stock_count ?? variant.quantity ?? variant.stock);
  const hasStock = !Number.isNaN(looksLikeStockCount) ? looksLikeStockCount > 0 : true;
  if (hasStock && (variant.content !== undefined || variant.data !== undefined)) {
    const text = extractDeliverableText(variant.content) || extractDeliverableText(variant.data);
    if (text) return text;
  }

  // 5. Last resort: if the variant has *some* content-bearing fields, fall
  // back to a JSON representation so we don't falsely report "no stock"
  // when data is actually present in an unexpected shape.
  const hasAnyContentField = ['content', 'delivery', 'deliverable', 'value', 'data', 'deliverables', 'stock', 'items']
    .some((key) => variant[key] !== undefined && variant[key] !== null);
  if (hasAnyContentField) {
    try {
      const json = JSON.stringify(variant.deliverables || variant.content || variant.data || variant);
      if (json && json !== '{}' && json !== '[]' && json !== 'null') return json;
    } catch (err) {
      // ignore stringify errors and fall through to null
    }
  }

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

      const replacement = extractVariantContent(variant);

      if (!replacement) {
        await interaction.editReply(
          'That variant has no available stock/content to deliver. Pick a different variant.'
        );
        return;
      }

      // SellAuth's "replace delivered" endpoint expects an invoice_item_id
      // and the replacement content to deliver in place of the existing item.
      const result = await sellauth.replaceDelivered(invoiceId, {
        invoice_item_id: item.id,
        replacement: replacement,
      });

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
