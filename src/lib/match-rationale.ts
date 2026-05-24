import type { MatchRationale, Profile, PromptResponses } from '@/types/database'

function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || 'there'
}

function hasPromptData(responses: PromptResponses | null | undefined): boolean {
  if (!responses) return false
  return Boolean(
    responses.currentFocus?.trim() ||
      responses.lookingFor?.trim() ||
      responses.canOffer?.trim() ||
      responses.location?.trim()
  )
}

function addUniqueStarters(starters: string[], ...candidates: (string | undefined)[]) {
  for (const candidate of candidates) {
    const text = candidate?.trim()
    if (text && !starters.includes(text)) starters.push(text)
  }
}

function addUniqueTips(tips: string[], ...candidates: (string | undefined)[]) {
  for (const candidate of candidates) {
    const text = candidate?.trim()
    if (text && !tips.includes(text)) tips.push(text)
  }
}

const MIN_NETWORKING_TIPS = 3
const MAX_NETWORKING_TIPS = 5

function buildConversationStarters(
  viewer: Profile,
  matched: Profile,
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

function buildNetworkingTips(viewer: Profile, matched: Profile): string[] {
  const name = firstName(matched.display_name)
  const responses = matched.prompt_responses
  const focus = responses?.currentFocus?.trim()
  const lookingFor = responses?.lookingFor?.trim()
  const canOffer = responses?.canOffer?.trim()
  const location = responses?.location?.trim()
  const viewerFocus = viewer.prompt_responses?.currentFocus?.trim()
  const viewerLookingFor = viewer.prompt_responses?.lookingFor?.trim()
  const viewerLocation = viewer.prompt_responses?.location?.trim()

  const tips: string[] = []

  if (hasPromptData(matched.prompt_responses)) {
    addUniqueTips(
      tips,
      'Lead with curiosity about something specific from their profile rather than a generic pitch.',
      `Reference ${name}'s focus or goals early — it shows you read their profile.`
    )
  } else {
    addUniqueTips(
      tips,
      'Ask what they are working on — they may still be setting up their profile.',
      'Keep your first message short and open-ended to make replying easy.'
    )
  }

  if (focus) {
    addUniqueTips(
      tips,
      `Ask an open-ended question about ${focus} instead of jumping straight to your ask.`,
      `Share one relevant insight from your experience with ${focus} to give them a reason to reply.`
    )
  }

  if (lookingFor) {
    addUniqueTips(
      tips,
      `If you can help with ${lookingFor}, mention it briefly — but lead with genuine interest first.`,
      `Ask what a good outcome would look like for them around ${lookingFor}.`
    )
  }

  if (canOffer) {
    addUniqueTips(
      tips,
      `Acknowledge their expertise in ${canOffer} before asking for anything.`,
      'Offer to share your perspective first — reciprocity makes cold outreach warmer.'
    )
  }

  if (location && viewerLocation && location.toLowerCase() === viewerLocation.toLowerCase()) {
    addUniqueTips(
      tips,
      `You're both in ${location} — suggest a low-commitment coffee or walk if it feels natural.`
    )
  } else if (location) {
    addUniqueTips(
      tips,
      `They're in ${location}; a quick video call may work better than assuming local meetups.`
    )
  }

  if (viewerFocus || viewerLookingFor) {
    addUniqueTips(
      tips,
      viewerFocus
        ? `Be upfront that you're exploring ${viewerFocus} — clarity helps them decide whether to respond.`
        : 'Be clear about why you reached out and what kind of conversation you are hoping for.'
    )
  }

  addUniqueTips(
    tips,
    'Keep your first message under 3–4 sentences — long cold messages rarely get replies.',
    `Use ${name}'s first name and one specific detail to avoid sounding like mass outreach.`,
    'Propose a concrete next step (15-minute call, async intro) instead of leaving things open-ended.',
    'Follow up once after a week if you do not hear back — one polite nudge is fine.',
    "Connect on LinkedIn after a good conversation to stay in each other's orbit."
  )

  while (tips.length < MIN_NETWORKING_TIPS) {
    addUniqueTips(
      tips,
      'Lead with curiosity and make it easy for them to say yes to a short intro.',
      'Personalize your opener — generic templates are easy to ignore.'
    )
  }

  return tips.slice(0, MAX_NETWORKING_TIPS)
}

export function ensureMinNetworkingTips(
  tips: string[] | undefined,
  viewer: Profile,
  matched: Profile
): string[] {
  const template = buildNetworkingTips(viewer, matched)
  const merged: string[] = []

  for (const tip of tips ?? []) addUniqueTips(merged, tip)
  for (const tip of template) {
    addUniqueTips(merged, tip)
    if (merged.length >= MAX_NETWORKING_TIPS) break
  }

  while (merged.length < MIN_NETWORKING_TIPS) {
    addUniqueTips(merged, template[merged.length % template.length])
  }

  return merged.slice(0, MAX_NETWORKING_TIPS)
}

export function ensureMinConversationStarters(
  starters: string[] | undefined,
  viewer: Profile,
  matched: Profile,
  suggestedMessage?: string
): string[] {
  const template = buildTemplateRationale(viewer, matched)
  const primary = suggestedMessage?.trim() || template.suggested_message
  const merged: string[] = []

  addUniqueStarters(merged, primary)
  for (const starter of starters ?? []) addUniqueStarters(merged, starter)
  for (const starter of template.conversation_starters) {
    addUniqueStarters(merged, starter)
    if (merged.length >= 3) break
  }

  while (merged.length < 3) {
    addUniqueStarters(merged, template.conversation_starters[merged.length % template.conversation_starters.length])
  }

  return merged
}

export function buildTemplateRationale(viewer: Profile, matched: Profile): MatchRationale {
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
  } else if (matched.display_name) {
    suggested_message = `Hi ${name}! I saw you joined the network — would love to connect.`
    why = `${matched.display_name} recently joined the network.`
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
    networking_tips: buildNetworkingTips(viewer, matched),
  }
}
