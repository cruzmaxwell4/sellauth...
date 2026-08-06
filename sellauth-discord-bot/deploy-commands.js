#!/usr/bin/env node

console.log('[DEPLOY-COMMANDS] Starting...');

try {
  require('dotenv').config();
  console.log('[DEPLOY-COMMANDS] .env loaded');

  const fs = require('fs');
  const path = require('path');
  const { REST, Routes } = require('discord.js');
  console.log('[DEPLOY-COMMANDS] discord.js loaded');

  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
  console.log(`[DEPLOY-COMMANDS] Found ${commandFiles.length} command files`);

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
      console.log(`[DEPLOY-COMMANDS] ✓ ${command.data.name}`);
    }
  }

  console.log('[DEPLOY-COMMANDS] Validating env vars...');
  if (!process.env.BOT_TOKEN) {
    console.error('[DEPLOY-COMMANDS] ❌ BOT_TOKEN not set');
    process.exit(1);
  }

  if (!process.env.CLIENT_ID) {
    console.error('[DEPLOY-COMMANDS] ❌ CLIENT_ID not set');
    process.exit(1);
  }

  if (!process.env.SERVER_ID) {
    console.error('[DEPLOY-COMMANDS] ❌ SERVER_ID not set');
    process.exit(1);
  }

  console.log('[DEPLOY-COMMANDS] Creating REST client...');
  const rest = new REST().setToken(process.env.BOT_TOKEN);

  (async () => {
    try {
      console.log(`[DEPLOY-COMMANDS] Pushing ${commands.length} commands to Discord...`);
      console.log(`[DEPLOY-COMMANDS] Guild: ${process.env.SERVER_ID}`);
      console.log(`[DEPLOY-COMMANDS] Client: ${process.env.CLIENT_ID}`);

      const result = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SERVER_ID),
        { body: commands }
      );

      console.log(`[DEPLOY-COMMANDS] ✅ Successfully registered ${result.length} slash commands!`);
      process.exit(0);
    } catch (err) {
      console.error('[DEPLOY-COMMANDS] ❌ Failed to register slash commands:');
      console.error('[DEPLOY-COMMANDS] Error:', err.message);
      process.exit(1);
    }
  })();
} catch (err) {
  console.error('[DEPLOY-COMMANDS] 💥 Fatal error:', err.message);
  console.error(err);
  process.exit(1);
}

