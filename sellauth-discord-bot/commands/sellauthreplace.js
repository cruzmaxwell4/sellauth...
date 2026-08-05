const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');
const { errorEmbed, truncate } = require('../src/helpers');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthreplace')
    .setDescription('Replaces the delivered account/item on an invoice with a fresh one from stock.')
    .addStringOption((opt) =>
      opt.setName('invoice_id').setDescription('The invoice ID to replace').setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName('notify_role').setDescription('Role to notify with the replacement result').setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply();

    const invoiceId = interaction.options.getString('invoice_id');
    const role = interaction.options.getRole('notify_role');

    try {
      const invoice = await sellauth.getInvoice(invoiceId);
      const item = (invoice.items && invoice.items[0]) || null;

      if (!item) {
        await interaction.editReply('This invoice has no items to replace.');
        return;
      }

      // NOTE: SellAuth's "replace delivered" endpoint expects an
      // invoice_item_id and a replacements object. The exact shape of
      // `replacements` isn't fully documented publicly - sending an empty
      // object asks SellAuth to auto-pull a fresh item from stock. If your
      // shop needs a different shape, check the raw error below and adjust
      // the body in src/sellauthApi.js -> replaceDelivered().
      const result = await sellauth.replaceDelivered(invoiceId, {
        invoice_item_id: item.id,
        replacements: {},
      });

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔄 Item replaced')
        .setDescription(
          `Invoice \`${invoiceId}\` — **${truncate(item.product_name || 'Unknown product', 60)}** was replaced.`
        )
        .addFields({
          name: 'New delivered content',
          value: '```\n' + truncate(JSON.stringify(result, null, 2), 1000) + '\n```',
        })
        .setTimestamp();

      const logChannelId = config.replaceLogChannelId;
      const targetChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : interaction.channel;

      await targetChannel.send({ content: `${role}`, embeds: [embed] });
      await interaction.editReply(`✅ Replaced and posted to ${targetChannel}.`);
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Could not replace delivered item', err)] });
    }
  },
};
