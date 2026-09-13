import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  disconnectGmail,
  fetchInvoices,
  fetchStatus,
  getAgentBaseUrl,
  getGmailConnectUrl,
  payInvoice,
  sendApproval,
  trackInvoices,
  type AgentInvoice,
  type AgentStatus,
} from './agent-api'

type IconName =
  | 'activity'
  | 'arrow'
  | 'box'
  | 'check'
  | 'clock'
  | 'copy'
  | 'external'
  | 'grid'
  | 'lock'
  | 'mail'
  | 'play'
  | 'refresh'
  | 'send'
  | 'shield'
  | 'terminal'
  | 'wallet'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    activity: 'M3 12h4l2-7 4 14 2-7h6',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    box: 'm4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10',
    check: 'm5 12 4 4L19 6',
    clock: 'M12 7v5l3 2m7-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    copy: 'M8 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3M6 8h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    external: 'M14 4h6v6m-1-5-8 8M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    lock: 'M6 10V7a6 6 0 0 1 12 0v3m-13 0h14v10H5V10Z',
    mail: 'M4 6h16v12H4V6Zm0 0 8 7 8-7',
    play: 'm8 5 10 7-10 7V5Z',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6',
    send: 'm5 12 14-7-5 14-3-5-6-2Z',
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

type HistoryKind = 'refresh' | 'track' | 'slack' | 'approval' | 'payment' | 'error' | 'info'
type HistoryEntry = { id: string; at: string; kind: HistoryKind; action: string; detail: string; ok: boolean }
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'paid' | 'duplicate'

const HISTORY_KEY = 'airlock-invoice-console-history'

