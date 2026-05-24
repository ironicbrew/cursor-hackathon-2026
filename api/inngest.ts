import { serve } from 'inngest/next'
import { ensureUserProfile, runMatching, type ProfileMeta } from './_lib/jobs'
import { getSupabaseAdmin } from './_lib/supabase-admin'
import { inngest } from './_lib/inngest-client'

// ===========================================
// FUNCTION 1: Process user profile after onboarding
// ===========================================
const profileIngested = inngest.createFunction(
  { id: 'profile-ingested', triggers: [{ event: 'user/profile.ingested' }] },
  async ({ event, step }) => {
    const { userId, promptResponses, profileMeta } = event.data as {
      userId: string
      promptResponses: {
        currentFocus: string
        lookingFor: string
        canOffer: string
        location: string
      }
      profileMeta?: ProfileMeta
    }

    console.log('Processing profile for user:', userId)
    const supabaseAdmin = getSupabaseAdmin()

    await step.run('ensure-profile', async () => {
      const result = await ensureUserProfile(userId, profileMeta)
      if (!result.success) {
        const failed = result.steps.find(s => !s.ok)
        throw new Error(failed?.error?.message || 'Failed to ensure profile row')
      }
    })

    await step.run('save-conversation-thread', async () => {
      const { error } = await supabaseAdmin.from('conversation_threads').insert({
        user_id: userId,
        thread_type: 'onboarding',
        messages: promptResponses,
      })

      if (error) {
        console.error('Error saving conversation thread:', error)
        throw error
      }
    })

    // Step 1: Save prompt responses to profile
    await step.run('save-prompt-responses', async () => {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          prompt_responses: promptResponses,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        console.error('Error saving prompt responses:', error)
        throw error
      }
      console.log('Prompt responses saved')
    })

    // Step 2: Generate embedding from prompt responses
    await step.run('generate-embedding', async () => {
      const textToEmbed = [
        promptResponses.currentFocus,
        `Looking for: ${promptResponses.lookingFor}`,
        `Can offer: ${promptResponses.canOffer}`,
        `Location: ${promptResponses.location}`,
      ].join(' | ')

      console.log('Generating embedding for:', textToEmbed)

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: textToEmbed,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('OpenAI error:', result)
        throw new Error(`OpenAI API error: ${result.error?.message || 'Unknown error'}`)
      }

      const embedding = result.data?.[0]?.embedding

      if (!embedding) {
        throw new Error('No embedding returned from OpenAI')
      }

      console.log('Embedding generated, length:', embedding.length)

      // Save embedding to profile
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ embedding })
        .eq('id', userId)

      if (error) {
        console.error('Error saving embedding:', error)
        throw error
      }

      console.log('Embedding saved to profile')
    })

    // Step 3: Trigger matching
    await step.sendEvent('trigger-matching', {
      name: 'matching/run',
      data: { triggeredBy: userId },
    })

    return { success: true, userId }
  }
)

// ===========================================
// FUNCTION 2: Run matching for a user
// ===========================================
const matchingRun = inngest.createFunction(
  { id: 'matching-run', triggers: [{ event: 'matching/run' }] },
  async ({ event, step }) => {
    const { triggeredBy } = event.data as { triggeredBy: string }
    console.log('Running matching for user:', triggeredBy)

    const result = await step.run('run-matching', () => runMatching(triggeredBy))

    if (!result.success) {
      const failed = result.steps.find(s => !s.ok)
      throw new Error(failed?.error?.message || result.summary)
    }

    const createStep = result.steps.find(s => s.step === 'create_match_suggestions')
    return {
      matchesCreated: createStep?.data?.matchesCreated ?? 0,
      totalProfiles: createStep?.data?.totalProfiles ?? 0,
    }
  }
)

export const maxDuration = 60

export default serve({
  client: inngest,
  functions: [profileIngested, matchingRun],
})
