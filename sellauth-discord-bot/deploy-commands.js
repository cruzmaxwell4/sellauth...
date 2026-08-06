#!/usr/bin/env node
console.error('[DEPLOY-COMMANDS] === STARTING DEPLOY SCRIPT ===');
console.log('[DEPLOY-COMMANDS] Starting...');

try {
  console.log('[DEPLOY-COMMANDS] Loading dotenv...');
  require('dotenv').config();
  console.log('[DEPLOY-COMMANDS] .env loaded');

  console.log('[DEPLOY-COMMANDS] Loading fs and path...');
  const fs = require('fs');
  const path = require('path');
  
  console.log('[DEPLOY-COMMANDS] Loading discord.js...');
  const { REST, Routes } = require('discord.js');
  console.log('[DEPLOY-COMMANDS] discord.js loaded');

  console.log('[DEPLOY-COMMANDS] Reading commands directory...');
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
  console.log(`[DEPLOY-COMMANDS] Found ${commandFiles.length} command files`);

  console.log('[DEPLOY-COMMANDS] Loading command modules...');
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
      console.log(`[DEPLOY-COMMANDS] ✓ ${command.data.name}`);
    }
  }
  console.log(`[DEPLOY-COMMANDS] Loaded ${commands.length} commands total`);

  console.log('[DEPLOY-COMMANDS] Validating env vars...');
  if (!process.env.BOT_TOKEN) {
    console.error('[DEPLOY-COMMANDS] ❌ BOT_TOKEN not set');
    process.exit(1);
  }
  console.log('[DEPLOY-COMMANDS] ✓ BOT_TOKEN present');

  if (!process.env.CLIENT_ID) {
    console.error('[DEPLOY-COMMANDS] ❌ CLIENT_ID not set');
    process.exit(1);
  }
  console.log('[DEPLOY-COMMANDS] ✓ CLIENT_ID present');

  if (!process.env.SERVER_ID) {
    console.error('[DEPLOY-COMMANDS] ❌ SERVER_ID not set');
    process.exit(1);
  }
  console.log('[DEPLOY-COMMANDS] ✓ SERVER_ID present');

  console.log('[DEPLOY-COMMANDS] Creating REST client...');
  const rest = new REST().setToken(process.env.BOT_TOKEN);
  console.log('[DEPLOY-COMMANDS] REST client created');

  (async () => {
    try {
      console.log(`[DEPLOY-COMMANDS] === PUSHING ${commands.length} COMMANDS TO DISCORD ===`);
      console.log(`[DEPLOY-COMMANDS] Guild ID: ${process.env.SERVER_ID}`);
      console.log(`[DEPLOY-COMMANDS] Client ID: ${process.env.CLIENT_ID}`);

      const result = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SERVER_ID),
        { body: commands }
      );

      console.log(`[DEPLOY-COMMANDS] ✅ SUCCESSFULLY REGISTERED ${result.length} SLASH COMMANDS!`);
      console.log('[DEPLOY-COMMANDS] Waiting 2 seconds before starting bot...');
      setTimeout(() => {
        console.log('[DEPLOY-COMMANDS] Exiting deploy script');
        process.exit(0);
      }, 2000);
    } catch (err) {
      console.error('[DEPLOY-COMMANDS] ❌ FAILED TO REGISTER COMMANDS');
      console.error('[DEPLOY-COMMANDS] Error message:', err.message);
      console.error('[DEPLOY-COMMANDS] Full error:', err);
      process.exit(1);
    }
  })();
} catch (err) {
  console.error('[DEPLOY-COMMANDS] 💥 FATAL ERROR (sync):', err.message);
  console.error('[DEPLOY-COMMANDS] Stack:', err.stack);
  process.exit(1);
}

