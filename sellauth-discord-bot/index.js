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
  REST,
  Routes,
} = require('discord.js');

const { decodeEmail, errorEmbed } = require('./src/helpers');
const { buildEmailHistoryEmbed } = require('./src/emailLookup');
const { resolveClaim } = require('./src/claimRole');
const { buildDeliveredEmbed } = require('./src/deliveredLookup');
const sellauth = require('./src/sellauthApi');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// ---- Load commands -----------------------------------------------------
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

console.log(`📦 Loading ${commandFiles.length} commands...`);
const commands = [];
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.data.name) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`  ✓ ${command.data.name}`);
  }
}

// ---- Register commands on bot ready ------------------------------------
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📋 ${client.commands.size} commands loaded`);
  
  try {
    console.log(`🔧 Registering ${commands.length} slash commands to Discord...`);
    const rest = new REST().setToken(process.env.BOT_TOKEN);
    
    const result = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SERVER_ID),
      { body: commands }
    );
    
    console.log(`✅ Successfully registered ${result.length} slash commands!`);
  } catch (err) {
    console.error(`❌ Failed to register commands:`, err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    // ---- Slash commands ------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.warn(`⚠️ Command not found: ${interaction.commandName}`);
        return;
      }
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

      if (interaction.customId.startsWith('show_delivered:')) {
        const [, ownerId, invoiceId] = interaction.customId.split(':');
        if (interaction.user.id !== ownerId) {
          await interaction.reply({
            content: '🚫 Only the person who ran this command can view the delivered content.',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        try {
          const invoice = await sellauth.getInvoice(invoiceId);
          const embed = buildDeliveredEmbed(invoice);
          await interaction.editReply({ embeds: [embed] });
        } catch (err) {
          await interaction.editReply({ embeds: [errorEmbed('Could not fetch delivered content', err)] });
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

