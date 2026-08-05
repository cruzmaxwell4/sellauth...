const sellauth = require('./sellauthApi');
const config = require('../config.json');

// Returns the best matching tier (highest min <= amount) or null.
function getTierForAmount(amount) {
  const sorted = [...config.claimRoleTiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => amount >= t.min) || null;
}

function tiersSummaryLine() {
  return config.claimRoleTiers
    .sort((a, b) => a.min - b.min)
    .map((t) => `**${t.label}**`)
    .join('  •  ');
}

// Looks up the invoice, validates it belongs to the claiming flow, and
// returns { ok, message, tier, amount }.
async function resolveClaim(invoiceId) {
  const invoice = await sellauth.getInvoice(invoiceId);
  const amount = Number(invoice.paid_usd ?? invoice.price_usd ?? 0);

  if (invoice.status !== 'completed') {
    return { ok: false, message: `Invoice \`${invoiceId}\` is not marked as completed/paid yet.` };
  }

  if (amount < 0.99) {
    return { ok: false, message: 'This invoice is under $0.99, so it does not qualify for a role.' };
  }

  const tier = getTierForAmount(amount);
  if (!tier) {
    return { ok: false, message: 'No matching role tier was found for this invoice amount.' };
  }

  if (!tier.roleId || tier.roleId.startsWith('PUT_')) {
    return {
      ok: false,
      message: `Tier "${tier.label}" matched, but its role ID isn't configured yet. Edit \`config.json\`.`,
    };
  }

  return { ok: true, tier, amount, invoice };
}

module.exports = { getTierForAmount, tiersSummaryLine, resolveClaim };
