const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const { requireOwner } = require('../src/permissions');

// SellAuth doesn't publish a public "updates" API, so this does a best-effort
// scrape of their changelog page. If SellAuth changes their site structure,
// this will just fall back to a plain link - update CHANGELOG_URL /
// selectors below if needed.
const CHANGELOG_URL = 'https://sellauth.com/changelog';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthupdates')
    .setDescription('Checks for recent SellAuth platform updates.'),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    try {
      const { data: html } = await axios.get(CHANGELOG_URL, { timeout: 10000 });
      const $ = cheerio.load(html);

      const entries = [];
      $('h1, h2, h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length < 200) entries.push(text);
      });

      const items = entries.slice(0, 10);

      const embed = new EmbedBuilder()
        .setColor(0x2b6cff)
        .setTitle('🆕 SellAuth Platform Updates')
        .setURL(CHANGELOG_URL)
        .setDescription(
          items.length
            ? items.map((e) => `• ${e}`).join('\n')
            : `Couldn't parse the changelog automatically — check it here: ${CHANGELOG_URL}`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🆕 SellAuth Platform Updates')
        .setDescription(`Couldn't fetch updates automatically. Check them here: ${CHANGELOG_URL}`)
        .setFooter({ text: err.message.slice(0, 200) });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
