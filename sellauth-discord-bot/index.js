require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { decodeEmail, errorEmbed } = require('./src/helpers');
const { buildEmailHistoryEmbed } = require('./src/emailLookup');
const { resolveClaim } = require('./src/claimRole');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// ---- Load commands -----------------------------------------------------
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // ---- Slash commands ------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    // ---- Autocomplete ---------------------------------------------------
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      return;
    }

    // ---- Buttons ----------------------------------------------------------
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('checkemail:')) {
        await interaction.deferReply({ ephemeral: true });
        const email = decodeEmail(interaction.customId.split(':')[1]);
        try {
          const embed = await buildEmailHistoryEmbed(email);
          await interaction.editReply({ embeds: [embed] });
        } catch (err) {
          await interaction.editReply({ embeds: [errorEmbed('Could not fetch purchase history', err)] });
        }
        return;
      }

      if (interaction.customId === 'claim_role_open_modal') {
        const modal = new ModalBuilder().setCustomId('claim_role_modal').setTitle('Claim Your Role');

        const invoiceInput = new TextInputBuilder()
          .setCustomId('invoice_id')
          .setLabel('Your invoice ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(invoiceInput));
        await interaction.showModal(modal);
        return;
      }
    }

    // ---- Modals -------------------------------------------------------------
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'claimpanel_edit') {
        const title = interaction.fields.getTextInputValue('panel_title');
        const description = interaction.fields.getTextInputValue('panel_description');

        const embed = new EmbedBuilder()
          .setColor(0x2b6cff)
          .setTitle(title)
          .setDescription(`**${description}**`);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('claim_role_open_modal')
            .setLabel('Claim Role')
            .setEmoji('🗞️')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Panel sent.', ephemeral: true });
        return;
      }

      if (interaction.customId === 'claim_role_modal') {
        await interaction.deferReply({ ephemeral: true });
        const invoiceId = interaction.fields.getTextInputValue('invoice_id').trim();

        try {
          const result = await resolveClaim(invoiceId);
          if (!result.ok) {
            await interaction.editReply(`❌ ${result.message}`);
            return;
          }

          await interaction.member.roles.add(result.tier.roleId);
          await interaction.editReply(
            `✅ Verified invoice \`${invoiceId}\` ($${result.amount.toFixed(2)}) — you've been given the **${result.tier.label}** role!`
          );
        } catch (err) {
          await interaction.editReply({ embeds: [errorEmbed('Could not verify/claim role', err)] });
        }
        return;
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: `❌ Something went wrong: ${err.message}`.slice(0, 1900), ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else if (interaction.isRepliable && interaction.isRepliable()) {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(process.env.BOT_TOKEN);
