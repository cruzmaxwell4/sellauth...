const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed } = require('../src/helpers');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthlink')
    .setDescription('Gets a checkout link for a product.')
    .addStringOption((opt) =>
      opt
        .setName('product')
        .setDescription('Start typing a product name')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused();
      const result = await sellauth.listProducts({ perPage: 25, name: focused || undefined });
      const products = result.data || result || [];
      await interaction.respond(
        products.slice(0, 25).map((p) => ({ name: p.name, value: String(p.id) }))
      );
    } catch (err) {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const productId = interaction.options.getString('product');

    try {
      const product = await sellauth.getProduct(productId);
      const shops = await sellauth.getShops();
      const shopList = Array.isArray(shops) ? shops : shops.data || [];
      const shop = shopList.find((s) => String(s.id) === String(process.env.SELLAUTH_SHOP_ID)) || shopList[0];

      const domain = config.storefrontDomain || (shop ? `${shop.subdomain}.mysellauth.com` : 'yourshop.mysellauth.com');
      const link = `https://${domain}/product/${product.path}`;

      const embed = new EmbedBuilder()
        .setColor(0x2b6cff)
        .setTitle(`🔗 ${product.name}`)
        .setDescription(`**[Click here to buy](${link})**\n\n${link}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not build product link', err)] });
    }
  },
};
