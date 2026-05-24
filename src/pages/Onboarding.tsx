import { useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User, CheckCircle2, Database, X } from 'lucide-react'
import {
  formatDiagnosisMessage,
  type SendEventResponse,
} from '@/lib/api-errors'
import type { OnboardingLocationState } from '@/types/navigation'
import type { ChatMessage } from '@/types/matching'

const ONBOARDING_QUESTIONS = [
  "What's on your mind right now? What are you currently working on or trying to figure out?",
  "What kind of people would be most helpful to connect with?",
  "What can you offer to others in your network?",
  "What's your general location? (City or region is fine)",
]

export function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const linkedInState = location.state as OnboardingLocationState | null
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
  const [showLinkedInBanner, setShowLinkedInBanner] = useState(
    Boolean(linkedInState?.linkedInConnected)
  )
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hey${isDemoMode ? ' there' : ` ${user?.user_metadata?.name?.split(' ')[0] || 'there'}`}! 👋 I'm here to help you find meaningful connections.\n\n${ONBOARDING_QUESTIONS[0]}`,
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  
  // Store user responses
  const responsesRef = useRef<string[]>([])

  const saveProfileAndTriggerIngestion = async (): Promise<{
    success: boolean
    message: string
    pipeline?: SendEventResponse
  }> => {
    if (!user?.id) {
      return { success: false, message: 'Not signed in — please log in again.' }
    }

    const [currentFocus, lookingFor, canOffer, location] = responsesRef.current

    const promptResponses = {
      currentFocus: currentFocus || '',
      lookingFor: lookingFor || '',
      canOffer: canOffer || '',
      location: location || '',
    }

    try {
      const meta = user.user_metadata ?? {}
      const profileMeta = {
        displayName:
          meta.name ||
          meta.full_name ||
          [meta.given_name, meta.family_name].filter(Boolean).join(' ') ||
          user.email?.split('@')[0] ||
          'User',
        avatarUrl: meta.avatar_url || meta.picture || meta.avatar || null,
      }

      const eventResponse = await fetch('/api/send-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'user/profile.ingested',
          data: {
            userId: user.id,
            promptResponses,
            profileMeta,
          },
        }),
      })

      const pipeline = (await eventResponse.json()) as SendEventResponse

      console.log('Profile ingestion response:', pipeline)

      if (!eventResponse.ok || !pipeline.success) {
        return {
          success: false,
          message: formatDiagnosisMessage(pipeline),
          pipeline,
        }
      }

      return {
        success: true,
        message: formatDiagnosisMessage(pipeline),
        pipeline,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Error in saveProfileAndTriggerIngestion:', error)
      return {
        success: false,
        message: `Unexpected error during profile setup: ${message}`,
      }
    }
  }

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    }

    // Store the response
    responsesRef.current[questionIndex] = input

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    await new Promise(resolve => setTimeout(resolve, 1000))

    const nextIndex = questionIndex + 1

    if (nextIndex < ONBOARDING_QUESTIONS.length) {
      const nextQuestion = ONBOARDING_QUESTIONS[nextIndex]
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Got it! ${nextQuestion}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMessage])
      setQuestionIndex(nextIndex)
    } else {
      const result = await saveProfileAndTriggerIngestion()

      const completionMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.success
          ? `Perfect! Everything completed successfully.\n\n${result.message}\n\nHead to your inbox to see match suggestions. 🚀`
          : `I saved your answers but hit a problem while setting up your profile:\n\n${result.message}\n\nYou can retry by refreshing, or check the browser console for full step details.`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, completionMessage])

      if (result.success) {
        setTimeout(() => {
          navigate('/inbox')
        }, 3000)
      }
    }

    setIsTyping(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-outline-variant p-4">
        <div className="container mx-auto max-w-2xl flex items-center gap-3">
          <Avatar>
            <AvatarImage src="/bot-avatar.png" />
            <AvatarFallback className="bg-primary text-on-primary">
              <Bot className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-semibold text-on-surface">NetWorth AI</h1>
            <p className="text-sm text-on-surface-variant">Getting to know you</p>
          </div>
        </div>
      </header>

      {showLinkedInBanner ? (
        <div className="border-b border-outline-variant bg-primary-container/60 px-4 py-3">
          <div className="container mx-auto max-w-2xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-primary-container">
                You're now in the network
              </p>
              <p className="text-xs text-on-primary-container/80 mt-0.5 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 shrink-0" />
                LinkedIn connected and saved to Supabase
                {linkedInState?.displayName ? ` as ${linkedInState.displayName}` : ''}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLinkedInBanner(false)}
              className="text-on-primary-container/70 hover:text-on-primary-container shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

      <ScrollArea className="flex-1 p-4">
        <div className="container mx-auto max-w-2xl space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <Avatar className="w-8 h-8 shrink-0">
                {message.role === 'assistant' ? (
                  <AvatarFallback className="bg-primary text-on-primary">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                ) : (
                  <>
                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-secondary-container text-on-secondary-container">
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              <Card className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary-container' : ''}`}>
                <CardContent className="p-3">
                  <p className={`text-sm whitespace-pre-wrap ${message.role === 'user' ? 'text-on-primary-container' : 'text-on-surface'}`}>
                    {message.content}
                  </p>
                </CardContent>
              </Card>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-on-primary">
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <Card>
                <CardContent className="p-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-outline-variant p-4">
        <div className="container mx-auto max-w-2xl flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your response..."
            className="flex-1"
          />
          <Button onClick={handleSend} size="icon" disabled={!input.trim() || isTyping}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
