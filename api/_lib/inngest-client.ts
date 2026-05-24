import { Inngest } from 'inngest'

function isInngestDevMode(): boolean {
  const value = process.env.INNGEST_DEV
  return value === '1' || value === 'true'
}

const isDev = isInngestDevMode()

export { isInngestDevMode }

// Use 127.0.0.1 on Windows — localhost often resolves to ::1 and refuses connection
const devBaseUrl =
  process.env.INNGEST_BASE_URL ||
  (isDev ? 'http://127.0.0.1:8288' : undefined)

export const inngest = new Inngest({
  id: 'networth-ai',
  isDev,
  baseUrl: devBaseUrl,
  // Dummy key is fine locally — the dev server does not validate it
  eventKey: process.env.INNGEST_EVENT_KEY || (isDev ? 'local' : undefined),
})

export function getInngestDevHint(): string {
  return [
    'Start both dev servers: npm run dev:all',
    '  App (Vercel/Vite): http://127.0.0.1:3000',
    '  Inngest dev UI:    http://127.0.0.1:8288',
  ].join('\n')
}

export function isInngestConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const cause = error.cause as { code?: string } | undefined
  return cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')
}
