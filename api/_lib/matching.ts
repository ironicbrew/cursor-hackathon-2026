import type { SupabaseClient } from '@supabase/supabase-js'

export interface PromptResponses {
  currentFocus: string
  lookingFor: string
  canOffer: string
  location: string
}

export interface MatchProfile {
  id: string
  display_name: string | null
  prompt_responses: PromptResponses | null
}

export interface MatchRationale {
  why: string
  suggested_message: string
  common_ground: string[]
  conversation_starters: string[]
  networking_tips: string[]
}

export async function fetchAllOtherProfiles(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ profiles: MatchProfile[]; error: unknown | null }> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, prompt_responses')
    .neq('id', userId)
    .order('created_at', { ascending: false })

  return { profiles: (data as MatchProfile[] | null) ?? [], error }
}

function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || 'there'
}

function addUniqueStarters(starters: string[], ...candidates: (string | undefined)[]) {
  for (const candidate of candidates) {
    const text = candidate?.trim()
    if (text && !starters.includes(text)) starters.push(text)
  }
}

function buildConversationStarters(
  viewer: MatchProfile,
  matched: MatchProfile,
  suggested_message: string
): string[] {
  const name = firstName(matched.display_name)
  const responses = matched.prompt_responses
  const focus = responses?.currentFocus?.trim()
  const lookingFor = responses?.lookingFor?.trim()
  const canOffer = responses?.canOffer?.trim()
  const location = responses?.location?.trim()
  const viewerFocus = viewer.prompt_responses?.currentFocus?.trim()
  const viewerOffer = viewer.prompt_responses?.canOffer?.trim()

  const starters: string[] = []
  addUniqueStarters(starters, suggested_message)

  if (focus) {
    addUniqueStarters(
      starters,
      `What's been the most interesting part of ${focus} for you lately?`,
      `I'd love to hear what you're figuring out with ${focus} right now.`
    )
  }
  if (lookingFor) {
    addUniqueStarters(
      starters,
      `What kind of people would be most helpful for you around ${lookingFor}?`
    )
  }
  if (canOffer) {
    addUniqueStarters(
      starters,
      `Your background in ${canOffer} sounds really useful — would love to learn more.`
    )
  }
  if (location) {
    addUniqueStarters(
      starters,
      `Are you connecting with people in ${location} locally or mostly online?`
    )
  }
  if (viewerFocus) {
    addUniqueStarters(
      starters,
      `I'm working on ${viewerFocus} — curious if that overlaps with anything you're exploring.`
    )
  }
  if (viewerOffer) {
    addUniqueStarters(
      starters,
      `Happy to share what I know about ${viewerOffer} if it might be useful for you.`
    )
  }

  addUniqueStarters(
    starters,
    `What's on your mind professionally these days, ${name}?`,
    `Would you be up for a quick intro chat sometime this week, ${name}?`,
    `Hi ${name}! I'd love to connect and hear what brought you here.`
  )

  while (starters.length < 3) {
    addUniqueStarters(starters, suggested_message, `Hey ${name}! Would love to connect.`)
  }

  return starters
}

function ensureMinConversationStarters(
  starters: string[] | undefined,
  suggestedMessage: string,
  fallbackStarters: string[]
): string[] {
  const merged: string[] = []
  addUniqueStarters(merged, suggestedMessage)
  for (const starter of starters ?? []) addUniqueStarters(merged, starter)
  for (const starter of fallbackStarters) {
    addUniqueStarters(merged, starter)
    if (merged.length >= 3) break
  }
  while (merged.length < 3 && fallbackStarters.length > 0) {
    addUniqueStarters(merged, fallbackStarters[merged.length % fallbackStarters.length])
  }
  return merged
}

