# Ledgerman

**Ledgerman** is Zoth’s invoice control plane. It runs invoices end to end across apps:

**Gmail → extract → Google Sheets → Slack Approve/Reject → Stripe-shaped payment**

Operated from a React console (`client`) backed by an Express agent (`invoice-agent`).

---

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐
│  Ledgerman UI   │────▶│  invoice-agent   │
│  (Vite / React) │     │  (Express :3000) │
└─────────────────┘     └────────┬─────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
     Gmail API              Google Sheets              Slack
   invoice emails            ledger rows          Approve / Reject
                                                          │
                                                          ▼
                                                   Payment settle
                                              (PaymentIntent-shaped)
                                                          │
                                                          ▼
                                                   Sheet → paid
```

| Platform | Role |
|----------|------|
| **Gmail** | Match invoice / receipt / billing emails |
| **Google Sheets** | System of record (status, duplicates, payment fields) |
| **Slack** | Human Approve / Reject (Socket Mode) |
| **Stripe path** | Settlement after approve (simulated PaymentIntent in this demo) |
| **Ledgerman** | Dashboard + operator console |

---

## Repository layout

```text
Multi-App-AI-Agent-Hackathon/
├── client/                 # Ledgerman UI (landing + /demo console)
├── invoice-agent/          # Backend: Gmail, Sheets, Slack, payment
│   ├── .env.example
│   ├── credentials/
│   │   └── credentials.example.json
│   └── src/
└── README.md
```

---

## Prerequisites

- **Node.js 18+** and npm
- A Google account
- A Slack workspace where you can create an app
- ~15 minutes for API credentials

---

## Setup from scratch

Follow these steps in order.

### Step 1 — Clone and install

```bash
git clone <your-repo-url> Multi-App-AI-Agent-Hackathon
cd Multi-App-AI-Agent-Hackathon

# Backend
cd invoice-agent
npm install
cp .env.example .env
cp credentials/credentials.example.json credentials/credentials.json

# Frontend
cd ../client
npm install
```

---

### Step 2 — Google Cloud (Gmail + Sheets)

#### 2.1 Create / select a project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select an existing one)

#### 2.2 Enable APIs

In **APIs & Services → Library**, enable:

- **Gmail API**
- **Google Sheets API**

#### 2.3 OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External** (or Internal for Workspace)
3. App name: e.g. `Ledgerman`
4. Add your Google account under **Test users** (required while app is in Testing)
5. Scopes (or allow them at consent time):
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/spreadsheets`

#### 2.4 Create OAuth client credentials

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Web application** (recommended for UI Connect Gmail)
3. Name: e.g. `Ledgerman local`
4. Under **Authorized redirect URIs**, add **both**:

```text
http://localhost:3000/agent/auth/google/callback
http://localhost:3001/oauth2callback
```

5. Click **Create**
6. Download the JSON (or copy Client ID + Client Secret)

#### 2.5 Save credentials in the repo

Edit `invoice-agent/credentials/credentials.json` so it looks like:

```json
{
  "web": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "YOUR_PROJECT_ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": [
      "http://localhost:3000/agent/auth/google/callback",
      "http://localhost:3001/oauth2callback"
    ]
  }
}
```

> Do **not** commit this file. It is gitignored.

#### 2.6 Create the invoice Google Sheet

1. Create a new Google Sheet (e.g. `Ledgerman Invoices`)
2. Keep the first tab named **`Sheet1`** (or note the tab name)
3. Copy the spreadsheet ID from the URL:

```text
https://docs.google.com/spreadsheets/d/<GOOGLE_SHEETS_ID>/edit
```

4. Put that ID into `invoice-agent/.env` (next step)

Headers are created automatically on first successful track.

---

### Step 3 — Slack app

#### 3.1 Create the app

