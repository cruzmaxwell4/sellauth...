const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireOwner } = require('../src/permissions');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthpricedrop')
    .setDescription('Posts a price drop announcement panel.')
    .addStringOption((opt) => opt.setName('product').setDescription('Product name').setRequired(true))
    .addStringOption((opt) => opt.setName('stock').setDescription('Current stock').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('time').setDescription('Time/date of the drop (defaults to now)').setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;

    const product = interaction.options.getString('product');
    const stock = interaction.options.getString('stock');
    const time = interaction.options.getString('time') || `<t:${Math.floor(Date.now() / 1000)}:F>`;

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle(`💸 Price drop: ${product}`)
      .setImage(config.priceDropImage)
      .addFields(
        { name: 'Date', value: time, inline: true },
        { name: 'Stock', value: stock, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
