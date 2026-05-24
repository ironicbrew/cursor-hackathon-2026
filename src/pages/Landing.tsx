import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSupabaseHealth, type NetworkMember } from '@/hooks/useSupabaseHealth'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, MessageSquare, Sparkles, Link2, Database } from 'lucide-react'
import { useEffect } from 'react'

export function Landing() {
  const { user, loading, signInWithLinkedIn } = useAuth()
  const {
    loading: healthLoading,
    ok,
    profileCount,
    recentMembers,
    error: healthError,
  } = useSupabaseHealth()
  const navigate = useNavigate()
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

  useEffect(() => {
    if (user && !loading) {
      navigate('/onboarding')
    }
  }, [user, loading, navigate])

  const handleSignIn = async () => {
    if (isDemoMode) {
      navigate('/onboarding')
      return
    }
    try {
      await signInWithLinkedIn()
    } catch (error) {
      console.error('Sign in error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-on-surface-variant">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-on-surface mb-4">
            Your Network is Your Net Worth
          </h1>
          <p className="text-xl text-on-surface-variant max-w-2xl mx-auto">
            AI-powered introductions that actually matter. Connect with the right people
            in your local community based on what you're working on right now.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <Sparkles className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Smart Matching</CardTitle>
              <CardDescription>
                Our AI understands your goals and finds people who can genuinely help
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Users className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Local First</CardTitle>
              <CardDescription>
                Connect with people in your area for real conversations, not just online chats
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <MessageSquare className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Conversation Starters</CardTitle>
              <CardDescription>
                Get personalized talking points so you never have an awkward first message
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="flex flex-col items-center gap-4">
          <Button size="lg" onClick={handleSignIn} className="gap-2">
            <Link2 className="w-5 h-5" />
            {isDemoMode ? 'Try Demo' : 'Sign in with LinkedIn'}
          </Button>
          <p className="text-sm text-on-surface-variant">
            We only access your public profile information
          </p>

          <DbStatus
            healthLoading={healthLoading}
            ok={ok}
            profileCount={profileCount}
            recentMembers={recentMembers}
            healthError={healthError}
          />
        </div>
      </div>
    </div>
  )
}

function formatJoinedAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (seconds < 60) return `joined ${rtf.format(-Math.max(seconds, 1), 'second')}`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `joined ${rtf.format(-minutes, 'minute')}`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `joined ${rtf.format(-hours, 'hour')}`

  const days = Math.floor(hours / 24)
  if (days < 7) return `joined ${rtf.format(-days, 'day')}`

  const date = new Date(isoDate)
  return `joined ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function networkSummary(count: number): string {
  if (count === 0) return 'No one in the network yet'
  if (count === 1) return '1 person in the network'
  return `${count} people in the network`
}

function DbStatus({
  healthLoading,
  ok,
  profileCount,
  recentMembers,
  healthError,
}: {
  healthLoading: boolean
  ok: boolean
  profileCount: number | null
  recentMembers: NetworkMember[]
  healthError: string | null
}) {
  if (healthLoading) {
    return (
      <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-2">
        <Database className="w-3.5 h-3.5 animate-pulse" />
        Checking database…
      </p>
    )
  }

  if (!ok) {
    return (
      <p className="text-xs text-destructive flex items-center gap-1.5 mt-2 max-w-sm text-center">
        <span className="inline-block w-2 h-2 rounded-full bg-destructive shrink-0" />
        Database unreachable{healthError ? `: ${healthError}` : ''}
      </p>
    )
  }

  const count = profileCount ?? 0
  const hiddenCount = Math.max(count - recentMembers.length, 0)

  return (
    <div className="mt-4 w-full max-w-sm rounded-xl border border-outline-variant/40 bg-surface-variant/50 px-4 py-3 text-left">
      <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-primary shrink-0" />
        Connected · {networkSummary(count)}
      </p>

      {recentMembers.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {recentMembers.map((member) => (
            <li
              key={`${member.firstName}-${member.joinedAt}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="font-medium text-on-surface">{member.firstName}</span>
              <span className="text-xs text-on-surface-variant shrink-0">
                {formatJoinedAgo(member.joinedAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : count > 0 ? (
        <p className="mt-2 text-xs text-on-surface-variant">Recent joiners will appear here.</p>
      ) : null}

      {hiddenCount > 0 ? (
        <p className="mt-2 text-xs text-on-surface-variant">
          + {hiddenCount} earlier member{hiddenCount === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  )
}
