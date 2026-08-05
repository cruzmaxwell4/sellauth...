const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed } = require('../src/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthcoupon')
    .setDescription('Creates a percentage-off coupon.')
    .addStringOption((opt) => opt.setName('code').setDescription('Coupon code').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('percent_off').setDescription('Discount percentage (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .addIntegerOption((opt) =>
      opt.setName('max_uses').setDescription('How many times this coupon can be used total').setRequired(true).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName('expires').setDescription('Expiration date (YYYY-MM-DD). Leave blank for no expiration').setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const code = interaction.options.getString('code');
    const percentOff = interaction.options.getInteger('percent_off');
    const maxUses = interaction.options.getInteger('max_uses');
    const expires = interaction.options.getString('expires');

    try {
      const coupon = await sellauth.createCoupon({
        code,
        global: true,
        discount: percentOff,
        type: 'percentage',
        max_uses: maxUses,
        expiration_date: expires || null,
      });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🏷️ Coupon created')
        .addFields(
          { name: 'Code', value: `\`${code}\``, inline: true },
          { name: 'Discount', value: `${percentOff}%`, inline: true },
          { name: 'Max uses', value: `${maxUses}`, inline: true },
          { name: 'Expires', value: expires || 'Never', inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      void coupon;
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not create coupon', err)] });
    }
  },
};
