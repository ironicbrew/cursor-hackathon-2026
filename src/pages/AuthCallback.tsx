import { useEffect, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import type { User } from '@supabase/supabase-js'

import { CheckCircle2, Database, Link2 } from 'lucide-react'

import { Spinner } from '@/components/ui/spinner'

import { formatDiagnosisMessage, type SendEventResponse } from '@/lib/api-errors'

import { supabase } from '@/lib/supabase'

import type { OnboardingLocationState } from '@/types/navigation'



type CallbackPhase = 'processing' | 'success' | 'error'



interface ConfirmedProfile {

  displayName: string

  joinedAt: string

}



function oauthProfileMeta(user: User) {

  const meta = user.user_metadata ?? {}

  return {

    displayName:

      meta.name ||

      meta.full_name ||

      [meta.given_name, meta.family_name].filter(Boolean).join(' ') ||

      user.email?.split('@')[0] ||

      'User',

    avatarUrl: meta.avatar_url || meta.picture || meta.avatar || null,

  }

}



async function ensureProfileViaEvent(user: User, accessToken?: string): Promise<SendEventResponse> {
  const response = await fetch('/api/send-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'user/profile.ensure',
      data: {
        userId: user.id,
        profileMeta: oauthProfileMeta(user),
        accessToken,
      },
    }),
  })

  return response.json() as Promise<SendEventResponse>
}



async function fetchConfirmedProfile(user: User): Promise<ConfirmedProfile | null> {

  const { data: profile, error } = await supabase

    .from('profiles')

    .select('display_name, created_at')

    .eq('id', user.id)

    .single()



  if (error || !profile?.created_at) return null



  return {

    displayName: profile.display_name ?? oauthProfileMeta(user).displayName,

    joinedAt: profile.created_at,

  }

}



async function ensureProfileClientSide(user: User): Promise<boolean> {

  const meta = oauthProfileMeta(user)

  const { error } = await supabase.from('profiles').upsert(

    {

      id: user.id,

      display_name: meta.displayName,

      avatar_url: meta.avatarUrl,

      updated_at: new Date().toISOString(),

    },

    { onConflict: 'id' }

  )



  if (error) {

    console.error('Client profile upsert failed:', error)

    return false

  }



  return true

}



async function confirmProfileInDatabase(user: User): Promise<

  | { ok: true; profile: ConfirmedProfile; pipeline: SendEventResponse }

  | { ok: false; message: string; pipeline?: SendEventResponse }

> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const pipeline = await ensureProfileViaEvent(user, accessToken)

  console.log('Profile ensure response:', pipeline)



  if (pipeline.success) {

    const profile = await fetchConfirmedProfile(user)

    if (profile) {

      return { ok: true, profile, pipeline }

    }



    return {

      ok: false,

      message: 'Profile was not found in Supabase after linking.',

      pipeline,

    }

  }



  console.warn('Server profile ensure failed, trying client-side fallback')



  let profile = await fetchConfirmedProfile(user)

  if (!profile) {

    await ensureProfileClientSide(user)

    profile = await fetchConfirmedProfile(user)

  }



  if (profile) {

    return { ok: true, profile, pipeline }

  }



  return { ok: false, message: formatDiagnosisMessage(pipeline), pipeline }

}



