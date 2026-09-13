const AGENT_URL = (import.meta.env.VITE_AGENT_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export type AgentInvoice = {
  invoiceId: string
  vendor: string
  amount: number
  currency: string
  invoiceDate: string
  dueDate: string
  status: string
  duplicate: boolean
  approvedBy: string
  paymentId?: string
  paymentStatus?: string
  paidAt?: string
  paymentProvider?: string
}

export type AgentStatus = {
  ok: boolean
  gmail: boolean
  gmailEmail?: string | null
  sheets: boolean
  slack: boolean
  socketMode: boolean
  channel: string
  spreadsheetId: string | null
  authUrl?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  return data as T
}

export function getAgentBaseUrl() {
  return AGENT_URL
}

export function getGmailConnectUrl(next = '/demo') {
  const params = new URLSearchParams({ next })
  return `${AGENT_URL}/agent/auth/google?${params.toString()}`
}

export function fetchStatus() {
  return request<AgentStatus>('/agent/status')
}

export function fetchInvoices() {
  return request<{ count: number; invoices: AgentInvoice[] }>('/agent/invoices')
}

export function trackInvoices(body?: { query?: string; maxResults?: number }) {
  return request<{
    matched: number
    added: number
    duplicates: number
    total: number
    invoices: AgentInvoice[]
  }>('/agent/track', {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export function disconnectGmail() {
  return request<{ ok: boolean; gmail: boolean }>('/agent/auth/google/disconnect', {
    method: 'POST',
    body: '{}',
  })
}

export function sendApproval(invoiceId: string) {
  return request<{ ok: boolean; ts?: string; channel?: string }>('/agent/approval', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  })
}

export function pingSlack() {
  return request<{ ok: boolean; channel: string }>('/agent/ping-slack', {
    method: 'POST',
    body: '{}',
  })
}

export function payInvoice(invoiceId: string) {
  return request<{ payment: Record<string, unknown> }>('/agent/pay', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  })
}
