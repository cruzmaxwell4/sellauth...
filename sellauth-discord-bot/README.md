# SellAuth Discord Bot

A Discord bot for managing a [SellAuth](https://sellauth.com) shop straight from Discord: invoice
lookups, a "claim your role" panel, coupons, replacements, revenue stats, and more.

## Commands

| Command | What it does |
|---|---|
| `/sellauthcheckall` | Health-checks env vars, Discord permissions, and every SellAuth API endpoint the bot uses |
| `/sellauthinvoice invoice_id` | Shows payment method, time bought, email, product, variant, delivery status + a "Check email" button |
| `/sellauthdomain set/list/remove` | Manage your store's custom domain |
| `/sellauthemail email` | Last 50 purchases for an email |
| `/sellauthclaimpanel` | Lets you edit the panel text, then sends the "Claim Role" panel with a button |
| `/sellauthreplace invoice_id product_id variant notify_role` | Replaces the delivered item on an invoice with a fresh product/variant from stock (autocomplete), posts result & pings a role |
| `/sellauthmark invoice_id` | Marks a manual order (e.g. PayPal F&F) as paid so the buyer gets delivery |
| `/sellauthc` | Lists all commands |
| `/sellauthlink product` | Gets a checkout link for a product (autocomplete search) |
| `/sellauthticket ticket_id message` | Replies to a SellAuth support ticket from Discord |
| `/sellauthapishopid api_key shop_id` | **Emergency fallback** — override API key/Shop ID if Railway env vars break |
| `/sellauthcoupon code percent_off max_uses expires` | Creates a % discount coupon |
| `/sellauthbalance email` | Checks a customer's store balance |
| `/sellautrev period` | Revenue for 1 day / 10 days / 1 month / lifetime |
| `/sellauthpricedrop product stock time` | Posts a price-drop announcement panel |
| `/sellauthupdates` | Best-effort check of the SellAuth changelog |

All commands are restricted to the Discord user ID in `OWNER_ID` (see `src/permissions.js` if you
want to open specific commands up to a staff role instead).

## 1. Create the Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy it → this is `BOT_TOKEN`.
3. Still on the **Bot** tab, turn on nothing extra — this bot only needs the default intents.
4. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands` → permissions: `Send Messages`,
   `Embed Links`, `Manage Roles`, `Use Slash Commands` → open the generated URL and invite the bot to
   your server.
5. Copy the **Application ID** (General Information tab) → this is `CLIENT_ID`.
6. In Discord, enable Developer Mode (User Settings → Advanced), right-click your server → **Copy Server ID**
   → this is `SERVER_ID`.
7. Right-click your own username → **Copy User ID** → this is `OWNER_ID`.

> ⚠️ Make sure the bot's role is positioned **above** any role it needs to assign (e.g. the $1+/$50+/$300+
> claim roles), or `Manage Roles` calls will fail.

## 2. Get your SellAuth API credentials

1. Log into your [SellAuth dashboard](https://dash.sellauth.com) → **Account → API** → copy your API key
   → this is `SELLAUTH_API`.
2. Your Shop ID is visible in your dashboard URL / shop settings → this is `SELLAUTH_SHOP_ID`.

## 3. Configure

Copy `.env.example` to `.env` and fill in all six values:

```
BOT_TOKEN=
CLIENT_ID=
SERVER_ID=
OWNER_ID=
SELLAUTH_API=
SELLAUTH_SHOP_ID=
```

Then open `config.json` and fill in the three role IDs for the claim panel (right-click a role in
Discord's server settings → Roles, with Developer Mode on, to copy its ID):

```json
"claimRoleTiers": [
  { "min": 1,   "roleId": "123...", "label": "$1+" },
  { "min": 50,  "roleId": "123...", "label": "$50+" },
  { "min": 300, "roleId": "123...", "label": "$300+" }
]
```

You can add/remove tiers freely — the bot always assigns the highest tier the invoice qualifies for.

## 4. Run it locally (optional, to test before deploying)

```bash
npm install
npm run deploy   # registers the slash commands to your server
npm start        # starts the bot
```

## 5. Push to GitHub

```bash
cd sellauth-discord-bot
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(`.env` and `runtime-config.json` are git-ignored, so your secrets never get committed. Create the
repo on GitHub first — "New repository" — then use the URL it gives you above.)

## 6. Deploy to Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → pick the repo you just pushed.
2. Once it's created, go to the service's **Variables** tab and add all six variables from `.env`
   (`BOT_TOKEN`, `CLIENT_ID`, `SERVER_ID`, `OWNER_ID`, `SELLAUTH_API`, `SELLAUTH_SHOP_ID`).
3. Railway will install dependencies and run `node index.js` automatically (via `railway.json`/`Procfile`).
4. **Register the slash commands once** after your first deploy — easiest way is to run
   `npm run deploy` from your own machine (with the same `.env` values) or open a one-off Railway shell
   and run `node deploy-commands.js`. You only need to re-run this when you add/change a command.

## Notes on the SellAuth API

This bot calls the real SellAuth API (`https://api.sellauth.com/v1`) documented at
https://docs.sellauth.com/api-documentation. A couple of endpoints (replace-delivered body shape,
ticket-reply endpoint) aren't fully published, so `src/sellauthApi.js` makes a reasonable best guess.
If `/sellauthreplace` or `/sellauthticket` throw an error, the bot shows you SellAuth's raw error
response — use that to tweak the request body in `src/sellauthApi.js`. Run `/sellauthcheckall` any
time to see exactly which SellAuth endpoints are working.

## Security notes

- `/sellauthapishopid` is a manual fallback only — the values you type are visible in the channel as
  the command usage line (Discord always shows what was typed), so only run it in a private channel.
- Every command checks `OWNER_ID` before doing anything. Edit `src/permissions.js` if you want to trust
  additional staff members or roles with specific commands.
