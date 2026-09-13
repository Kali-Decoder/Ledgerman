# Invoice Agent

Multi-app automation agent for a hackathon demo:

**Gmail → extract invoice fields → Google Sheets → Slack Approve/Reject → mock Stripe payment**

Built with **Node.js + TypeScript + Express**.

---

## Architecture

```text
Gmail (trigger + source)
        │
        ▼
  Extract invoice fields
        │
        ▼
  Google Sheets (system of record)
        │
        ▼
  Slack (#invoices)
   Approve / Reject
        │
   ┌────┴────┐
   ▼         ▼
Approved   Rejected
   │
   ▼
Mock Stripe payment (pi_mock_…)
   │
   ▼
Sheet status → paid
```

| App | Role |
|-----|------|
| **Gmail** | Find invoice/receipt/billing emails |
| **Google Sheets** | Log every invoice row |
| **Slack** | Human approval with buttons (Socket Mode) |
| **Mock Stripe** | Fake PaymentIntent after approve (no real money) |

---

## Features

- Google OAuth (Gmail read + Sheets write)
- Invoice email polling with configurable Gmail query
- Lightweight field extraction (Invoice ID, Vendor, Amount, Currency, dates)
- Duplicate detection by Invoice ID (`YES` / `NO` in sheet)
- Slack Bot message + **Approve / Reject** Block Kit buttons
- Socket Mode interactivity (no ngrok required)
- Mock Stripe payment on approve → sheet status `paid`

---

## Project structure

```text
invoice-agent/
├── credentials/
│   ├── credentials.example.json   # OAuth client template
│   ├── credentials.json           # your Google OAuth client (gitignored)
│   └── token.json                 # cached OAuth token (gitignored)
├── src/
│   ├── server.ts                  # Express + Slack Socket Mode
│   ├── config/
│   │   ├── env.ts
│   │   └── google-auth.ts
│   ├── routes/
│   │   ├── gmail.routes.ts
│   │   ├── slack.routes.ts
│   │   └── payment.routes.ts
│   ├── services/
│   │   ├── gmail.service.ts
│   │   ├── sheets.service.ts
│   │   ├── slack.service.ts
│   │   ├── slack-socket.service.ts
│   │   ├── slack-interactions.service.ts
│   │   ├── extraction.service.ts
│   │   ├── payment.service.ts
│   │   ├── invoice.service.ts
│   │   └── duplicate.service.ts
│   ├── rules/
│   │   └── invoice.rules.ts
│   ├── types/
│   │   └── invoice.ts
│   ├── utils/
│   │   └── logger.ts
│   ├── scripts/
│   │   ├── read-gmail.ts
│   │   ├── track-invoices.ts
│   │   └── test-payment.ts
│   ├── test-slack.ts
│   └── test-slack-approval.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Prerequisites

- Node.js 18+
- A Google Cloud project
- A Slack workspace + Slack app
- A Google Sheet for invoice tracking

---

## 1. Install

```bash
cd invoice-agent
npm install
cp .env.example .env
```

---

## 2. Google Cloud (Gmail + Sheets)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. Enable APIs:
   - **Gmail API**
   - **Google Sheets API**
3. **OAuth consent screen** (External / Testing) → add your Google account as a test user.
4. **Credentials** → Create **OAuth client ID** (Desktop or Web).
5. Download JSON → save as:

   ```text
   credentials/credentials.json
   ```

6. Add this **Authorized redirect URI** on the OAuth client:

   ```text
   http://localhost:3001/oauth2callback
   ```

7. Create a Google Sheet (e.g. `Invoice Tracker`). First tab name defaults to `Sheet1`.
8. Copy the spreadsheet ID from the URL:

   ```text
   https://docs.google.com/spreadsheets/d/<GOOGLE_SHEETS_ID>/edit
   ```

9. Put it in `.env`:

   ```env
   GOOGLE_SHEETS_ID=your_spreadsheet_id
   GOOGLE_SHEETS_TAB=Sheet1
   ```

First Gmail/Sheets run opens a browser consent URL and saves `credentials/token.json`.

---

## 3. Slack app

### Bot token

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → create an app.
2. **OAuth & Permissions → Bot Token Scopes** → add:
   - `chat:write`
3. **Install to Workspace** → copy **Bot User OAuth Token** (`xoxb-...`).

### Socket Mode (Approve / Reject)

1. **Socket Mode** → enable.
2. **Basic Information → App-Level Tokens** → generate token with `connections:write` (`xapp-...`).
3. **Interactivity & Shortcuts** → **On**  
   (with Socket Mode you do **not** need a Request URL / ngrok).
4. Optional: copy **Signing Secret** into `.env`.

### Channel

1. Create `#invoices` (or your channel).
2. Invite the bot:

   ```text
   /invite @YourBotName
   ```

