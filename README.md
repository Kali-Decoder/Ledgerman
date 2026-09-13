# Ledgerman

> Multi-app AI invoice agent for the Multi-App AI Agent Hackathon  
> **Repository (public):** [https://github.com/Kali-Decoder/Ledgerman](https://github.com/Kali-Decoder/Ledgerman)

---

## Project overview

**Ledgerman** is Zoth’s invoice control plane. It automates a real multi-app workflow:

1. **Connect Gmail** (OAuth) and find invoice / billing emails  
2. **Extract** vendor, amount, currency, invoice id, and dates  
3. **Log** every invoice into **Google Sheets** (with duplicate detection)  
4. Ask a human to **Approve / Reject** in **Slack**  
5. On approve, run a **Stripe-shaped payment** and write `paid` + payment id back to the sheet  

Operators drive the flow from a React console (`client`) backed by an Express agent (`invoice-agent`).

```text
Gmail  →  Extract  →  Google Sheets  →  Slack Approve/Reject  →  Payment  →  Sheet updated
```

| Package | Role |
|---------|------|
| `client/` | Ledgerman landing page + `/demo` operator console |
| `invoice-agent/` | Gmail, Sheets, Slack Socket Mode, payment APIs |

---

## Demo Video

[![Watch the Ledgerman demo](https://img.youtube.com/vi/SQ8a3n6i5Eg/hqdefault.jpg)](https://youtu.be/SQ8a3n6i5Eg)

➡️ **[Watch the 2-minute demo on YouTube](https://youtu.be/SQ8a3n6i5Eg)**

Repo is public for judges: [github.com/Kali-Decoder/Ledgerman](https://github.com/Kali-Decoder/Ledgerman)

### What the demo shows

1. Open Ledgerman UI → **Connect Gmail**  
2. **Track Gmail** → rows appear in Google Sheets / Invoices ledger  
3. **Send to Slack** → Approve in Slack  
4. Sheet status moves to **paid** with a payment id  
5. **Pipeline** activity log records each step  

---

## External apps used

<p align="center">
  <a href="https://gmail.com"><img src="https://cdn.simpleicons.org/gmail/EA4335" alt="Gmail" height="36" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://sheets.google.com"><img src="https://cdn.simpleicons.org/googlesheets/34A853" alt="Google Sheets" height="36" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://slack.com"><img src="https://cdn.simpleicons.org/slack/4A154B" alt="Slack" height="36" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://stripe.com"><img src="https://cdn.simpleicons.org/stripe/635BFF" alt="Stripe" height="36" /></a>
</p>

| | App | How Ledgerman uses it |
| :---: | --- | --- |
| <img src="https://cdn.simpleicons.org/gmail/EA4335" alt="" width="22" height="22" /> | **Gmail** | OAuth connect + search for invoice/receipt/billing emails |
| <img src="https://cdn.simpleicons.org/googlesheets/34A853" alt="" width="22" height="22" /> | **Google Sheets** | System of record for invoice rows, status, duplicates, payment fields |
| <img src="https://cdn.simpleicons.org/slack/4A154B" alt="" width="22" height="22" /> | **Slack** | Block Kit Approve / Reject buttons via Socket Mode |
| <img src="https://cdn.simpleicons.org/stripe/635BFF" alt="" width="22" height="22" /> | **Stripe (shaped)** | PaymentIntent-style settlement after approve (hackathon simulation — no live card charges unless you add a Stripe secret key) |

Supporting stack: Node.js, Express, TypeScript, React (Vite), Google APIs, Slack Web API + Socket Mode.

---

## Access for judges

| Resource | Link / note |
|----------|-------------|
| **Source code** | [github.com/Kali-Decoder/Ledgerman](https://github.com/Kali-Decoder/Ledgerman) — set the repo to **Public** |
| **Demo video** | Link in [Demo Video](#Demo-Video) — unlisted + shareable |
| **Run locally** | Follow [Setup instructions](#setup-instructions) below (needs your own Google + Slack credentials) |

Do **not** commit secrets (`.env`, `credentials.json`, `token.json`). Judges can reproduce the flow with their own API credentials using this README.

---

## Setup instructions

### Prerequisites

- Node.js **18+** and npm  
- Google Cloud project (Gmail API + Sheets API)  
- Slack workspace + Slack app (Bot + Socket Mode)  
- A Google Sheet for the invoice ledger  

### 1. Clone and install

```bash
git clone https://github.com/Kali-Decoder/Ledgerman.git
cd Ledgerman

# Backend
cd invoice-agent
npm install
cp .env.example .env
cp credentials/credentials.example.json credentials/credentials.json

# Frontend
cd ../client
npm install
```

### 2. Google credentials (Gmail + Sheets)

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project  
2. Enable **Gmail API** and **Google Sheets API**  
3. Configure **OAuth consent screen** (External + add yourself as a **Test user**)  
4. Create **OAuth client ID** (Web application)  
5. Add Authorized redirect URIs:

```text
http://localhost:3000/agent/auth/google/callback
http://localhost:3001/oauth2callback
```

6. Put Client ID / Secret into `invoice-agent/credentials/credentials.json`  
7. Create a Google Sheet → copy the ID from  
   `https://docs.google.com/spreadsheets/d/<GOOGLE_SHEETS_ID>/edit`  
8. Set `GOOGLE_SHEETS_ID` in `invoice-agent/.env`

### 3. Slack credentials

1. [api.slack.com/apps](https://api.slack.com/apps) → Create app  
2. Bot scope: `chat:write` → Install → copy `SLACK_BOT_TOKEN` (`xoxb-…`)  
3. Enable **Socket Mode** → App-Level Token with `connections:write` → `SLACK_APP_TOKEN` (`xapp-…`)  
4. Turn **Interactivity** On (no Request URL needed with Socket Mode)  
5. Create `#invoices`, run `/invite @YourBot`, set `SLACK_CHANNEL="#invoices"` (quoted)

### 4. Fill `invoice-agent/.env`

```env
PORT=3000
GOOGLE_CREDENTIALS_PATH=./credentials/credentials.json
GOOGLE_TOKEN_PATH=./credentials/token.json
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/agent/auth/google/callback
UI_ORIGIN=http://localhost:5173

GMAIL_USER=me
GMAIL_QUERY=(subject:invoice OR subject:receipt OR subject:billing) newer_than:30d
GMAIL_MAX_RESULTS=20

GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SHEETS_TAB=Sheet1

SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_CHANNEL="#invoices"

MOCK_PAYMENT_DELAY_MS=800
```

Optional `client/.env`:

```env
VITE_AGENT_URL=http://localhost:3000
```

### 5. Run

```bash
# Terminal A
cd invoice-agent && npm run dev

# Terminal B
cd client && npm run dev
```

Open **http://localhost:5173** → **Connect Gmail** → Track → Slack Approve.

| Route | Purpose |
|-------|---------|
| `/` | Landing |
| `/demo` | Operator console |

---

## How we tested reliability

We validated the multi-app path with live integrations (not UI-only mocks) and repeated failure cases.

### End-to-end path checks

| Step | How we tested | Expected result |
|------|----------------|-----------------|
| Agent health | `GET /health`, `GET /agent/status` | Agent up; Gmail/Sheets/Slack flags match credentials |
| Gmail OAuth | **Connect Gmail** in UI | Token saved to `credentials/token.json`; email shown in console |
| Gmail → Sheets | `POST /agent/track` or UI **Track Gmail** | Matching emails extracted and appended |
| Duplicate detection | Track the same invoice twice | Second row marked `duplicate` / skipped as duplicate |
| Slack delivery | `npm run test:slack` / UI **Send to Slack** | Message appears in `#invoices` |
| Approve / Reject | `npm run test:slack-approval` + button click | Sheet → `approved` then `paid`, or `rejected` |
| Payment path | `npm run test:payment` / Approve | PaymentIntent-shaped id written; status `paid` |
| Console refresh | UI Refresh / auto-refresh | Ledger stays in sync with the sheet |

### Reliability behaviors built in

- **Duplicate Invoice IDs** — avoid double-paying the same bill  
- **Socket Mode** — Slack buttons work without ngrok / public webhook URL  
- **Clear auth errors** — Track returns 401 with Connect Gmail guidance if disconnected  
- **Extraction guards** — avoid false ids like splitting the word “Invoice” into `oice`  
- **Status pipeline** — `pending → approved → paid` or `pending → rejected` visible in Sheets + UI  
- **Activity log** — Pipeline view records track / Slack / payment outcomes for audit during demos  

### Commands used during testing

```bash
cd invoice-agent
npm run read:gmail              # Gmail read path
npm run track:invoices          # Gmail → Sheets
npm run test:slack              # Slack connectivity
npm run test:slack-approval     # Approve/Reject + sheet update (keep npm run dev running)
npm run test:payment            # Payment simulation
curl -s http://localhost:3000/agent/status
```

### Known demo limits

- Stripe settlement is **PaymentIntent-shaped** for the hackathon (no live card charge unless you add real Stripe keys).  
- Field extraction is regex-based; messy email bodies can yield incomplete amounts — we tested with clear `invoice` subject lines and labeled amounts.  

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
                                                          │
                                                          ▼
                                                   Payment settle → Sheet
```

---

## Sheet columns

| Invoice ID | Vendor | Amount | Currency | Invoice Date | Due Date | Status | Duplicate | Approved By | Payment ID | Payment Status | Paid At | Payment Provider |

```text
pending → approved → paid
pending → rejected
pending → duplicate
```

---

## Agent HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `GET` | `/agent/status` | Integration readiness |
| `GET` | `/agent/auth/google` | Start Gmail OAuth |
| `GET` | `/agent/auth/google/callback` | OAuth callback |
| `POST` | `/agent/auth/google/disconnect` | Clear Google token |
| `GET` | `/agent/invoices` | List sheet rows |
| `POST` | `/agent/track` | Gmail → Sheets |
| `POST` | `/agent/approval` | Slack Approve / Reject |
| `POST` | `/agent/pay` | Payment + sheet update |
| `POST` | `/agent/ping-slack` | Slack ping |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| UI shows agent offline | Start `invoice-agent` on `:3000` |
| `redirect_uri_mismatch` | Add both localhost callback URIs on the Google OAuth client |
| Google access blocked | Add your account under OAuth **Test users** |
| Sheets 403 | Delete `token.json`, **Connect Gmail** again |
| Slack buttons do nothing | `npm run dev` + `SLACK_APP_TOKEN` + Socket Mode on |
| `channel_not_found` | Quote `SLACK_CHANNEL="#invoices"` and `/invite` the bot |

---

## License

MIT
