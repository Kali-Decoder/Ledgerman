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
| **Ledgerman** | Dashboard + authority-bound operator console |

---

## Repository layout

```text
Multi-App-AI-Agent-Hackathon/
├── client/                 # Ledgerman UI (landing + /demo console)
├── invoice-agent/          # Backend: Gmail, Sheets, Slack, payment
└── README.md               # This file
```

---

## Prerequisites

- **Node.js 18+**
- Google Cloud project with **Gmail API** + **Google Sheets API**
- Slack workspace + Slack app (Bot + Socket Mode)
- A Google Sheet for the invoice ledger

---

## Quick start

### 1. Backend (`invoice-agent`)

```bash
cd invoice-agent
npm install
cp .env.example .env
```

Fill `.env` (see [Environment](#environment-variables)). Place Google OAuth client JSON at:

```text
invoice-agent/credentials/credentials.json
```

Then:

```bash
npm run dev
```

Agent listens on **http://localhost:3000**. First Gmail/Sheets call opens browser consent and writes `credentials/token.json`.

### 2. Frontend (`client`)

```bash
cd client
npm install
npm run dev
```

Open the Vite URL (usually **http://localhost:5173**).

| Route | What you get |
|-------|----------------|
| `/` | Ledgerman landing |
| `/demo` | Operator console (Overview · Invoices · Pipeline) |

Point the UI at the agent (optional; default is already localhost):

```bash
# client/.env
VITE_AGENT_URL=http://localhost:3000
```

---

## Demo walkthrough (UI)

With both processes running:

1. Open **http://localhost:5173** → **Open agent console**
2. **Overview** → confirm agent online / Sheets / Slack readiness
3. Click **Track Gmail** → emails extracted and appended to Sheets
4. **Invoices** → select a `pending` row → **Send to Slack**
5. In Slack → **Approve** or **Reject**
6. Sheet updates (`approved` → `paid`, or `rejected`)
7. **Pipeline** → review the activity log

CLI alternatives (from `invoice-agent/`):

```bash
npm run track:invoices
npm run test:slack
npm run test:slack-approval   # needs `npm run dev` in another terminal
```

---

## Environment variables

### `invoice-agent/.env`

| Variable | Purpose |
|----------|---------|
| `PORT` | Express port (default `3000`) |
| `GOOGLE_CREDENTIALS_PATH` | OAuth client JSON |
| `GOOGLE_TOKEN_PATH` | Cached OAuth token |
| `GMAIL_USER` | Usually `me` |
| `GMAIL_QUERY` | Gmail search (invoice / receipt / billing) |
| `GMAIL_MAX_RESULTS` | Max messages per track |
| `GOOGLE_SHEETS_ID` | Spreadsheet ID from the Sheet URL |
| `GOOGLE_SHEETS_TAB` | Tab name (default `Sheet1`) |
| `SLACK_BOT_TOKEN` | `xoxb-…` |
| `SLACK_APP_TOKEN` | `xapp-…` (Socket Mode) |
| `SLACK_CHANNEL` | e.g. `"#invoices"` (quote `#`) |
| `SLACK_SIGNING_SECRET` | Optional HTTP verification |
| `MOCK_PAYMENT_DELAY_MS` | Simulated payment latency |

### `client` (optional)

| Variable | Purpose |
|----------|---------|
| `VITE_AGENT_URL` | Agent base URL (default `http://localhost:3000`) |

---

## Google setup (short)

1. Enable **Gmail API** and **Google Sheets API**
2. Create OAuth client → save as `credentials/credentials.json`
3. Add redirect URI: `http://localhost:3001/oauth2callback`
4. Create a Sheet → set `GOOGLE_SHEETS_ID` in `.env`

---

## Slack setup (short)

1. Create a Slack app → Bot scope `chat:write` → install → copy `xoxb-…`
2. Enable **Socket Mode** → App-Level Token `connections:write` → `xapp-…`
3. Turn **Interactivity** on (no Request URL needed with Socket Mode)
4. Create channel → `/invite @YourBot` → set `SLACK_CHANNEL="#invoices"`

---

## Sheet columns

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
| `GET` | `/agent/invoices` | List sheet rows |
| `POST` | `/agent/track` | Gmail → extract → Sheets |
| `POST` | `/agent/approval` | Send Slack Approve / Reject for an invoice |
| `POST` | `/agent/pay` | Run payment for an invoice + update sheet |
| `POST` | `/agent/ping-slack` | Connection ping |
| `POST` | `/payment/mock` | Direct payment helper |

Example:

```bash
curl -s http://localhost:3000/agent/status | jq
curl -s -X POST http://localhost:3000/agent/track \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## Scripts (`invoice-agent`)

| Command | What it does |
|---------|----------------|
| `npm run dev` | Express + Slack Socket Mode |
| `npm run track:invoices` | Gmail → Sheets |
| `npm run read:gmail` | Print matching emails |
| `npm run test:slack` | Slack ping |
| `npm run test:slack-approval` | Demo row + Approve/Reject message |
| `npm run test:payment` | Payment simulation only |
| `npm run build` / `npm start` | Production |

---

## Notes

- **Payment** in this hackathon build is **PaymentIntent-shaped** (delay + generated `pi_…` id). It does **not** charge a real Stripe account unless you wire `STRIPE_SECRET_KEY` yourself.
- Track writes Sheets; Slack approval is a separate step from the console (or CLI).
- Do not commit `.env`, `credentials.json`, or `token.json`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| UI shows agent offline | Start `invoice-agent` on `:3000`; check `VITE_AGENT_URL` |
| `redirect_uri_mismatch` | Add `http://localhost:3001/oauth2callback` to Google OAuth client |
| Sheets 403 after Gmail works | Delete `token.json` and re-auth (Sheets scope) |
| Slack buttons do nothing | `npm run dev` running + `SLACK_APP_TOKEN` + Socket Mode on |
| `channel_not_found` | Quote `SLACK_CHANNEL="#invoices"` and invite the bot |
| Junk invoice ids like `oice` | Fixed in current extractor; clean old sheet rows or re-track |

---

## License

MIT
