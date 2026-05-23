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

const profileIngested = inngest.createFunction(
  { id: 'profile-ingested', triggers: [{ event: 'user/profile.ingested' }] },
  async ({ event, step }) => {
    const { userId, linkedinData } = event.data as {
      userId: string
      linkedinData?: Record<string, unknown>
    }

    const supabaseAdmin = getSupabaseAdmin()

    await step.run('store-linkedin-snapshot', async () => {
      if (linkedinData) {
        await supabaseAdmin.from('linkedin_snapshots').upsert({
          user_id: userId,
          snapshot_json: linkedinData,
          api_version: 'v2',
        })
      }
    })

    await step.run('generate-embedding', async () => {
      console.log('Generating embedding for user:', userId)
      
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      console.log('Profile fetched:', profile?.display_name, 'error:', profileError)

      if (!profile) {
        console.log('No profile found, skipping embedding')
        return
      }

      const textToEmbed = [
        profile.display_name,
        profile.headline,
        profile.location,
      ]
        .filter(Boolean)
        .join(' ')

      console.log('Text to embed:', textToEmbed)

      if (!textToEmbed.trim()) {
        console.log('No text to embed, skipping')
        return
      }

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
      console.log('OpenAI embedding response status:', response.status)
      
      const embedding = result.data?.[0]?.embedding

      if (embedding) {
        console.log('Embedding generated, length:', embedding.length)
        const { error: upsertError } = await supabaseAdmin.rpc('upsert_user_embedding', {
          p_user_id: userId,
          p_embedding: embedding,
        })
        console.log('Embedding upsert error:', upsertError)
      } else {
        console.error('No embedding in response:', result)
      }
    })

    await step.run('update-ingestion-status', async () => {
      await supabaseAdmin
        .from('profiles')
        .update({ ingestion_status: 'complete' })
        .eq('id', userId)
    })

    // Trigger matching run after profile is ingested
    await step.sendEvent('trigger-matching', {
      name: 'matching/run',
      data: { triggeredBy: userId },
    })

    return { success: true }
  }
)

const intentUpdated = inngest.createFunction(
  { id: 'intent-updated', triggers: [{ event: 'user/intent.updated' }] },
  async ({ event, step }) => {
    const { userId, intent } = event.data as {
      userId: string
      intent: string
    }

    const supabaseAdmin = getSupabaseAdmin()

    await step.run('update-embedding-with-intent', async () => {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!profile) return

      const textToEmbed = [
        profile.display_name,
        profile.headline,
        profile.location,
        intent,
      ]
        .filter(Boolean)
        .join(' ')

      if (!textToEmbed.trim()) return

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

      const { data } = await response.json()
      const embedding = data?.[0]?.embedding

      if (embedding) {
        await supabaseAdmin.rpc('upsert_user_embedding', {
          p_user_id: userId,
          p_embedding: embedding,
        })
      }
    })

    // Trigger matching run after intent is updated
    await step.sendEvent('trigger-matching', {
      name: 'matching/run',
      data: { triggeredBy: userId },
    })

    return { success: true }
  }
)

