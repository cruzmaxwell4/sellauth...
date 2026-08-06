const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthc')
    .setDescription('Shows every SellAuth bot command.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2b6cff)
      .setTitle('📖 SellAuth Bot — Commands')
      .setDescription(
        [
          '`/sellauthcheckall` — health-check every SellAuth connection/command',
          '`/sellauthinvoice` — look up an invoice by ID',
          '`/sellauthdomain` — add/list/remove your store domain',
          '`/sellauthemail` — last 50 purchases for an email',
          '`/sellauthclaimpanel` — send the invoice → role claim panel',
          '`/sellauthreplace` — replace a delivered item with a fresh one',
          '`/sellauthmark` — mark a manual (e.g. PayPal) invoice as paid',
          '`/sellauthc` — this list',
          '`/sellauthlink` — get a checkout link for a product',
          '`/sellauthticket` — reply to a SellAuth support ticket',
          '`/sellauthapishopid` — set a temporary API key/shop ID override',
          '`/sellauthcoupon` — create a discount coupon',
          '`/sellauthbalance` — check a customer\'s store balance',
          '`/sellautrev` — revenue over 1 day / 10 days / 1 month / lifetime',
          '`/sellauthpricedrop` — post a price drop announcement panel',
          '`/sellauthupdates` — check for SellAuth platform updates',
          '`/howtogetinvoice` — shows customers where to find their Invoice ID',
        ].join('\n')
      )
      .setFooter({ text: 'SellAuth Discord Bot' });

    await interaction.reply({ embeds: [embed] });
  },
};
