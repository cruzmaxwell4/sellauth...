const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed, money } = require('../src/helpers');

const RANGES = {
  '1day': 1,
  '10day': 10,
  '1month': 30,
  lifetime: 3650, // ~10 years, close enough to "lifetime"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellautrev')
    .setDescription('Shows revenue made over a time period.')
    .addStringOption((opt) =>
      opt
        .setName('period')
        .setDescription('Time period')
        .setRequired(true)
        .addChoices(
          { name: '1 day', value: '1day' },
          { name: '10 days', value: '10day' },
          { name: '1 month', value: '1month' },
          { name: 'Lifetime', value: 'lifetime' }
        )
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const period = interaction.options.getString('period');
    const days = RANGES[period];

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    try {
      const analytics = await sellauth.getAnalytics({
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
      });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`📈 Revenue — ${interaction.options.getString('period')}`)
        .addFields(
          { name: 'Revenue', value: money(analytics.revenue), inline: true },
          { name: 'Orders', value: `${analytics.orders ?? 0}`, inline: true },
          { name: 'Customers', value: `${analytics.customers ?? 0}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not fetch revenue analytics', err)] });
    }
  },
};