export function buildTemplateRationale(viewer: MatchProfile, matched: MatchProfile): MatchRationale {
  const name = firstName(matched.display_name)
  const responses = matched.prompt_responses
  const focus = responses?.currentFocus?.trim()
  const lookingFor = responses?.lookingFor?.trim()
  const canOffer = responses?.canOffer?.trim()
  const location = responses?.location?.trim()
  const viewerLocation = viewer.prompt_responses?.location?.trim()

  let suggested_message = `Hi ${name}! I'd love to connect and learn more about what you're working on.`
  let why = `${name} is in your network — worth reaching out and introducing yourself.`

  if (focus) {
    suggested_message = `Hi ${name}! I saw you're working on ${focus} — would love to hear what you're figuring out right now.`
    why = `${name} is focused on ${focus}, which could be a great conversation.`
  } else if (canOffer) {
    suggested_message = `Hi ${name}! I noticed you can offer help with ${canOffer} — that's really interesting to me.`
    why = `${name} brings ${canOffer} to the network.`
  } else if (lookingFor) {
    suggested_message = `Hi ${name}! I saw you're looking to connect with people around ${lookingFor}. Happy to compare notes.`
    why = `${name} is looking for ${lookingFor} — you might be able to help.`
  } else if (location) {
    suggested_message = `Hi ${name}! Looks like you're in ${location} — would be great to connect locally.`
    why = `${name} is in the ${location} area.`
  }

  const common_ground: string[] = []
  if (location && viewerLocation && location.toLowerCase() === viewerLocation.toLowerCase()) {
    common_ground.push(`Both in ${location}`)
  }

  return {
    why,
    suggested_message,
    common_ground,
    conversation_starters: buildConversationStarters(viewer, matched, suggested_message),
    networking_tips: ['Lead with curiosity about what they shared in their profile.'],
  }
}

export async function generateMatchRationale(
  viewer: MatchProfile,
  matched: MatchProfile
): Promise<MatchRationale> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return buildTemplateRationale(viewer, matched)
  }

  const prompt = `You are a professional networking assistant. Person A may want to reach out to Person B.

Person A (the sender):
${JSON.stringify({ name: viewer.display_name, ...viewer.prompt_responses }, null, 2)}

Person B (the person they want to connect with):
${JSON.stringify({ name: matched.display_name, ...matched.prompt_responses }, null, 2)}

Write a personalized outreach message from Person A to Person B that references something specific about Person B (their focus, location, what they offer, or what they're looking for).

Respond in JSON:
{
  "why": "One sentence on why Person A should connect with Person B",
  "suggested_message": "A ready-to-send first message from Person A to Person B (1-2 sentences, warm and specific)",
  "common_ground": ["shared angle 1"],
  "conversation_starters": ["opener 1", "opener 2", "opener 3"],
  "networking_tips": ["one practical tip"]
}`

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    })

    const aiResult = await aiResponse.json()
    if (!aiResponse.ok) {
      console.error('OpenAI rationale error:', aiResult)
      return buildTemplateRationale(viewer, matched)
    }

    const parsed = JSON.parse(aiResult.choices?.[0]?.message?.content || '{}') as Partial<MatchRationale>
    const template = buildTemplateRationale(viewer, matched)
    const suggested_message = parsed.suggested_message || template.suggested_message

    return {
      why: parsed.why || template.why,
      suggested_message,
      common_ground: parsed.common_ground?.length ? parsed.common_ground : template.common_ground,
      conversation_starters: ensureMinConversationStarters(
        parsed.conversation_starters,
        suggested_message,
        template.conversation_starters
      ),
      networking_tips: parsed.networking_tips?.length ? parsed.networking_tips : template.networking_tips,
    }
  } catch (error) {
    console.error('generateMatchRationale failed:', error)
    return buildTemplateRationale(viewer, matched)
  }
}

export async function createMatchPairIfNew(
  supabaseAdmin: SupabaseClient,
  userId: string,
  otherUserId: string,
  userProfile: MatchProfile,
  otherProfile: MatchProfile
): Promise<{ created: boolean; error?: unknown }> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('match_suggestions')
    .select('id')
    .eq('recipient_id', userId)
    .eq('matched_user_id', otherUserId)
    .maybeSingle()

  if (existingError) return { created: false, error: existingError }
  if (existing) return { created: false }

  const rationaleForUser = await generateMatchRationale(userProfile, otherProfile)
  const rationaleForOther = await generateMatchRationale(otherProfile, userProfile)

  const { error: insertError } = await supabaseAdmin.from('match_suggestions').insert([
    {
      recipient_id: userId,
      matched_user_id: otherUserId,
      rationale: rationaleForUser,
      status: 'new',
    },
    {
      recipient_id: otherUserId,
      matched_user_id: userId,
      rationale: rationaleForOther,
      status: 'new',
    },
  ])

  if (insertError) return { created: false, error: insertError }
  return { created: true }
}
