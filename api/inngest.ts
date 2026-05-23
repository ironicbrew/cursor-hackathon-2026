import { serve } from 'inngest/next'
import { Inngest } from 'inngest'
import { createClient } from '@supabase/supabase-js'

const inngest = new Inngest({ id: 'networth-ai' })

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key)
}

// ===========================================
// FUNCTION 1: Process user profile after onboarding
// ===========================================
const profileIngested = inngest.createFunction(
  { id: 'profile-ingested', triggers: [{ event: 'user/profile.ingested' }] },
  async ({ event, step }) => {
    const { userId, promptResponses } = event.data as {
      userId: string
      promptResponses: {
        currentFocus: string
        lookingFor: string
        canOffer: string
        location: string
      }
    }

    console.log('Processing profile for user:', userId)
    const supabaseAdmin = getSupabaseAdmin()

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

    const supabaseAdmin = getSupabaseAdmin()

    // Step 1: Find similar profiles using the database function
    const similarProfiles = await step.run('find-similar-profiles', async () => {
      const { data, error } = await supabaseAdmin.rpc('find_similar_profiles', {
        target_user_id: triggeredBy,
        similarity_threshold: 0.3, // Lower threshold to get more matches
        max_results: 5,
      })

      if (error) {
        console.error('Error finding similar profiles:', error)
        // Fallback: get any other user
        const { data: fallbackUsers } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name')
          .neq('id', triggeredBy)
          .limit(3)

        return fallbackUsers?.map(u => ({ 
          user_id: u.id, 
          display_name: u.display_name, 
          similarity: 0.5 
        })) || []
      }

      console.log('Found similar profiles:', data?.length || 0)

      // If no similar profiles found, fallback to random users
      if (!data || data.length === 0) {
        console.log('No similar profiles, using fallback')
        const { data: fallbackUsers } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name')
          .neq('id', triggeredBy)
          .limit(3)

        return fallbackUsers?.map(u => ({ 
          user_id: u.id, 
          display_name: u.display_name, 
          similarity: 0.5 
        })) || []
      }

      return data
    })

    if (similarProfiles.length === 0) {
      console.log('No other users to match with')
      return { matchesFound: 0 }
    }

    // Step 2: Generate rationales and create match suggestions
    for (const match of similarProfiles) {
      await step.run(`create-match-${match.user_id}`, async () => {
        // Check if match already exists
        const { data: existing } = await supabaseAdmin
          .from('match_suggestions')
          .select('id')
          .eq('recipient_id', triggeredBy)
          .eq('matched_user_id', match.user_id)
          .single()

        if (existing) {
          console.log('Match already exists, skipping')
          return
        }

        // Get both profiles for rationale generation
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, prompt_responses')
          .in('id', [triggeredBy, match.user_id])

        if (!profiles || profiles.length < 2) {
          console.log('Could not fetch profiles for rationale')
          return
        }

        const userProfile = profiles.find(p => p.id === triggeredBy)
        const matchProfile = profiles.find(p => p.id === match.user_id)

        // Generate AI rationale
        const prompt = `You are a professional networking assistant. Based on these two professionals, explain why they should connect.

Person 1:
${JSON.stringify(userProfile?.prompt_responses || {}, null, 2)}

Person 2:
${JSON.stringify(matchProfile?.prompt_responses || {}, null, 2)}

Similarity score: ${(match.similarity * 100).toFixed(0)}%

Respond in JSON format:
{
  "why": "One sentence explaining why this is a valuable connection",
  "common_ground": ["shared interest 1", "shared interest 2"],
  "conversation_starters": ["opener 1", "opener 2"],
  "networking_tips": ["tip 1", "tip 2"]
}`

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }),
        })

        const aiResult = await aiResponse.json()
        let rationale = {}
        
        try {
          rationale = JSON.parse(aiResult.choices?.[0]?.message?.content || '{}')
        } catch {
          rationale = { why: 'Great potential connection!', common_ground: [], conversation_starters: [], networking_tips: [] }
        }

        // Insert match suggestions for both users
        const { error: insertError } = await supabaseAdmin
          .from('match_suggestions')
          .insert([
            {
              recipient_id: triggeredBy,
              matched_user_id: match.user_id,
              rationale,
              status: 'new',
            },
            {
              recipient_id: match.user_id,
              matched_user_id: triggeredBy,
              rationale,
              status: 'new',
            },
          ])

        if (insertError) {
          console.error('Error inserting match:', insertError)
        } else {
          console.log('Match created between', triggeredBy, 'and', match.user_id)
        }
      })
    }

    return { matchesFound: similarProfiles.length }
  }
)

export const maxDuration = 60

export default serve({
  client: inngest,
  functions: [profileIngested, matchingRun],
})
