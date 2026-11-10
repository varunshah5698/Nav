import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_BODY = 400_000

const SYSTEM_PROMPT = `You are the AI Analyst embedded in ResearchGraph, a connected research workspace — a conversational assistant for the user's research, not a report generator.

Rules:
- Answer the question actually asked, in the user's own terms. Greetings, questions about what you can do, and general research questions get a natural, brief reply — do not redirect to the workspace unless it helps.
- When you draw on workspace items, ground every factual claim in the context and cite the bracketed tag of each item you rely on, e.g. [S1], [N2], [X1], [M1]. Always use plain square brackets for tags.
- Never invent metrics, papers, tags or sources. If the context lacks something, say so plainly and name what would be needed. Anything you bring from general knowledge must be marked as not coming from the workspace.
- Separate reported results (from ingested papers) from reproduced results (this workspace's runs).
- Carry the thread forward: refer to earlier turns when they matter, and never repeat a previous answer.
- Format for a chat bubble: markdown headings, **bold**, bullet lists and inline code only — no tables, images or nested lists. Prefer a direct answer first, then short bullets. Stay under ~250 words unless asked for a longer artefact.
- Flag data marked "demo" when you rely on it.
- You are advisory: never claim to have changed, run or saved anything.`

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Keeps GROQ_API_KEY on the dev server: the browser only ever talks to /api/analyst. */
function analystProxy(apiKey: string, model: string): Plugin {
  return {
    name: 'rg-analyst-proxy',
    configureServer(server) {
      server.middlewares.use('/api/analyst', async (req, res) => {
        const route = (req.url || '/').split('?')[0]

        if (route === '/status' || route === '/status/') {
          return json(res, 200, { configured: Boolean(apiKey), model })
        }
        if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for /api/analyst.' })
        if (!apiKey) {
          return json(res, 503, {
            error: 'No Groq key configured. Add GROQ_API_KEY to .env and restart the dev server.',
          })
        }

        let payload: { messages?: unknown; context?: unknown }
        try {
          payload = JSON.parse(await readBody(req))
        } catch {
          return json(res, 400, { error: 'Invalid JSON body.' })
        }

        const messages = (Array.isArray(payload.messages) ? payload.messages : [])
          .filter((m): m is { role: string; content: string } => {
            const msg = m as { role?: unknown; content?: unknown }
            return (
              typeof msg?.content === 'string' &&
              (msg.role === 'user' || msg.role === 'assistant')
            )
          })
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }))

        if (!messages.length) return json(res, 400, { error: 'No messages supplied.' })

        const context = typeof payload.context === 'string' ? payload.context.slice(0, 16_000) : ''
        const system = context
          ? `${SYSTEM_PROMPT}\n\n=== WORKSPACE CONTEXT ===\n${context}\n=== END CONTEXT ===`
          : SYSTEM_PROMPT

        const controller = new AbortController()
        res.on('close', () => {
          if (!res.writableEnded) controller.abort()
        })

        let upstream: Response
        try {
          upstream = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              stream: true,
              temperature: 0.4,
              max_tokens: 1200,
              messages: [{ role: 'system', content: system }, ...messages],
            }),
            signal: controller.signal,
          })
        } catch (err) {
          if (controller.signal.aborted) return res.end()
          return json(res, 502, { error: `Could not reach Groq: ${(err as Error).message}` })
        }

        if (!upstream.ok || !upstream.body) {
          const raw = await upstream.text().catch(() => '')
          let detail = raw
          try {
            detail = JSON.parse(raw)?.error?.message || raw
          } catch {
            /* keep raw text */
          }
          const status = upstream.status === 401 || upstream.status === 403 ? upstream.status : 502
          return json(res, status, { error: detail || `Groq returned ${upstream.status}.` })
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders?.()

        const reader = upstream.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        try {
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const data = trimmed.slice(5).trim()
              if (!data || data === '[DONE]') continue
              try {
                const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
                if (typeof delta === 'string' && delta) res.write(delta)
              } catch {
                /* partial frame — ignored */
              }
            }
          }
        } catch {
          if (!controller.signal.aborted) res.write('\n\n_The stream was interrupted._')
        } finally {
          res.end()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), analystProxy(env.GROQ_API_KEY || '', env.GROQ_MODEL || 'openai/gpt-oss-120b')],
  }
})
