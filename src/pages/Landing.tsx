import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, MessageSquare, Sparkles, Link2 } from 'lucide-react'
import { useEffect } from 'react'

export function Landing() {
  const { user, loading, signInWithLinkedIn } = useAuth()
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
        </div>
      </div>
    </div>
  )
}
