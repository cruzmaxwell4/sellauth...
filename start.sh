#!/bin/bash
cd sellauth-discord-bot
echo "[START] Running deploy-commands.js..."
node deploy-commands.js
echo "[START] Deploy-commands exit code: $?"
echo "[START] Starting bot with node index.js..."
node index.js