function nowIso() {
  return new Date().toISOString()
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatRelative(iso: string) {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

function summarize(result: unknown): string {
  if (result == null) return '—'
  if (typeof result === 'string') return formatHistoryDetail(result)

  if (typeof result === 'object') {
    const value = result as Record<string, unknown>
    if ('matched' in value || 'added' in value || 'duplicates' in value) {
      const matched = Number(value.matched ?? 0)
      const added = Number(value.added ?? 0)
      const duplicates = Number(value.duplicates ?? 0)
      const total = Number(value.total ?? 0)
      return `Matched ${matched} · added ${added} · duplicates ${duplicates}${total ? ` · total ${total}` : ''}`
    }
    if ('ok' in value && 'channel' in value) {
      return `Posted to ${String(value.channel ?? 'Slack')}`
    }
    if ('payment' in value && value.payment && typeof value.payment === 'object') {
      const payment = value.payment as Record<string, unknown>
      const id = typeof payment.paymentIntentId === 'string' ? formatPaymentId(payment.paymentIntentId) : ''
      const status = typeof payment.status === 'string' ? payment.status : 'complete'
      return id ? `Payment ${status} · ${id}` : `Payment ${status}`
    }
    if ('count' in value && 'invoices' in value) {
      return `Loaded ${Number(value.count)} invoice(s)`
    }
  }

  try {
    const text = JSON.stringify(result)
    return text.length > 96 ? `${text.slice(0, 96)}…` : text
  } catch {
    return String(result)
  }
}

function formatHistoryDetail(detail: string) {
  const trimmed = detail.trim()
  if (!trimmed) return '—'
  if (trimmed === 'Running' || trimmed.startsWith('Loaded ') || trimmed.startsWith('Connected ')) return trimmed
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return summarize(JSON.parse(trimmed))
    } catch {
      return trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed
    }
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed
}

function formatProvider(provider?: string) {
  if (!provider) return ''
  if (provider === 'stripe_mock' || provider.toLowerCase().includes('stripe')) return 'Stripe'
  return provider
}

function formatInvoiceDate(value?: string) {
  if (!value?.trim()) return '—'
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  const mdy = value.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  return value.trim()
}

function formatPaymentId(value?: string) {
  if (!value) return ''
  return value.replace(/^pi_mock_/i, 'pi_')
}

function formatAmount(amount: number, currency: string) {
  if (!amount || amount <= 0) return '—'
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount} ${code}`
  }
}

function displayInvoiceId(id?: string) {
  const value = id?.trim() ?? ''
  if (!value) return 'Unknown invoice'
  // Legacy extraction artifact: INV + "oice" from the word "Invoice"
  if (/^oice$/i.test(value)) return 'Unparsed invoice'
  if (/^invoice$/i.test(value)) return 'Unparsed invoice'
  if (/^email-/i.test(value)) return `Email ${value.slice(6, 14)}…`
  if (/^[0-9a-f]{16,}$/i.test(value)) return `Email ${value.slice(0, 8)}…`
  return value
}

function displayVendor(vendor?: string) {
  const value = vendor?.trim() ?? ''
  if (!value) return 'Unknown vendor'
  if (/^(slack|gmail|google|noreply|no-reply|notifications?)\b/i.test(value)) return 'Unknown vendor'
  return value
}

function invoiceQuality(row: AgentInvoice) {
  let score = 0
  if (row.amount > 0) score += 4
  if (/\d/.test(row.invoiceId) && !/^oice$/i.test(row.invoiceId)) score += 3
  if (displayVendor(row.vendor) !== 'Unknown vendor') score += 2
  if (row.status === 'duplicate') score -= 2
  if (/^oice$/i.test(row.invoiceId)) score -= 5
  return score
}


function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, 100) : []
  } catch {
    return []
  }
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`invoice-badge status-${status}`}>{status}</span>
}

export type InvoiceWorkspaceState = {
  status: AgentStatus | null
  invoices: AgentInvoice[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  error: string | null
  pending: boolean
  lastRefreshAt: string | null
  autoRefresh: boolean
  setAutoRefresh: (value: boolean) => void
  history: HistoryEntry[]
  counts: Record<StatusFilter, number>
  filtered: AgentInvoice[]
  selected: AgentInvoice | null
  refresh: (silent?: boolean) => void
  run: (kind: HistoryKind, action: string, fn: () => Promise<unknown>) => void
  clearHistory: () => void
  agentUrl: string
}

export function useInvoiceWorkspace(): InvoiceWorkspaceState {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [invoices, setInvoices] = useState<AgentInvoice[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)))
  }, [history])

  const pushHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: string }) => {
    const full: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: entry.at ?? nowIso(),
      kind: entry.kind,
      action: entry.action,
      detail: entry.detail,
      ok: entry.ok,
    }
    setHistory((prev) => [full, ...prev].slice(0, 100))
  }, [])

  const refresh = useCallback((silent = false) => {
    startTransition(async () => {
      try {
        setError(null)
        const nextStatus = await fetchStatus()
        setStatus(nextStatus)

        if (!nextStatus.gmail || !nextStatus.sheets) {
          setInvoices([])
          setLastRefreshAt(nowIso())
          if (!silent) {
            pushHistory({
              kind: 'refresh',
              action: 'Refresh',
              detail: `Gmail ${nextStatus.gmail ? 'connected' : 'not connected'} · Sheets ${nextStatus.sheets ? 'ok' : 'missing'} · Slack ${nextStatus.slack ? 'ok' : 'missing'}`,
              ok: true,
            })
          }
          return
        }

        const inv = await fetchInvoices()
        setInvoices(inv.invoices)
        setLastRefreshAt(nowIso())
        setSelectedId((current) => current ?? inv.invoices[0]?.invoiceId ?? null)
        if (!silent) {
          pushHistory({
            kind: 'refresh',
            action: 'Refresh',
            detail: `Loaded ${inv.count} invoice(s) · Sheets ${nextStatus.sheets ? 'ok' : 'missing'} · Slack ${nextStatus.slack ? 'ok' : 'missing'}`,
            ok: true,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load'
        setError(message)
        pushHistory({ kind: 'error', action: 'Refresh failed', detail: message, ok: false })
      }
    })
  }, [pushHistory])

  useEffect(() => {
    refresh(true)
    pushHistory({
      kind: 'info',
      action: 'Console opened',
      detail: `Connected UI → ${getAgentBaseUrl()}`,
      ok: true,
    })
  }, [pushHistory, refresh])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const gmail = params.get('gmail')
    if (!gmail) return

    const handledKey = `ledgerman-gmail-${gmail}-${params.get('email') ?? ''}-${params.get('message') ?? ''}`
    if (sessionStorage.getItem(handledKey) === '1') {
      params.delete('gmail')
      params.delete('email')
      params.delete('message')
      const cleaned = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', cleaned)
      return
    }
    sessionStorage.setItem(handledKey, '1')

    const email = params.get('email')
    const message = params.get('message')

    if (gmail === 'connected') {
      pushHistory({
        kind: 'info',
        action: 'Gmail connected',
        detail: email ? `Authorized as ${email}` : 'Google account linked',
        ok: true,
      })
      refresh(true)
      startTransition(async () => {
        try {
          setError(null)
          const result = await trackInvoices()
          pushHistory({
            kind: 'track',
            action: 'Track Gmail → Sheets ✓',
            detail: summarize(result),
            ok: true,
          })
          const [inv, nextStatus] = await Promise.all([fetchInvoices(), fetchStatus()])
          setInvoices(inv.invoices)
          setStatus(nextStatus)
          setLastRefreshAt(nowIso())
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'Track failed after connect'
          setError(detail)
          pushHistory({ kind: 'error', action: 'Track after connect failed', detail, ok: false })
        }
      })
    } else if (gmail === 'error') {
      const detail = message || 'Gmail connection failed'
      setError(detail)
      pushHistory({ kind: 'error', action: 'Gmail connect failed', detail, ok: false })
    }

    params.delete('gmail')
    params.delete('email')
    params.delete('message')
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', next)
  }, [pushHistory, refresh])

  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(() => refresh(true), 12000)
    return () => window.clearInterval(id)
  }, [autoRefresh, refresh])

  const run = useCallback((kind: HistoryKind, action: string, fn: () => Promise<unknown>) => {
    startTransition(async () => {
      const started = nowIso()
      pushHistory({ kind, action: `${action}…`, detail: 'Running', ok: true, at: started })
      try {
        setError(null)
        const result = await fn()
        pushHistory({ kind, action: `${action} ✓`, detail: summarize(result), ok: true })
        const [inv, nextStatus] = await Promise.all([fetchInvoices(), fetchStatus()])
        setInvoices(inv.invoices)
        setStatus(nextStatus)
        setLastRefreshAt(nowIso())
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed'
        setError(message)
        pushHistory({ kind: 'error', action: `${action} failed`, detail: message, ok: false })
      }
    })
  }, [pushHistory])

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: invoices.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
      duplicate: 0,
    }
    for (const inv of invoices) {
      const key = inv.status as StatusFilter
      if (key in base && key !== 'all') base[key] += 1
    }
    return base
  }, [invoices])

  const filtered = useMemo(() => {
    if (filter === 'all') return invoices
    return invoices.filter((item) => item.status === filter)
  }, [filter, invoices])

  const selected = invoices.find((item) => item.invoiceId === selectedId) ?? null

  const clearHistory = useCallback(() => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }, [])

  return {
    status,
    invoices,
    selectedId,
    setSelectedId,
    filter,
    setFilter,
    error,
    pending,
    lastRefreshAt,
    autoRefresh,
    setAutoRefresh,
    history,
    counts,
    filtered,
    selected,
    refresh,
    run,
    clearHistory,
    agentUrl: getAgentBaseUrl(),
  }
}

function IntegrationPills({ status }: { status: AgentStatus | null }) {
  return (
    <div className="invoice-pills">
      {[
        ['Gmail', status?.gmail],
        ['Sheets', status?.sheets],
        ['Slack', status?.slack],
        ['Stripe', true],
      ].map(([label, ok]) => (
        <span className={`invoice-pill ${ok ? 'ok' : 'bad'}`} key={String(label)}>
          <Icon name={ok ? 'check' : 'shield'} size={13} />
          {label}
        </span>
      ))}
      {status?.gmailEmail ? <span className="invoice-pill muted">{status.gmailEmail}</span> : null}
      {status?.channel ? <span className="invoice-pill muted">Channel {status.channel}</span> : null}
    </div>
  )
}

function PipelineActions({
  workspace,
  compact = false,
}: {
  workspace: InvoiceWorkspaceState
  compact?: boolean
}) {
  const { pending, run, refresh, status } = workspace
  const gmailConnected = Boolean(status?.gmail)

  return (
    <div className={`invoice-actions ${compact ? 'compact' : ''}`}>
      {gmailConnected ? (
        <>
          <button
            className="primary-button"
            disabled={pending}
            onClick={() => run('track', 'Track Gmail → Sheets', () => trackInvoices())}
          >
            <Icon name="mail" size={15} /> Track Gmail
          </button>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() =>
              run('info', 'Disconnect Gmail', async () => {
                await disconnectGmail()
                return { ok: true, gmail: false }
              })
            }
          >
            Disconnect
          </button>
        </>
      ) : (
        <a className="primary-button invoice-auth-link" href={getGmailConnectUrl('/demo')}>
          <Icon name="lock" size={15} /> Connect Gmail
        </a>
      )}
      <button className="secondary-button" disabled={pending} onClick={() => refresh(false)}>
        <Icon name="refresh" size={15} /> Refresh
      </button>
    </div>
  )
}

export function InvoiceOverviewSection({
  workspace,
  onOpenInvoices,
  onOpenPipeline,
}: {
  workspace: InvoiceWorkspaceState
  onOpenInvoices: () => void
  onOpenPipeline: () => void
}) {
  const { counts, error, lastRefreshAt, status, invoices, setSelectedId, pending } = workspace

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => invoiceQuality(b) - invoiceQuality(a))
        .slice(0, 6),
    [invoices],
  )

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> LEDGERMAN / OVERVIEW</div>
          <h1>Zoth invoice control plane</h1>
          <p>
            {status?.gmail
              ? <>Gmail connected{status.gmailEmail ? <> as <strong>{status.gmailEmail}</strong></> : null}. Track emails into Sheets, then approve in Slack.</>
              : <>Connect Gmail to authorize inbox access, then Track to fetch invoice emails into Sheets.</>}
            {lastRefreshAt ? <> · Last refresh <strong>{formatRelative(lastRefreshAt)}</strong></> : null}
          </p>
        </div>
        <div className="heading-actions">
          <button className="primary-button" disabled={pending} onClick={onOpenInvoices}>
            <Icon name="box" size={15} /> Open invoices
          </button>
        </div>
      </section>

      <section className="metric-grid" aria-label="Invoice metrics">
        {([
          ['pending', counts.pending, 'Awaiting review'],
          ['approved', counts.approved, 'Human approved'],
          ['paid', counts.paid, 'Stripe payment complete'],
          ['rejected', counts.rejected, 'Blocked or declined'],
        ] as const).map(([key, value, foot]) => (
          <button
            key={key}
            type="button"
            className={`metric-card invoice-metric ${workspace.filter === key ? 'metric-highlight' : ''}`}
            onClick={() => {
              workspace.setFilter(key)
              onOpenInvoices()
            }}
          >
            <div className="metric-top"><span>{key}</span><Icon name={key === 'paid' ? 'wallet' : key === 'rejected' ? 'shield' : 'box'} size={18} /></div>
            <div className="metric-value">{value}</div>
            <div className="metric-foot">{foot}</div>
          </button>
        ))}
      </section>

      <IntegrationPills status={status} />
      <PipelineActions workspace={workspace} />
      {error ? <div className="invoice-error">{error}</div> : null}

      <section className="bottom-grid invoice-overview-grid">
        <div className="panel activity-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">RECENT INVOICES</div>
              <h2>Tracked rows</h2>
            </div>
            <button className="text-button" onClick={onOpenInvoices}>View all <Icon name="arrow" size={14} /></button>
          </div>
          <div className="activity-table invoice-recent-table">
            <div className="table-head"><span>Invoice</span><span>Amount</span><span>Status</span></div>
            {recentInvoices.map((row) => (
              <button
                type="button"
                className={`table-row invoice-table-row ${row.status === 'duplicate' ? 'is-duplicate' : ''}`}
                key={row.invoiceId}
                onClick={() => {
                  setSelectedId(row.invoiceId)
                  onOpenInvoices()
                }}
              >
                <div className="invoice-recent-main">
                  <strong title={row.invoiceId}>{displayInvoiceId(row.invoiceId)}</strong>
                  <small>{displayVendor(row.vendor)} · {formatInvoiceDate(row.invoiceDate)}</small>
                </div>
                <span className="invoice-recent-amount">{formatAmount(row.amount, row.currency)}</span>
                <StatusBadge status={row.status} />
              </button>
            ))}
            {recentInvoices.length === 0 ? (
              <div className="invoice-empty">
                {status?.gmail
                  ? 'No invoices yet. Track Gmail to pull invoice emails into Sheets.'
                  : 'Connect Gmail first, then Track to fetch invoice emails into Sheets.'}
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel action-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">PIPELINE FLOW</div>
              <h2>End-to-end path</h2>
            </div>
            <span className="live-pill"><span className="status-dot" /> agent</span>
          </div>
          <div className="invoice-flow">
            {[
              ['01', 'Gmail', 'Match invoice emails'],
              ['02', 'Extract', 'Vendor, amount, dates'],
              ['03', 'Sheets', 'System of record'],
              ['04', 'Slack', 'Approve / reject'],
              ['05', 'Pay', 'Stripe PaymentIntent'],
            ].map(([n, title, copy]) => (
              <div className="invoice-flow-step" key={n}>
                <span>{n}</span>
                <strong>{title}</strong>
                <small>{copy}</small>
              </div>
            ))}
          </div>
          <p className="panel-description">Ledgerman gates payment authority. This console drives Zoth’s multi-app invoice path.</p>
          <button className="primary-button" onClick={onOpenPipeline}><Icon name="activity" size={15} /> Open activity log</button>
        </div>
      </section>
    </>
  )
}

export function InvoiceListView({ workspace }: { workspace: InvoiceWorkspaceState }) {
  const {
    filtered,
    counts,
    filter,
    setFilter,
    selectedId,
    setSelectedId,
    selected,
    pending,
    run,
    error,
    autoRefresh,
    setAutoRefresh,
  } = workspace

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId(null)
      return
    }
    if (!filtered.some((item) => item.invoiceId === selectedId)) {
      setSelectedId(filtered[0].invoiceId)
    }
  }, [filtered, selectedId, setSelectedId])

  return (
    <div className="detail-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> LEDGERMAN / INVOICES</div>
          <h1>Invoice ledger</h1>
          <p>Rows from Google Sheets with Slack approval and Stripe payment controls.</p>
        </div>
        <label className="invoice-auto">
          <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
          Auto-refresh
        </label>
      </div>

      <PipelineActions workspace={workspace} compact />
      {error ? <div className="invoice-error">{error}</div> : null}

      <div className="invoice-split">
        <div className="panel full-table">
          <div className="panel-header invoice-list-header">
            <div>
              <div className="panel-kicker">TRACKED ROWS</div>
              <h2>{filtered.length} invoices</h2>
            </div>
            <div className="invoice-filters">
              {(['all', 'pending', 'approved', 'paid', 'rejected', 'duplicate'] as const).map((key) => (
                <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                  {key} ({counts[key]})
                </button>
              ))}
            </div>
          </div>
          <div className="invoice-list">
            {filtered.length === 0 ? (
              <div className="invoice-empty">No invoices in this filter. Track Gmail or refresh.</div>
            ) : filtered.map((inv) => (
              <div
                className={`invoice-list-row ${selectedId === inv.invoiceId ? 'selected' : ''}`}
                key={inv.invoiceId}
                onClick={() => setSelectedId(inv.invoiceId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelectedId(inv.invoiceId)
                }}
                role="button"
                tabIndex={0}
              >
                <div className="invoice-list-main">
                  <strong title={inv.invoiceId}>{displayInvoiceId(inv.invoiceId)}</strong>
                  <small>{displayVendor(inv.vendor)} · {formatInvoiceDate(inv.invoiceDate)}</small>
                </div>
                <span className="invoice-list-amount">{formatAmount(inv.amount, inv.currency)}</span>
                <StatusBadge status={inv.status} />
                <span className="invoice-row-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="secondary-button" disabled={pending} onClick={() => run('approval', `Slack ${inv.invoiceId}`, () => sendApproval(inv.invoiceId))}>Slack</button>
                  <button type="button" className="secondary-button" disabled={pending} onClick={() => run('payment', `Pay ${inv.invoiceId}`, () => payInvoice(inv.invoiceId))}>Pay</button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel invoice-detail">
          <div className="panel-kicker">SELECTED DETAIL</div>
          {selected ? (
            <>
              <h2 title={selected.invoiceId}>{displayInvoiceId(selected.invoiceId)}</h2>
              <dl className="invoice-dl">
                <div><dt>Vendor</dt><dd>{displayVendor(selected.vendor)}</dd></div>
                <div><dt>Amount</dt><dd>{formatAmount(selected.amount, selected.currency)}</dd></div>
                <div><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div>
                <div><dt>Invoice date</dt><dd>{formatInvoiceDate(selected.invoiceDate)}</dd></div>
                <div><dt>Due date</dt><dd>{formatInvoiceDate(selected.dueDate)}</dd></div>
                <div><dt>Approved by</dt><dd>{selected.approvedBy || '—'}</dd></div>
                <div><dt>Payment ID</dt><dd><code>{formatPaymentId(selected.paymentId) || '—'}</code></dd></div>
                <div><dt>Paid at</dt><dd>{selected.paidAt ? formatTime(selected.paidAt) : '—'}</dd></div>
                <div><dt>Provider</dt><dd>{formatProvider(selected.paymentProvider) || '—'}</dd></div>
              </dl>
              <div className="invoice-detail-actions">
                <button className="primary-button" disabled={pending} onClick={() => run('approval', `Slack ${selected.invoiceId}`, () => sendApproval(selected.invoiceId))}>
                  <Icon name="send" size={15} /> Send to Slack
                </button>
                <button className="secondary-button" disabled={pending} onClick={() => run('payment', `Pay ${selected.invoiceId}`, () => payInvoice(selected.invoiceId))}>
                  <Icon name="wallet" size={15} /> Pay invoice
                </button>
              </div>
            </>
          ) : (
            <p className="panel-description">Select a row to inspect invoice and payment fields.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

export function InvoicePipelineView({ workspace }: { workspace: InvoiceWorkspaceState }) {
  const { history, clearHistory, pending, error, agentUrl } = workspace

  return (
    <div className="detail-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> LEDGERMAN / PIPELINE</div>
          <h1>Activity history</h1>
          <p>Timestamped console actions against <code>{agentUrl}</code>.</p>
        </div>
        <button className="secondary-button" onClick={clearHistory}><Icon name="box" size={15} /> Clear history</button>
      </div>

      <PipelineActions workspace={workspace} />
      {error ? <div className="invoice-error">{error}</div> : null}

      <div className="panel full-table">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">EVENT LOG</div>
            <h2>{history.length} events</h2>
          </div>
          <span className="live-pill"><span className="status-dot" /> {pending ? 'working' : 'idle'}</span>
        </div>
        <div className="event-log">
          <div className="event-log-head">
            <span>When</span>
            <span>Action</span>
            <span>Detail</span>
            <span>Result</span>
          </div>
          {history.length === 0 ? (
            <div className="invoice-empty">No activity yet. Track Gmail or refresh to start logging events.</div>
          ) : history.map((entry) => (
            <div className={`event-log-row ${entry.ok ? '' : 'error'}`} key={entry.id}>
              <span className="event-log-when" title={formatTime(entry.at)}>{formatRelative(entry.at)}</span>
              <div className="event-log-action">
                <strong>{entry.action.replace(/…$/, '').replace(/ ✓$/, '')}</strong>
                <small>{entry.kind}</small>
              </div>
              <span className="event-log-detail" title={entry.detail}>{formatHistoryDetail(entry.detail)}</span>
              <b className={entry.ok ? 'allowed' : 'blocked'}><span />{entry.ok ? 'ok' : 'error'}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
