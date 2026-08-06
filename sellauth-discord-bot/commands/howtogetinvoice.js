const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('howtogetinvoice')
    .setDescription('Shows customers where to find their Invoice ID from SellAuth.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2b6cff)
      .setTitle('🧾 Where to find your Invoice ID')
      .setDescription(
        'After a customer purchases from your SellAuth (Kryo) store, they can find their Invoice ID in several places:'
      )
      .addFields(
        {
          name: '📄 Order confirmation page',
          value:
            'After payment is completed, SellAuth displays an order confirmation page that includes the invoice details. The Invoice ID is shown there.',
        },
        {
          name: '📧 Confirmation email',
          value:
            'If the customer entered an email address during checkout, SellAuth sends an order confirmation email containing the invoice information.',
        },
        {
          name: '👤 Customer account (if enabled)',
          value:
            'Customers who have an account on your SellAuth store can log in and view their past orders and invoice IDs.',
        }
      )
      .setFooter({ text: 'SellAuth Discord Bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
