// Lets the owner override SELLAUTH_API / SELLAUTH_SHOP_ID at runtime via
// /sellauthapishopid, in case the Railway environment variables aren't
// working. Overrides are written to runtime-config.json so they survive a
// bot restart (but NOT a fresh Railway deploy, since that wipes the disk).
// This file is git-ignored on purpose - never commit real keys to it.

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime-config.json');

function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read runtime-config.json:', err.message);
  }
  return {};
}

function save(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to write runtime-config.json:', err.message);
  }
}

function setOverride(apiKey, shopId) {
  const data = load();
  if (apiKey) data.apiKey = apiKey;
  if (shopId) data.shopId = shopId;
  save(data);
  return data;
}

function getApiKey() {
  const data = load();
  return data.apiKey || process.env.SELLAUTH_API;
}

function getShopId() {
  const data = load();
  return data.shopId || process.env.SELLAUTH_SHOP_ID;
}

function clearOverride() {
  save({});
}

module.exports = { setOverride, getApiKey, getShopId, clearOverride };
