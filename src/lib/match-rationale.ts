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
    conversation_starters: [suggested_message],
    networking_tips: hasPromptData(matched.prompt_responses)
      ? ['Lead with curiosity about what they shared in their profile.']
      : ['Ask what they are working on — they may still be setting up their profile.'],
  }
}

export function localStatusKey(userId: string): string {
  return `networth_match_status_${userId}`
}

export function readLocalMatchStatus(userId: string): Record<string, 'accepted' | 'declined'> {
  try {
    return JSON.parse(localStorage.getItem(localStatusKey(userId)) ?? '{}')
  } catch {
    return {}
  }
}

export function writeLocalMatchStatus(
  userId: string,
  matchedUserId: string,
  status: 'accepted' | 'declined'
): void {
  const all = readLocalMatchStatus(userId)
  all[matchedUserId] = status
  localStorage.setItem(localStatusKey(userId), JSON.stringify(all))
}
