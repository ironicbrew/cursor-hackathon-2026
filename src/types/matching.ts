import { z } from 'zod'

export const MatchRationaleSchema = z.object({
  why: z.string().describe('One sentence explaining why this is a good match'),
  common_ground: z.array(z.string()).describe('Shared interests, skills, or goals'),
  conversation_starters: z.array(z.string()).describe('Suggested opening lines'),
  networking_tips: z.array(z.string()).describe('Advice for making this connection valuable'),
})

export type MatchRationale = z.infer<typeof MatchRationaleSchema>

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const OnboardingIntentSchema = z.object({
  current_focus: z.string().optional(),
  looking_for: z.array(z.string()).optional(),
  can_offer: z.array(z.string()).optional(),
  location_preference: z.string().optional(),
})

export type OnboardingIntent = z.infer<typeof OnboardingIntentSchema>