export function AuthCallback() {

  const navigate = useNavigate()

  const [phase, setPhase] = useState<CallbackPhase>('processing')

  const [status, setStatus] = useState('Processing...')

  const [confirmedProfile, setConfirmedProfile] = useState<ConfirmedProfile | null>(null)



  useEffect(() => {

    const handleCallback = async () => {

      const finishAuth = async (user: User) => {

        setStatus('Saving your profile to Supabase...')

        const result = await confirmProfileInDatabase(user)



        if (!result.ok) {

          setPhase('error')

          setStatus(result.message)

          setTimeout(() => navigate('/onboarding'), 4000)

          return

        }



        setConfirmedProfile(result.profile)

        setPhase('success')

        setStatus('LinkedIn connected')



        const onboardingState: OnboardingLocationState = {

          linkedInConnected: true,

          displayName: result.profile.displayName,

          joinedAt: result.profile.joinedAt,

        }



        window.setTimeout(() => {

          navigate('/onboarding', { state: onboardingState })

        }, 2500)

      }



      try {

        console.log('Callback URL:', window.location.href)



        const params = new URLSearchParams(window.location.search)

        const error = params.get('error')

        const errorDescription = params.get('error_description')



        if (error) {

          console.error('OAuth error:', error, errorDescription)

          setPhase('error')

          setStatus(`Error: ${errorDescription || error}`)

          setTimeout(() => navigate('/'), 3000)

          return

        }



        const code = params.get('code')



        if (code) {

          setStatus('Exchanging code for session...')

          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)



          if (exchangeError) {

            console.error('Exchange error:', exchangeError)

            setPhase('error')

            setStatus(`Exchange error: ${exchangeError.message}`)

            setTimeout(() => navigate('/'), 3000)

            return

          }



          if (data.session?.user) {

            await finishAuth(data.session.user)

            return

          }

        }



        if (window.location.hash) {

          setStatus('Processing hash params...')

          const { data, error: hashError } = await supabase.auth.getSession()



          if (hashError) {

            console.error('Hash session error:', hashError)

          }



          if (data.session?.user) {

            await finishAuth(data.session.user)

            return

          }

        }



        setStatus('Checking session...')

        const { data: sessionData } = await supabase.auth.getSession()



        if (sessionData.session?.user) {

          await finishAuth(sessionData.session.user)

          return

        }



        setPhase('error')

        setStatus('No session found. Redirecting...')

        setTimeout(() => navigate('/'), 2000)

      } catch (err) {

        console.error('Callback error:', err)

        setPhase('error')

        setStatus(`Error: ${err}`)

        setTimeout(() => navigate('/'), 3000)

      }

    }



    handleCallback()

  }, [navigate])



  if (phase === 'success' && confirmedProfile) {

    const firstName = confirmedProfile.displayName.trim().split(/\s+/)[0]



    return (

      <div className="min-h-screen flex items-center justify-center bg-background px-4">

        <div className="w-full max-w-md rounded-xl border border-outline-variant/40 bg-surface-variant/50 px-6 py-8 text-center">

          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />

          <p className="text-lg font-semibold text-on-surface">LinkedIn connected</p>

          <p className="text-sm text-on-surface-variant mt-2">

            Welcome{firstName ? `, ${firstName}` : ''}! Your profile is now in Supabase and visible on

            the network.

          </p>



          <div className="mt-6 rounded-lg bg-background/60 px-4 py-3 text-left space-y-2">

            <p className="text-xs text-on-surface-variant flex items-center gap-2">

              <Link2 className="w-3.5 h-3.5 shrink-0" />

              LinkedIn account linked

            </p>

            <p className="text-xs text-on-surface-variant flex items-center gap-2">

              <Database className="w-3.5 h-3.5 shrink-0" />

              Saved as {confirmedProfile.displayName} in Supabase

            </p>

          </div>



          <p className="text-xs text-on-surface-variant mt-4">Continuing to onboarding…</p>

        </div>

      </div>

    )

  }



  return (

    <div className="min-h-screen flex items-center justify-center bg-background px-4">

      <div className="text-center">

        {phase === 'processing' ? (

          <Spinner size="md" className="mx-auto mb-4" />

        ) : (

          <div className="w-8 h-8 rounded-full bg-error-container text-on-error-container flex items-center justify-center mx-auto mb-4 text-sm font-semibold">

            !

          </div>

        )}

        <p className="text-on-surface-variant whitespace-pre-wrap max-w-md mx-auto">{status}</p>

        {phase === 'processing' ? (

          <p className="text-xs text-on-surface-variant mt-2">Check browser console for details</p>

        ) : null}

      </div>

    </div>

  )

}


