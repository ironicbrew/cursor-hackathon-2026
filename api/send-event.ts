import { Inngest } from 'inngest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const inngest = new Inngest({ 
  id: 'networth-ai',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { name, data } = req.body

    console.log('Sending Inngest event:', { name, data })

    if (!name) {
      return res.status(400).json({ error: 'Event name required' })
    }

    const result = await inngest.send({
      name,
      data: data || {},
    })

    console.log('Inngest send result:', result)

    return res.status(200).json({ success: true, result })
  } catch (error) {
    console.error('Error sending Inngest event:', error)
    return res.status(500).json({ error: 'Failed to send event', details: String(error) })
  }
}