3. In `.env`, quote the channel (important — `#` is a comment in dotenv):

   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   SLACK_CHANNEL="#invoices"
   SLACK_SIGNING_SECRET=...
   ```

⚠️ Never commit `.env`, `credentials.json`, or `token.json`.

---

## 4. Environment variables

See `.env.example`. Important keys:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CREDENTIALS_PATH` | OAuth client JSON path |
| `GOOGLE_TOKEN_PATH` | Cached token path |
| `GMAIL_QUERY` | Gmail search query |
| `GMAIL_MAX_RESULTS` | Max emails per poll |
| `GOOGLE_SHEETS_ID` | Spreadsheet ID |
| `GOOGLE_SHEETS_TAB` | Tab name (`Sheet1`) |
| `SLACK_BOT_TOKEN` | `xoxb-...` |
| `SLACK_APP_TOKEN` | `xapp-...` for Socket Mode |
| `SLACK_CHANNEL` | e.g. `"#invoices"` |
| `SLACK_SIGNING_SECRET` | Optional request verification |
| `MOCK_PAYMENT_DELAY_MS` | Fake payment latency (default `800`) |
| `PORT` | Express port (default `3000`) |

---

## Sheet columns

Written automatically on first append / header refresh:

| Invoice ID | Vendor | Amount | Currency | Invoice Date | Due Date | Status | Duplicate | Approved By | Payment ID | Payment Status | Paid At | Payment Provider |

### Status flow

```text
pending → approved → paid   (+ Payment ID / Status / Paid At / Provider filled)
pending → rejected
pending → duplicate         (when Invoice ID already exists)
```

If your sheet still has the old 9-column header, restart `track:invoices` or `test:slack-approval` once so headers are rewritten to include payment columns.

---

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run read:gmail` | OAuth → read matching emails → print |
| `npm run track:invoices` | Gmail → extract → append to Sheets |
| `npm run test:slack` | Send a plain Slack ping |
| `npm run test:slack-approval` | Add demo sheet row + Approve/Reject message |
| `npm run test:payment` | Run mock Stripe payment only |
| `npm run dev` | Start Express + Slack Socket Mode |
| `npm run build` / `npm start` | Production build & run |

---

## Demo walkthrough

### A. Gmail → Sheets

```bash
npm run track:invoices
```

Tip: email yourself with subject `invoice` so the default query matches.

Custom query:

```bash
npm run track:invoices -- --query="subject:invoice newer_than:90d" --max=20
```

### B. Slack connection

```bash
npm run test:slack
```

Expected in Slack: **Invoice Automation Agent connected successfully!**

### C. Approve / Reject + mock payment

Terminal A (keep running):

```bash
npm run dev
```

Look for: `Slack Socket Mode connected`

Terminal B:

```bash
npm run test:slack-approval
```

In `#invoices`:

- **Approve** → sheet `approved` then `paid`; Slack shows `pi_mock_...`
- **Reject** → sheet `rejected`; no payment

### D. Mock payment alone

```bash
npm run test:payment -- --amount=125.5 --currency=USD --id=INV-TEST-1
```

HTTP (with `npm run dev`):

```bash
curl -X POST http://localhost:3000/payment/mock \
  -H 'Content-Type: application/json' \
  -d '{"invoiceId":"INV-1","vendor":"Acme","amount":50,"currency":"USD"}'
```

---

## HTTP endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `POST` | `/payment/mock` | Trigger mock Stripe payment |
| `POST` | `/slack/interactions` | HTTP fallback (unused when Socket Mode is on) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `redirect_uri_mismatch` | Add `http://localhost:3001/oauth2callback` to Google OAuth client |
| Gmail works but Sheets 403 | Delete `credentials/token.json` and re-auth (Sheets scope) |
| `not_allowed_token_type` | Use `xoxb-` bot token, not `xapp-` app token, for `SLACK_BOT_TOKEN` |
| `channel_not_found` | Use `SLACK_CHANNEL="#invoices"` (quoted) and `/invite` the bot |
| Buttons do nothing | Ensure `npm run dev` is running + `SLACK_APP_TOKEN` set + Socket Mode on |
| Empty extraction fields | Email body may lack clear labels; regex extractor is demo-grade |

---

## Security notes

- Do **not** commit secrets (`.env`, Google credentials, Slack tokens).
- Mock Stripe does **not** call Stripe and moves **no real money**.
- Rotate any token that was ever pasted into chat or a public repo.

---

## License

MIT
