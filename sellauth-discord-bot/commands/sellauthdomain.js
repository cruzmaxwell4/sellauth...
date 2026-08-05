const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed } = require('../src/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthdomain')
    .setDescription('Manage your SellAuth store domain.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Add/switch your store to a new domain')
        .addStringOption((opt) =>
          opt.setName('domain').setDescription('e.g. shop.yoursite.com').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List domains connected to your shop'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a domain by its ID')
        .addStringOption((opt) => opt.setName('domain_id').setDescription('Domain ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'set') {
        const domain = interaction.options.getString('domain');
        const result = await sellauth.addDomain(domain);
        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🌐 Domain added')
          .setDescription(
            `**${domain}** has been submitted to SellAuth.\n\n` +
              'If it needs DNS verification, point your domain\'s DNS records at SellAuth as shown on your dashboard — the store will start using it once verified.'
          )
          .addFields({ name: 'Raw response', value: '```json\n' + JSON.stringify(result, null, 2).slice(0, 900) + '\n```' });
        await interaction.editReply({ embeds: [embed] });
      } else if (sub === 'list') {
        const result = await sellauth.listDomains();
        const domains = result.data || result || [];
        const embed = new EmbedBuilder()
          .setColor(0x2b6cff)
          .setTitle('🌐 Connected domains')
          .setDescription(
            domains.length
              ? domains.map((d) => `• \`${d.id}\` — **${d.domain}** (${d.status || 'unknown status'})`).join('\n')
              : 'No custom domains connected.'
          );
        await interaction.editReply({ embeds: [embed] });
      } else if (sub === 'remove') {
        const domainId = interaction.options.getString('domain_id');
        await sellauth.deleteDomain(domainId);
        await interaction.editReply({ content: `✅ Removed domain \`${domainId}\`.` });
      }
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Domain action failed', err)] });
    }
  },
};
