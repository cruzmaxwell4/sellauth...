const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed, truncate } = require('../src/helpers');
const config = require('../config.json');

function variantLabel(variant) {
  const name = variant.name || variant.variant || `Variant #${variant.id}`;
  const stockCount = variant.stock_count ?? variant.stock?.length ?? variant.quantity;
  return stockCount != null ? `${name} (stock: ${stockCount})` : name;
}

function stockItemContent(stockItem) {
  return (
    stockItem.value ||
    stockItem.content ||
    stockItem.data ||
    stockItem.text ||
    JSON.stringify(stockItem)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthreplace')
    .setDescription('Pulls a fresh stock item from a variant, shows it, and removes it from stock.')
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
      opt.setName('notify_role').setDescription('Role to notify with the stock item').setRequired(true)
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

    const productId = interaction.options.getString('product_id');
    const variantId = interaction.options.getString('variant');
    const role = interaction.options.getRole('notify_role');

    try {
      const product = await sellauth.getProduct(productId);
      const variants = product.variants || product.data?.variants || [];
      const variant = variants.find((v) => String(v.id) === String(variantId));

      if (!variant) {
        await interaction.editReply('Could not find that variant on the selected product.');
        return;
      }

      const stockResult = await sellauth.getVariantStock(productId, variantId);
      const stockItems = stockResult.data || stockResult.stock || stockResult || [];

      if (!stockItems.length) {
        await interaction.editReply('No available stock items found for that variant.');
        return;
      }

      const stockItem = stockItems[0];
      const content = stockItemContent(stockItem);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📦 Stock item')
        .setDescription(
          `**${truncate(product.name || 'Unknown product', 60)} — ${truncate(variantLabel(variant), 60)}**\n\`\`\`${truncate(
            String(content),
            1900
          )}\`\`\``
        )
        .setTimestamp();

      const logChannelId = config.replaceLogChannelId;
      const targetChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : interaction.channel;

      await targetChannel.send({ content: `${role}`, embeds: [embed] });

      await sellauth.deleteStockItem(stockItem.id);

      await interaction.editReply(`✅ Pulled a stock item, posted it to ${targetChannel}, and removed it from stock.`);
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not pull stock item', err)] });
    }
  },
};
