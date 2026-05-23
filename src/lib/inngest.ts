import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'networth-ai' })

export const EVENTS = {
  USER_PROFILE_INGESTED: 'user/profile.ingested',
  USER_INTENT_UPDATED: 'user/intent.updated',
  MATCHING_RUN: 'matching/run',
} as const