const matchingRun = inngest.createFunction(
  { id: 'matching-run', triggers: [{ event: 'matching/run' }] },
  async ({ event, step }) => {
    const supabaseAdmin = getSupabaseAdmin()
    const triggeredByUserId = (event.data as { triggeredBy?: string })?.triggeredBy

    console.log('matchingRun started, triggeredBy:', triggeredByUserId)

    const matches = await step.run('find-matches', async () => {
      const { data: users, error: usersError } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, headline, location')
        .eq('ingestion_status', 'complete')

      console.log('Found users:', users?.length, 'error:', usersError)

      if (!users || users.length < 2) {
        console.log('Not enough users for matching')
        return []
      }

      const matchPairs: Array<{
        user1: string
        user2: string
        similarity: number
      }> = []

      // Find semantic matches (similarity > 0.7)
      for (let i = 0; i < users.length; i++) {
        for (let j = i + 1; j < users.length; j++) {
          const { data: similarity, error: simError } = await supabaseAdmin.rpc(
            'match_users_by_embedding',
            {
              user_id_1: users[i]!.id,
              user_id_2: users[j]!.id,
            }
          )

          console.log(`Similarity ${users[i]!.id} <-> ${users[j]!.id}: ${similarity}, error:`, simError)

          if (similarity && similarity > 0.7) {
            matchPairs.push({
              user1: users[i]!.id,
              user2: users[j]!.id,
              similarity,
            })
          }
        }
      }

      console.log('Semantic matches found:', matchPairs.length)

      // FALLBACK: If the triggering user has no matches, give them a random one
      if (triggeredByUserId) {
        const userHasMatch = matchPairs.some(
          m => m.user1 === triggeredByUserId || m.user2 === triggeredByUserId
        )

        console.log('User has semantic match:', userHasMatch)

        if (!userHasMatch) {
          // Find another user to match with (anyone except themselves)
          const otherUsers = users.filter(u => u.id !== triggeredByUserId)
          console.log('Other users available for fallback:', otherUsers.length)
          
          if (otherUsers.length > 0) {
            const randomUser = otherUsers[Math.floor(Math.random() * otherUsers.length)]!
            console.log('Creating fallback match with:', randomUser.id)
            matchPairs.push({
              user1: triggeredByUserId,
              user2: randomUser.id,
              similarity: 0.5, // Mark as random match
            })
          }
        }
      }

      console.log('Total matches to process:', matchPairs.length)
      return matchPairs
    })

    for (const match of matches) {
      await step.run(`generate-rationale-${match.user1}-${match.user2}`, async () => {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .in('id', [match.user1, match.user2])

        if (!profiles || profiles.length !== 2) return

        const [profile1, profile2] = profiles

        const isRandomMatch = match.similarity < 0.7
        const prompt = `You are a professional networking assistant. Based on these two professionals, explain why they should connect and provide conversation starters.

${isRandomMatch ? 'Note: This is an exploratory match to help expand their network beyond their immediate field. Focus on unexpected synergies and cross-industry value.' : 'These professionals have strong profile alignment.'}

Person 1:
- Name: ${profile1?.display_name}
- Title: ${profile1?.headline}
- Location: ${profile1?.location}

Person 2:
- Name: ${profile2?.display_name}
- Title: ${profile2?.headline}
- Location: ${profile2?.location}

Respond in JSON format:
{
  "why": "One sentence explaining why this is a valuable connection",
  "common_ground": ["shared interest 1", "shared interest 2"],
  "conversation_starters": ["opener 1", "opener 2"],
  "networking_tips": ["tip 1", "tip 2"]
}`

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

        const result = await response.json()
        const rationale = JSON.parse(result.choices?.[0]?.message?.content || '{}')

        const { data: existing } = await supabaseAdmin
          .from('match_suggestions')
          .select('id')
          .eq('recipient_id', match.user1)
          .eq('matched_user_id', match.user2)
          .single()

        if (!existing) {
          console.log('Inserting match suggestions for:', match.user1, '<->', match.user2)
          const { error: insertError } = await supabaseAdmin.from('match_suggestions').insert([
            {
              recipient_id: match.user1,
              matched_user_id: match.user2,
              rationale,
              status: 'new',
            },
            {
              recipient_id: match.user2,
              matched_user_id: match.user1,
              rationale,
              status: 'new',
            },
          ])
          
          if (insertError) {
            console.error('Error inserting match suggestions:', insertError)
          } else {
            console.log('Match suggestions inserted successfully')
          }
        } else {
          console.log('Match already exists, skipping')
        }
      })
    }

    console.log('matchingRun completed, matches processed:', matches.length)
    return { matchesFound: matches.length }
  }
)

export const maxDuration = 60

export default serve({
  client: inngest,
  functions: [profileIngested, intentUpdated, matchingRun],
})
