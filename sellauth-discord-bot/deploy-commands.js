require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands to guild ${process.env.SERVER_ID}...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SERVER_ID),
      { body: commands }
    );

    console.log('✅ Slash commands registered successfully.');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
    process.exit(1);
  }
})();
