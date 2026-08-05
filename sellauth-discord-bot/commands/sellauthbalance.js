const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed, money } = require('../src/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthbalance')
    .setDescription("Checks a customer's store balance by email.")
    .addStringOption((opt) => opt.setName('email').setDescription('Customer email').setRequired(true)),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const email = interaction.options.getString('email');

    try {
      const result = await sellauth.listCustomers({ email, perPage: 1 });
      const customers = result.data || result || [];
      const customer = customers[0];

      if (!customer) {
        await interaction.editReply(`No customer found for **${email}**.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x2b6cff)
        .setTitle(`💰 Balance — ${email}`)
        .setDescription(`**${money(customer.balance)}**`)
        .setFooter({ text: `Customer ID: ${customer.id}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not fetch balance', err)] });
    }
  },
};
