# Discord OAuth2 Voice Avatar App

Short setup guide for running this project on Linux after cloning from Git.

## 1. Prerequisites

- Git
- Node.js 20+ and npm
- Build tools for native deps (`better-sqlite3`, `sharp`)

Ubuntu/Debian example:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3 pkg-config
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Clone and install

```bash
git clone <your-repo-url>
cd OAuth2Test
npm install
```

## 3. Create `.env`

Create a `.env` file in the project root:

```env
WEB_CLIENT_ID=your_discord_oauth_client_id
WEB_CLIENT_SECRET=your_discord_oauth_client_secret
TOKEN=your_discord_bot_token
SESSION_SECRET=generate_a_long_random_secret
PORT=1500
TRUST_PROXY=false
```

Notes:
- `SESSION_SECRET` is required (app will fail fast if missing).
- If running behind one reverse proxy (Nginx/Caddy/Traefik), set `TRUST_PROXY=1`.
- If running directly (no proxy), use `TRUST_PROXY=false`.

Generate a session secret:

```bash
openssl rand -hex 64
```

## 4. Discord OAuth redirect URL

In the Discord Developer Portal (OAuth2 settings), add:

`http://<host>:1500/api/auth/discord/redirect`

If you use a domain + HTTPS, use that full URL instead.

## 5. Run

```bash
npm run appStart
```

Optional (bot script directly):

```bash
npm run bot
```

## 6. First run behavior

On first run, the app creates local data under:

- `src/web/user-data/`

This includes SQLite DB/session data and uploaded assets.

## 7. Production tips

- Set `NODE_ENV=production`
- Run behind HTTPS reverse proxy
- Use a process manager (`pm2` or `systemd`)
- Do not commit `.env` or `src/web/user-data/`
