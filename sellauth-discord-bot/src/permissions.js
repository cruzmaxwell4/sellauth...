// All SellAuth commands touch money, accounts or roles, so by default every
// command is restricted to the bot owner (OWNER_ID in .env). If you want
// other staff to use specific commands, edit the command file and remove
// the requireOwner() call, or swap it for a role check.

function isOwner(interaction) {
  return interaction.user.id === process.env.OWNER_ID;
}

async function requireOwner(interaction) {
  if (!isOwner(interaction)) {
    await interaction.reply({
      content: '🚫 Only the bot owner can use this command.',
      ephemeral: true,
    });
    return false;
  }
  return true;
}

module.exports = { isOwner, requireOwner };
