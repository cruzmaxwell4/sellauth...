const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const sellauth = require('../src/sellauthApi');
const { requireOwner } = require('../src/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellauthcheckall')
    .setDescription('Runs a full health check on every SellAuth command / connection.'),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) return;
    await interaction.deferReply({ ephemeral: true });

    const checks = [];

    const runCheck = async (label, fn) => {
      try {
        await fn();
        checks.push({ label, ok: true, detail: 'OK' });
      } catch (err) {
        checks.push({ label, ok: false, detail: err.message.slice(0, 200) });
      }
    };

    // Env vars present?
    for (const key of ['BOT_TOKEN', 'CLIENT_ID', 'SERVER_ID', 'OWNER_ID', 'SELLAUTH_API', 'SELLAUTH_SHOP_ID']) {
      checks.push({
        label: `ENV ${key}`,
        ok: Boolean(process.env[key]),
        detail: process.env[key] ? 'set' : 'MISSING',
      });
    }

    // Discord permissions in this guild
    const me = interaction.guild.members.me;
    checks.push({
      label: 'Discord: Manage Roles permission',
      ok: me.permissions.has(PermissionsBitField.Flags.ManageRoles),
      detail: me.permissions.has(PermissionsBitField.Flags.ManageRoles) ? 'OK' : 'MISSING - needed for claim panel',
    });

    // SellAuth API checks
    await runCheck('SellAuth: list shops', () => sellauth.getShops());
    await runCheck('SellAuth: analytics', () => sellauth.getAnalytics());
    await runCheck('SellAuth: list invoices', () => sellauth.listInvoices({ perPage: 1 }));
    await runCheck('SellAuth: list products', () => sellauth.listProducts({ perPage: 1 }));
    await runCheck('SellAuth: list coupons', () => sellauth.listCoupons());
    await runCheck('SellAuth: list domains', () => sellauth.listDomains());
    await runCheck('SellAuth: list tickets', () => sellauth.listTickets({ perPage: 1 }));
    await runCheck('SellAuth: list customers', () => sellauth.listCustomers({ perPage: 1 }));

    const passed = checks.filter((c) => c.ok).length;
    const embed = new EmbedBuilder()
      .setColor(passed === checks.length ? 0x57f287 : 0xed4245)
      .setTitle('🩺 SellAuth Bot — Full Check')
      .setDescription(
        checks
          .map((c) => `${c.ok ? '✅' : '❌'} **${c.label}** — ${c.detail}`)
          .join('\n')
      )
      .setFooter({ text: `${passed}/${checks.length} checks passed` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
