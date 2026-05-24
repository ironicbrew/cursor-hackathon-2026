import type { VercelRequest, VercelResponse } from '@vercel/node'
import { toErrorResponse } from './_lib/errors'
import {
  getInngestDevHint,
  inngest,
  isInngestConnectionError,
  isInngestDevMode,
} from './_lib/inngest-client'
import { runDevEvent } from './_lib/jobs'
import type { PipelineResult } from './_lib/errors'

/** Login-time profile creation must complete before redirect — run inline, not via Inngest queue. */
const INLINE_EVENTS = new Set(['user/profile.ensure'])

function respondWithPipeline(
  res: VercelResponse,
  pipeline: PipelineResult,
  mode: 'inline' | 'inline-dev-fallback'
) {
  if (!pipeline.success) {
    const failedStep = pipeline.steps.find(s => !s.ok)
    return res.status(422).json({
      success: false,
      mode,
      summary: pipeline.summary,
      step: failedStep?.step,
      error: failedStep?.error?.message,
      supabase:
        failedStep?.error?.source === 'supabase'
          ? {
              code: failedStep.error.code,
              message: failedStep.error.message,
              details: failedStep.error.details,
              hint: failedStep.error.hint,
            }
          : undefined,
      diagnosis: failedStep?.error,
      steps: pipeline.steps,
    })
  }

  return res.status(200).json({
    success: true,
    mode,
    summary: pipeline.summary,
    userId: pipeline.userId,
    steps: pipeline.steps,
    ...(mode === 'inline-dev-fallback'
      ? { hint: 'Start Inngest dev (npm run dev:inngest) for the full Inngest UI at http://127.0.0.1:8288' }
      : {}),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { name, data } = req.body

    console.log('Sending Inngest event:', { name, data })

    if (!name) {
      return res.status(400).json({ success: false, error: 'Event name required' })
    }

    if (INLINE_EVENTS.has(name)) {
      const pipeline = await runDevEvent(name, data || {})
      return respondWithPipeline(res, pipeline, 'inline')
    }

    try {
      const result = await inngest.send({
        name,
        data: data || {},
      })

      console.log('Inngest send result:', result)

      return res.status(200).json({
        success: true,
        mode: 'inngest',
        summary: 'Event queued via Inngest — check the Inngest dev UI for step results',
        inngest: result,
        steps: [{ step: 'queue_event', ok: true, data: { event: name } }],
      })
    } catch (error) {
      if (!isInngestDevMode() || !isInngestConnectionError(error)) {
        throw error
      }

      console.warn(
        'Inngest dev server unavailable on 127.0.0.1:8288; running job inline.',
        getInngestDevHint()
      )

      const pipeline = await runDevEvent(name, data || {})
      return respondWithPipeline(res, pipeline, 'inline-dev-fallback')
    }
  } catch (error) {
    console.error('Error sending Inngest event:', error)
    const { status, body } = toErrorResponse(error, 'send_event')
    return res.status(status).json(body)
  }
}