1. Open [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name: e.g. `Ledgerman` → pick your workspace

#### 3.2 Bot token

1. **OAuth & Permissions → Bot Token Scopes** → add:
   - `chat:write`
2. **Install to Workspace** → allow
3. Copy **Bot User OAuth Token** (`xoxb-…`)

#### 3.3 Socket Mode (for Approve / Reject buttons)

1. **Socket Mode** → **Enable Socket Mode**
2. **Basic Information → App-Level Tokens → Generate Token**
   - Token name: e.g. `ledgerman-socket`
   - Scope: `connections:write`
3. Copy the token (`xapp-…`)
4. **Interactivity & Shortcuts** → turn **On**  
   (with Socket Mode you do **not** need a Request URL / ngrok)

#### 3.4 Channel

1. Create a channel, e.g. `#invoices`
2. Invite the bot:

```text
/invite @Ledgerman
```

3. Optional: copy **Signing Secret** from **Basic Information**

---

### Step 4 — Fill `invoice-agent/.env`

Open `invoice-agent/.env` and set at least:

```env
PORT=3000
NODE_ENV=development

GOOGLE_CREDENTIALS_PATH=./credentials/credentials.json
GOOGLE_TOKEN_PATH=./credentials/token.json
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/agent/auth/google/callback
UI_ORIGIN=http://localhost:5173

GMAIL_USER=me
GMAIL_QUERY=(subject:invoice OR subject:receipt OR subject:billing) newer_than:30d
GMAIL_MAX_RESULTS=20

GOOGLE_SHEETS_ID=paste_your_spreadsheet_id_here
GOOGLE_SHEETS_TAB=Sheet1

SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_CHANNEL="#invoices"
SLACK_SIGNING_SECRET=optional_signing_secret

MOCK_PAYMENT_DELAY_MS=800
```

**Important**

- Quote the channel: `SLACK_CHANNEL="#invoices"` — `#` starts a comment in dotenv if unquoted
- Never commit `.env`, `credentials.json`, or `token.json`

---

### Step 5 — Optional client env

Default agent URL is already `http://localhost:3000`. Only create `client/.env` if you need to override:

```env
VITE_AGENT_URL=http://localhost:3000
```

---

### Step 6 — Run the app

Use **two terminals**.

**Terminal A — backend**

```bash
cd invoice-agent
npm run dev
```

You should see the agent on **http://localhost:3000** and (if Slack tokens are set) Socket Mode connected.

**Terminal B — frontend**

```bash
cd client
npm run dev
```

Open **http://localhost:5173**.

| Route | What you get |
|-------|----------------|
| `/` | Ledgerman landing |
| `/demo` | Operator console (Overview · Invoices · Pipeline) |

---

### Step 7 — Connect Gmail and run the pipeline

1. On the landing page or `/demo`, click **Connect Gmail**
2. Sign in with a **test user** from the OAuth consent screen
3. Allow Gmail read + Sheets access
4. You return to `/demo?gmail=connected` — Ledgerman saves `credentials/token.json` and auto-runs **Track Gmail → Sheets**
5. Open **Invoices** → select a `pending` row → **Send to Slack**
6. In Slack → **Approve** or **Reject**
7. Sheet updates (`approved` → `paid`, or `rejected`)
8. Check **Pipeline** for the activity log

**Tip:** Email yourself with subject `invoice` so the default Gmail query matches.

---

## Credentials checklist

| Credential | Where it lives | How you get it |
|------------|----------------|----------------|
| Google OAuth client | `invoice-agent/credentials/credentials.json` | Cloud Console → Credentials |
| Google OAuth token | `invoice-agent/credentials/token.json` | Created after **Connect Gmail** |
| Spreadsheet ID | `GOOGLE_SHEETS_ID` in `.env` | Sheet URL `/d/<ID>/edit` |
| Slack bot token | `SLACK_BOT_TOKEN` | Slack app → OAuth (`xoxb-…`) |
| Slack app token | `SLACK_APP_TOKEN` | Slack app → App-Level Tokens (`xapp-…`) |
| Slack channel | `SLACK_CHANNEL` | e.g. `"#invoices"` + `/invite` bot |

---

## Environment variables (reference)

### `invoice-agent/.env`

| Variable | Purpose |
|----------|---------|
| `PORT` | Express port (default `3000`) |
| `GOOGLE_CREDENTIALS_PATH` | OAuth client JSON path |
| `GOOGLE_TOKEN_PATH` | Cached user token path |
| `GOOGLE_OAUTH_REDIRECT_URI` | UI OAuth callback |
| `UI_ORIGIN` | Ledgerman origin after OAuth |
| `GMAIL_USER` | Usually `me` |
| `GMAIL_QUERY` | Gmail search query |
| `GMAIL_MAX_RESULTS` | Max messages per track |
| `GOOGLE_SHEETS_ID` | Spreadsheet ID |
| `GOOGLE_SHEETS_TAB` | Tab name (default `Sheet1`) |
| `SLACK_BOT_TOKEN` | `xoxb-…` |
| `SLACK_APP_TOKEN` | `xapp-…` for Socket Mode |
| `SLACK_CHANNEL` | e.g. `"#invoices"` |
| `SLACK_SIGNING_SECRET` | Optional request verification |
| `MOCK_PAYMENT_DELAY_MS` | Simulated payment latency |

### `client/.env` (optional)

| Variable | Purpose |
|----------|---------|
| `VITE_AGENT_URL` | Agent base URL (default `http://localhost:3000`) |

---

## Sheet columns

Written automatically on first append:

| Invoice ID | Vendor | Amount | Currency | Invoice Date | Due Date | Status | Duplicate | Approved By | Payment ID | Payment Status | Paid At | Payment Provider |

Status flow:

```text
pending → approved → paid
pending → rejected
pending → duplicate   (same Invoice ID already logged)
```

---

## Agent HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `GET` | `/agent/status` | Integration readiness (Gmail / Sheets / Slack) |
| `GET` | `/agent/auth/google` | Start Gmail OAuth (redirect) |
| `GET` | `/agent/auth/google/callback` | OAuth callback → save token → UI |
| `POST` | `/agent/auth/google/disconnect` | Clear stored Google token |
| `GET` | `/agent/invoices` | List sheet rows |
| `POST` | `/agent/track` | Gmail → extract → Sheets |
| `POST` | `/agent/approval` | Send Slack Approve / Reject |
| `POST` | `/agent/pay` | Payment for an invoice + update sheet |
| `POST` | `/agent/ping-slack` | Connection ping |
| `POST` | `/payment/mock` | Direct payment helper |

```bash
curl -s http://localhost:3000/agent/status
curl -s -X POST http://localhost:3000/agent/track \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## Scripts (`invoice-agent`)

| Command | What it does |
|---------|----------------|
| `npm run dev` | Express + Slack Socket Mode |
| `npm run track:invoices` | Gmail → Sheets (CLI) |
| `npm run read:gmail` | Print matching emails |
| `npm run test:slack` | Slack ping |
| `npm run test:slack-approval` | Demo row + Approve/Reject message |
| `npm run test:payment` | Payment simulation only |
| `npm run build` / `npm start` | Production |

---

## Notes

- **Payment** in this hackathon build is **PaymentIntent-shaped** (delay + generated `pi_…` id). It does **not** charge a real Stripe account.
- Prefer **Connect Gmail** in the UI while `npm run dev` is running. CLI scripts can still open a browser consent on port `3001` if no token exists.
- Do **not** commit secrets: `.env`, `credentials.json`, `token.json`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| UI shows agent offline | Start `invoice-agent` on `:3000`; check `VITE_AGENT_URL` |
| `redirect_uri_mismatch` | Add `http://localhost:3000/agent/auth/google/callback` (and `http://localhost:3001/oauth2callback`) on the OAuth client |
| Google “app not verified” / access blocked | Add your account under OAuth consent **Test users** |
| Sheets 403 after Gmail works | Delete `credentials/token.json`, click **Connect Gmail** again (Sheets scope) |
| Slack buttons do nothing | `npm run dev` running + `SLACK_APP_TOKEN` set + Socket Mode on |
| `channel_not_found` | Use `SLACK_CHANNEL="#invoices"` (quoted) and `/invite` the bot |
| `not_allowed_token_type` | Bot token must be `xoxb-…`, app token `xapp-…` |
| No emails matched | Email yourself with subject `invoice`, or widen `GMAIL_QUERY` |
| Junk invoice ids like `oice` | Fixed in current extractor; clean old sheet rows or re-track |

---

## License

MIT
