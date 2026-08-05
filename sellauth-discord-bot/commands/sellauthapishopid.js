const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireOwner } = require('../src/permissions');
const runtimeConfig = require('../src/runtimeConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthapishopid')
    .setDescription('Emergency override: set your SellAuth API key + Shop ID if Railway env vars fail.')
    .addStringOption((opt) => opt.setName('api_key').setDescription('Your SellAuth API key').setRequired(true))
    .addStringOption((opt) => opt.setName('shop_id').setDescription('Your SellAuth Shop ID').setRequired(true)),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;

    const apiKey = interaction.options.getString('api_key');
    const shopId = interaction.options.getString('shop_id');

    runtimeConfig.setOverride(apiKey, shopId);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🔧 Override saved')
      .setDescription(
        'This is only meant as a fallback for when the Railway environment variables aren\'t working.\n\n' +
          '⚠️ It is stored in `runtime-config.json` on disk, which is wiped on a fresh Railway deploy — ' +
          "fix your Railway variables (SELLAUTH_API / SELLAUTH_SHOP_ID) when you get the chance.\n\n" +
          '⚠️ **Heads up:** Discord shows the slash command you typed (including the API key) in the ' +
          'channel to anyone watching, even though this reply is private. Run this in a channel only you ' +
          'can see, then delete your command usage from the channel history afterward if needed.'
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
