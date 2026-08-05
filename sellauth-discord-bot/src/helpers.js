const { EmbedBuilder } = require('discord.js');

function money(n) {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return `<t:${Math.floor(d.getTime() / 1000)}:F>`;
}

function errorEmbed(title, err) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`❌ ${title}`)
    .setDescription('```\n' + String(err.message || err).slice(0, 3800) + '\n```')
    .setTimestamp();
}

function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

// Splits a long block of text into Discord-safe chunks (<= limit chars),
// breaking on newlines where possible.
function chunkText(text, limit = 4000) {
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

function encodeEmail(email) {
  return Buffer.from(email).toString('base64url');
}

function decodeEmail(encoded) {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

module.exports = { money, formatDate, errorEmbed, truncate, chunkText, encodeEmail, decodeEmail };
