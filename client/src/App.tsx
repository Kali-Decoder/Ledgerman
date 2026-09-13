import { useEffect, useState } from 'react'
import './App.css'
import { fetchStatus, getAgentBaseUrl, type AgentStatus } from './agent-api'
import {
  InvoiceListView,
  InvoiceOverviewSection,
  InvoicePipelineView,
  useInvoiceWorkspace,
} from './InvoiceViews'

type IconName =
  | 'activity'
  | 'arrow'
  | 'box'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'copy'
  | 'external'
  | 'fingerprint'
  | 'grid'
  | 'lock'
  | 'pause'
  | 'play'
  | 'shield'
  | 'terminal'
  | 'wallet'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    activity: 'M3 12h4l2-7 4 14 2-7h6',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    box: 'm4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10',
    check: 'm5 12 4 4L19 6',
    chevron: 'm7 10 5 5 5-5',
    clock: 'M12 7v5l3 2m7-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    copy: 'M8 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3M6 8h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    external: 'M14 4h6v6m-1-5-8 8M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
    fingerprint: 'M12 11a2 2 0 0 1 2 2v5m-6 0v-5a4 4 0 0 1 8 0v5M5 18v-5a7 7 0 0 1 14 0v5M3 13a9 9 0 0 1 18 0',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    lock: 'M6 10V7a6 6 0 0 1 12 0v3m-13 0h14v10H5V10Z',
    pause: 'M8 5v14M16 5v14',
    play: 'm8 5 10 7-10 7V5Z',
    shield: 'M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z',
    terminal: 'm5 7 4 5-4 5m7 0h7',
    wallet: 'M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2m-16 0h16v12H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm11 6h3',
  }

  return (
    <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={paths[name]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type Overview = {
  mode: string
  dataSource: string
  network: { source: string; destination: string; chainKey: string }
  release: { name: string; version: string; digest: string; status: string; expiresAt: string; manifestHash?: string; artifactRoot?: string }
  evidence: Array<{ kind: string; status: string; detail: string }>
  capability: { status: string; spendCap: number; spent: number; callCap: number; callsUsed: number; runtimeKey: string }
  policy: { recipient: string; maxPayment: number; depositMax?: number }
  actions: Array<{ action: string; target: string; amount: number; state: string; age: string; txHash?: string }>
}

const API_URL = (import.meta.env.VITE_API_URL ?? 'https://airlock-control-plane.onrender.com').replace(/\/$/, '')

function DemoPage({ onHome }: { onHome: () => void }) {
  const [activeNav, setActiveNav] = useState('Overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const invoiceWorkspace = useInvoiceWorkspace()

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-head">
          <button className="brand brand-link" onClick={onHome} aria-label="Back to Ledgerman landing page">
            <div className="brand-mark"><span /></div>
            <div><div className="brand-name">LEDGERMAN</div></div>
          </button>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <div className="network-status"><span className="status-dot" /> INVOICE AGENT</div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {[
            ['Overview', 'grid'],
            ['Invoices', 'box'],
            ['Pipeline', 'activity'],
          ].map(([label, icon]) => (
            <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => setActiveNav(label)}>
              <Icon name={icon as IconName} size={17} /><span>{label}</span>
              {label === 'Invoices' && invoiceWorkspace.invoices.length > 0 && <span className="nav-count">{invoiceWorkspace.invoices.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">Agent</div>
          <div className="release-mini">
            <div className="release-mini-icon"><Icon name="box" size={16} /></div>
            <div className="release-mini-copy">
              <strong>{invoiceWorkspace.status?.ok ? 'Connected' : 'Offline'}</strong>
              <span>{invoiceWorkspace.agentUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <span className="mini-check"><Icon name="check" size={12} /></span>
          </div>
          <div className="user-row"><div className="avatar">ZO</div><div><strong>Zoth organization</strong><span>Operator</span></div></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Zoth organization</span><Icon name="chevron" size={14} /><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <div className={`live-indicator ${invoiceWorkspace.status?.ok ? 'online' : 'offline'}`}>
              <span className="status-dot" />
              {invoiceWorkspace.status?.ok ? 'agent online' : 'agent offline'}
            </div>

            <button className="secondary-button" disabled={invoiceWorkspace.pending} onClick={() => invoiceWorkspace.refresh(false)}>
              <Icon name="activity" size={15} /> Refresh
            </button>
          </div>
        </header>

        {activeNav === 'Overview' && (
          <div className="page-body">
            <InvoiceOverviewSection
              workspace={invoiceWorkspace}
              onOpenInvoices={() => setActiveNav('Invoices')}
              onOpenPipeline={() => setActiveNav('Pipeline')}
            />
          </div>
        )}
        {activeNav === 'Invoices' && <InvoiceListView workspace={invoiceWorkspace} />}
        {activeNav === 'Pipeline' && <InvoicePipelineView workspace={invoiceWorkspace} />}
      </main>
    </div>
  )
}


function LandingPage({ onEnterDemo }: { onEnterDemo: () => void }) {
  const [landingOverview, setLandingOverview] = useState<Overview | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/overview`)
      .then((response) => response.ok ? response.json() as Promise<Overview> : Promise.reject(new Error('chain unavailable')))
      .then((value) => { if (value.dataSource === 'creditcoin-chain') setLandingOverview(value) })
      .catch(() => setLandingOverview(null))
    fetchStatus()
      .then(setAgentStatus)
      .catch(() => setAgentStatus(null))
  }, [])

  const liveRelease = landingOverview?.dataSource === 'creditcoin-chain' ? landingOverview.release : null
  const liveCapability = landingOverview?.dataSource === 'creditcoin-chain' ? landingOverview.capability : null
  const liveDigest = liveRelease?.digest ?? 'release digest unavailable'
  const agentUrl = getAgentBaseUrl()
  const integrations = [
    ['Gmail', Boolean(agentStatus?.gmail), 'Invoice email intake'],
    ['Sheets', Boolean(agentStatus?.sheets), 'System of record'],
    ['Slack', Boolean(agentStatus?.slack), 'Approve / reject'],
    ['Socket', Boolean(agentStatus?.socketMode), 'Live button actions'],
  ] as const

  return <div className="product-landing">
    <header className="product-nav">
      <a className="product-brand" href="#product" aria-label="Ledgerman home"><span className="brand-mark"><span /></span><span><strong>LEDGERMAN</strong></span></a>
      <nav className="product-nav-links" aria-label="Product navigation">
        <a href="#product">Product</a>
        <a href="#pipeline">Pipeline</a>
        <a href="#integrations">Integrations</a>
        <a href="#authority">Authority</a>
        <a href="#console">Console</a>
      </nav>
      <div className="product-nav-actions"><button className="product-demo-link" onClick={onEnterDemo}>Open agent console <Icon name="arrow" size={14} /></button></div>
    </header>

    <main>
      <section className="product-hero product-container" id="product">
        <div className="product-hero-copy">
          <p className="product-kicker">INVOICE CONTROL PLANE FOR ZOTH</p>
          <h1>Run invoices end to end. <em>Pay only with earned authority.</em></h1>
          <p className="product-hero-lede">Ledgerman is Zoth’s invoice control plane. It reads Gmail, logs Google Sheets, asks Slack for approval, and settles vendor payments with Stripe — while release evidence decides what payment authority is allowed.</p>
          <div className="product-hero-actions">
            <button className="product-button product-button-primary" onClick={onEnterDemo}>Open agent console <Icon name="arrow" size={15} /></button>
            <a className="product-button product-button-secondary" href="#pipeline">See the pipeline <Icon name="arrow" size={15} /></a>
          </div>
          <div className="product-hero-note"><Icon name="lock" size={14} /> Human approval in Slack · bounded payment · release-bound capability</div>
        </div>

        <div className="hero-release-card landing-pipeline-card">
          <div className="hero-card-top"><span>INVOICE PIPELINE</span><span className="hero-card-status"><i /> {agentStatus?.ok ? 'agent ready' : 'connect agent'}</span></div>
          <div className="hero-card-title">Gmail → Sheets → Slack → pay</div>
          <div className="hero-gate-list">
            <div><span className="gate-check"><Icon name="check" size={11} /></span><span>Track invoice emails</span><b>Gmail</b></div>
            <div><span className="gate-check"><Icon name="check" size={11} /></span><span>Extract vendor + amount</span><b>Sheets</b></div>
            <div><span className="gate-check"><Icon name="check" size={11} /></span><span>Approve or reject</span><b>Slack</b></div>
            <div><span className="gate-check gate-check-open"><Icon name="lock" size={11} /></span><span>Stripe settlement</span><b>{liveCapability?.status?.toLowerCase() ?? 'bounded'}</b></div>
          </div>
          <div className="hero-card-footer"><code>agent</code><strong>{agentUrl.replace(/^https?:\/\//, '')}</strong></div>
        </div>
      </section>

      <section className="proof-strip product-container" aria-label="Product surfaces">
        <div className="proof-strip-label">END TO END</div>
        <div className="proof-strip-items">
          <span>Gmail intake</span>
          <span>Sheets ledger</span>
          <span>Slack approval</span>
          <span>Stripe payment</span>
          <span>Ledgerman authority gate</span>
          <span>Dashboard console</span>
        </div>
      </section>

      <section className="product-section product-container problem-section" id="problem">
        <div className="section-intro">
          <p className="product-kicker">THE OPERATIONS PROBLEM</p>
          <h2>Invoice email is noisy. Payment authority is dangerous.</h2>
          <p>Teams still copy fields by hand, chase approvals in chat, and leave payment credentials broader than any single release should hold.</p>
        </div>
        <div className="problem-grid">
          <div className="problem-card"><span>01</span><h3>Inbox overload</h3><p>Invoice, receipt, and billing threads arrive continuously. Manual triage misses duplicates and due dates.</p></div>
          <div className="problem-card"><span>02</span><h3>Approval gaps</h3><p>Finance needs a clear Approve / Reject path with an audit trail before money moves.</p></div>
          <div className="problem-card"><span>03</span><h3>Unbounded agents</h3><p>An automation that can pay vendors needs release identity, scope, and revocation — not a standing API key.</p></div>
        </div>
        <div className="section-callout"><Icon name="shield" size={18} /><span>The agent moves work across apps. Ledgerman decides whether that release may exercise payment authority.</span></div>
      </section>

      <section className="product-section product-container" id="outcomes">
        <div className="section-intro section-intro-wide">
          <p className="product-kicker">WHAT THIS PRODUCT DOES</p>
          <h2>One console for the multi-app invoice path.</h2>
        </div>
        <div className="outcome-grid">
          <div className="outcome-card"><span className="outcome-number">01</span><h3>Track Gmail</h3><p>Match invoice emails, extract vendor, amount, currency, and dates.</p><a href="#pipeline">Follow the pipeline <Icon name="arrow" size={13} /></a></div>
          <div className="outcome-card"><span className="outcome-number">02</span><h3>Log to Sheets</h3><p>Keep a durable ledger with duplicate detection and payment status.</p><a href="#integrations">See integrations <Icon name="arrow" size={13} /></a></div>
          <div className="outcome-card"><span className="outcome-number">03</span><h3>Slack decide</h3><p>Send Approve / Reject buttons and apply the decision back to the sheet.</p><a href="#pipeline">Open the flow <Icon name="arrow" size={13} /></a></div>
          <div className="outcome-card"><span className="outcome-number">04</span><h3>Bound payment</h3><p>Stripe settles approved invoices; Ledgerman gates capability-bound spend.</p><a href="#authority">Inspect authority <Icon name="arrow" size={13} /></a></div>
        </div>
      </section>

      <section className="product-section product-container lifecycle-section" id="pipeline">
        <div className="section-intro section-intro-wide">
          <p className="product-kicker">HOW THE PIPELINE RUNS</p>
          <h2>From inbox to paid, with a human in the loop.</h2>
          <p>Every step is visible in the dashboard. Slack remains the approval gate before payment.</p>
        </div>
        <div className="lifecycle-grid">
          {[
            ['01', 'Ingest', 'Poll Gmail for invoice and billing messages.'],
            ['02', 'Extract', 'Parse invoice id, vendor, amount, and dates.'],
            ['03', 'Record', 'Append or skip duplicates in Google Sheets.'],
            ['04', 'Approve', 'Post Slack Block Kit Approve / Reject actions.'],
            ['05', 'Settle', 'Create a Stripe PaymentIntent on approve.'],
            ['06', 'Update', 'Write paid status, payment id, and timestamp.'],
            ['07', 'Authorize', 'Issue release-bound capability when on-chain spend is required.'],
            ['08', 'Contain', 'Revoke the release to stop later payment authority.'],
          ].map(([number, title, copy]) => (
            <a className="lifecycle-step" href={number === '07' || number === '08' ? '#authority' : '#console'} key={number}>
              <span>{number}</span>
              <div><strong>{title}</strong><p>{copy}</p></div>
              <Icon name="arrow" size={15} />
            </a>
          ))}
        </div>
      </section>

      <section className="product-section product-container" id="integrations">
        <div className="section-intro">
          <p className="product-kicker">INTEGRATIONS</p>
          <h2>Four apps. One operator console.</h2>
          <p>Live readiness is read from the invoice-agent backend at <code>{agentUrl}</code>.</p>
        </div>
        <div className="landing-integration-grid">
          {integrations.map(([name, ok, copy]) => (
            <div className={`landing-integration-card ${ok ? 'ok' : 'missing'}`} key={name}>
              <div className="landing-integration-top">
                <strong>{name}</strong>
                <span>{ok ? 'connected' : 'needs setup'}</span>
              </div>
              <p>{copy}</p>
              <small>{ok ? 'Ready for console actions' : 'Configure credentials, then refresh status'}</small>
            </div>
          ))}
        </div>
        {agentStatus?.channel ? <p className="landing-channel-note">Slack channel <code>{agentStatus.channel}</code>{agentStatus.spreadsheetId ? <> · Sheet <code>{agentStatus.spreadsheetId.slice(0, 10)}…</code></> : null}</p> : null}
      </section>

      <section className="product-section product-container evidence-section" id="authority">
        <div className="section-intro">
          <p className="product-kicker">LEDGERMAN AUTHORITY LAYER</p>
          <h2>The agent proposes. Ledgerman decides.</h2>
          <p>Payment tools still pass through capability scope, budget, freshness, and revocation checks before value can move on-chain.</p>
        </div>
        <div className="evidence-graph-card">
          <div className="evidence-graph-line">
            <div><span className="evidence-graph-node"><Icon name="box" size={18} /></span><strong>Artifact</strong><small>exact release digest</small></div>
            <i />
            <div><span className="evidence-graph-node"><Icon name="activity" size={18} /></span><strong>Evaluation</strong><small>certified suite</small></div>
            <i />
            <div><span className="evidence-graph-node"><Icon name="fingerprint" size={18} /></span><strong>Approval</strong><small>policy + budgets</small></div>
            <i />
            <div><span className="evidence-graph-node"><Icon name="shield" size={18} /></span><strong>Status</strong><small>active or revoked</small></div>
          </div>
          <div className="evidence-graph-footer">
            <code>releaseDigest · {liveDigest}</code>
            <a href="/demo" onClick={(event) => { event.preventDefault(); onEnterDemo() }}>Open evidence + capabilities <Icon name="arrow" size={13} /></a>
          </div>
        </div>
        <div className="landing-authority-meta">
          <div><span>Release</span><strong>{liveRelease?.status ?? 'chain-backed'}</strong></div>
          <div><span>Capability</span><strong>{liveCapability?.status ?? 'bounded'}</strong></div>
          <div><span>Max payment</span><strong>{landingOverview ? `${landingOverview.policy.maxPayment} native` : 'policy-bound'}</strong></div>
        </div>
      </section>

      <section className="product-section product-container surfaces-section" id="console">
        <div className="section-intro section-intro-wide">
          <p className="product-kicker">OPERATOR CONSOLE</p>
          <h2>The dashboard layout for the full application.</h2>
        </div>
        <div className="surface-grid">
          <div><span>01 / overview</span><h3>Invoice overview</h3><p>Pending, approved, paid, and rejected metrics with pipeline actions.</p></div>
          <div><span>02 / invoices</span><h3>Invoice ledger</h3><p>Select rows, send Slack approval, and run Stripe payment.</p></div>
          <div id="enterprise"><span>03 / pipeline</span><h3>Activity history</h3><p>Timestamped track, Slack, approval, and payment events.</p></div>
        </div>
      </section>

      <section className="product-section product-container execution-section" id="execution">
        <div className="section-intro">
          <p className="product-kicker">PAYMENT BOUNDARY</p>
          <h2>Approve in Slack. Enforce at the vault.</h2>
          <p>Approved invoices settle through Stripe. On-chain vendor pay still requires an allowlisted intent inside the Ledgerman boundary.</p>
        </div>
        <div className="execution-flow">
          {[
            ['01', 'Invoice tracked', 'Gmail + Sheets'],
            ['02', 'Slack approval', 'human decision'],
            ['03', 'Stripe payment', 'payment path'],
            ['04', 'Capability check', 'scope + budget'],
            ['05', 'Router validate', 'typed intent'],
            ['06', 'Vault execute', 'bounded pay'],
          ].map(([number, title, copy], index) => (
            <div className="execution-step" key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <small>{copy}</small>
              {index < 5 && <Icon name="arrow" size={15} />}
            </div>
          ))}
        </div>
        <div className="execution-outcomes">
          <div className="allowed-action">
            <span><Icon name="check" size={14} /></span>
            <div>
              <strong>Allowed path</strong>
              <code>approved invoice → Stripe pay / vendor.pay(policy recipient)</code>
              <small>human approved · within cap · fresh capability</small>
            </div>
          </div>
          <div className="rejected-actions">
            <span><Icon name="shield" size={14} /></span>
            <div>
              <strong>Stopped before settlement</strong>
              <div><code>rejected in Slack</code><code>duplicate invoice</code><code>revoked release</code><code>over budget</code></div>
            </div>
          </div>
        </div>
      </section>

      <section className="product-section product-container faq-section">
        <div className="section-intro section-intro-wide">
          <p className="product-kicker">FAQ</p>
          <h2>Direct answers for the hackathon demo.</h2>
        </div>
        <div className="faq-list">
          <details><summary>What is the end-to-end path?</summary><p>Gmail intake, field extraction, Google Sheets logging, Slack Approve/Reject, then Stripe payment with sheet status updates — operated from the Ledgerman dashboard.</p></details>
          <details><summary>Do I still need WindTunnel?</summary><p>No. This Ledgerman landing page and <code>/demo</code> dashboard are the full UI for Zoth’s invoice agent.</p></details>
          <details><summary>Where do I configure Gmail, Sheets, and Slack?</summary><p>In the <code>invoice-agent</code> backend env and Google/Slack credentials. The landing page and console read live readiness from <code>/agent/status</code>.</p></details>
          <details><summary>How does Stripe payment work here?</summary><p>Approve creates a Stripe PaymentIntent and updates the sheet. Ledgerman remains the boundary for capability-bound on-chain spend.</p></details>
          <details><summary>What happens if the release is revoked?</summary><p>Later Ledgerman payment intents are rejected even if the runtime still signs, while Slack can still record operational decisions in Sheets.</p></details>
        </div>
      </section>
    </main>

    <footer className="product-footer product-container" id="access">
      <div>
        <p className="product-kicker">READY TO RUN LEDGERMAN</p>
        <h2>Open Ledgerman and drive the full Zoth invoice pipeline.</h2>
        <p>Start <code>invoice-agent</code>, launch this client, and use Overview → Invoices → Pipeline.</p>
      </div>
      <div className="product-footer-actions">
        <a className="product-button product-button-secondary" href={`${agentUrl}/health`} target="_blank" rel="noreferrer">Check agent health <Icon name="external" size={14} /></a>
        <button className="product-button product-button-ghost" onClick={onEnterDemo}>Open agent console <Icon name="arrow" size={14} /></button>
      </div>
    </footer>
  </div>
}

function App() {
  const [route, setRoute] = useState(window.location.pathname === '/demo' ? '/demo' : '/')

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname === '/demo' ? '/demo' : '/')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (path: '/' | '/demo') => {
    window.history.pushState({}, '', path)
    setRoute(path)
  }

  return route === '/demo' ? <DemoPage onHome={() => navigate('/')} /> : <LandingPage onEnterDemo={() => navigate('/demo')} />
}

export default App
