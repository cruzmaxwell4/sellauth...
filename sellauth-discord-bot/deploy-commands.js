require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

console.log(`\n🔧 Registering slash commands...\n`);

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`  ✓ ${command.data.name}`);
  }
}

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not set');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID not set');
  process.exit(1);
}

if (!process.env.SERVER_ID) {
  console.error('❌ SERVER_ID not set');
  process.exit(1);
}

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`\n📤 Pushing ${commands.length} commands to Discord...`);
    console.log(`   Guild: ${process.env.SERVER_ID}`);
    console.log(`   Client: ${process.env.CLIENT_ID}\n`);

    const result = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SERVER_ID),
      { body: commands }
    );

    console.log(`✅ Successfully registered ${result.length} slash commands!\n`);
  } catch (err) {
    console.error('❌ Failed to register slash commands:');
    console.error(err.message);
    console.error(err);
    process.exit(1);
  }
})();

