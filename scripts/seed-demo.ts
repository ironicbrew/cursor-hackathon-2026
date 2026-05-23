/**
 * Demo Seed Script
 * 
 * Creates fake users with pre-computed embeddings for demo/judging purposes.
 * Run with: npx tsx scripts/seed-demo.ts
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
 */

import { createClient } from '@supabase/supabase-js'

const DEMO_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alex.chen@demo.networth.ai',
    display_name: 'Alex Chen',
    headline: 'Founder & CEO at TechStartup | Ex-Google | Building the future of AI',
    location: 'Toronto, Canada',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'sarah.johnson@demo.networth.ai',
    display_name: 'Sarah Johnson',
    headline: 'Senior Product Manager | Fintech | Looking for co-founders',
    location: 'Vancouver, Canada',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'marcus.williams@demo.networth.ai',
    display_name: 'Marcus Williams',
    headline: 'Full-Stack Developer | Open Source Contributor | Rust Enthusiast',
    location: 'Montreal, Canada',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marcus',
  },
]

const DEMO_MATCH = {
  why: "Both are tech professionals in Canada looking to build meaningful products. Alex's startup experience combined with Sarah's product management expertise could create a powerful founding team.",
  common_ground: [
    'Both work in tech and are based in Canada',
    'Shared interest in building innovative products',
    'Both have experience at major tech companies',
  ],
  conversation_starters: [
    "Hey Sarah! I noticed you're looking for co-founders. I'd love to hear more about what you're building.",
    'Your fintech background is fascinating - have you thought about applying AI to that space?',
    "I'm always looking to connect with product-minded people. Coffee sometime?",
  ],
  networking_tips: [
    'Start by sharing your current project challenges',
    'Ask about their experience transitioning from big tech to startups',
    'Suggest a video call before meeting in person',
  ],
}

async function seed() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Seeding demo data...')

  for (const user of DEMO_USERS) {
    console.log(`Creating user: ${user.display_name}`)

    const { error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: {
        name: user.display_name,
        avatar_url: user.avatar_url,
      },
    })

    if (authError && !authError.message.includes('already been registered')) {
      console.error(`Error creating auth user ${user.email}:`, authError)
      continue
    }

    const { data: authUser } = await supabase.auth.admin.listUsers()
    const createdUser = authUser.users.find(u => u.email === user.email)

    if (createdUser) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: createdUser.id,
        display_name: user.display_name,
        headline: user.headline,
        location: user.location,
        avatar_url: user.avatar_url,
        ingestion_status: 'complete',
      })

      if (profileError) {
        console.error(`Error creating profile for ${user.email}:`, profileError)
      }
    }
  }

  const { data: users } = await supabase.auth.admin.listUsers()
  const demoUserIds = users.users
    .filter(u => u.email?.endsWith('@demo.networth.ai'))
    .map(u => u.id)

  if (demoUserIds.length >= 2) {
    console.log('Creating demo match suggestions...')

    const { error: matchError } = await supabase.from('match_suggestions').upsert([
      {
        recipient_id: demoUserIds[0],
        matched_user_id: demoUserIds[1],
        rationale: DEMO_MATCH,
        status: 'new',
      },
      {
        recipient_id: demoUserIds[1],
        matched_user_id: demoUserIds[0],
        rationale: DEMO_MATCH,
        status: 'new',
      },
    ])

    if (matchError) {
      console.error('Error creating match suggestions:', matchError)
    }
  }

  console.log('Demo seed complete!')
}

seed().catch(console.error)
