import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User } from 'lucide-react'
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
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
  
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

  const saveProfileAndTriggerIngestion = async () => {
    if (!user?.id) return

    const [currentFocus, lookingFor, canOffer, location] = responsesRef.current

    try {
      // Update profile with onboarding data
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          headline: currentFocus || null,
          location: location || null,
          ingestion_status: 'complete',
        })
        .eq('id', user.id)

      if (profileError) {
        console.error('Error updating profile:', profileError)
      }

      // Save the full onboarding context to conversation_threads
      const { error: threadError } = await supabase
        .from('conversation_threads')
        .insert({
          user_id: user.id,
          thread_type: 'onboarding',
          messages: {
            current_focus: currentFocus,
            looking_for: lookingFor,
            can_offer: canOffer,
            location: location,
          },
        })

      if (threadError) {
        console.error('Error saving thread:', threadError)
      }

      // Trigger Inngest event for profile processing
      // This calls our API endpoint which will send the event to Inngest
      try {
        await fetch('/api/inngest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'user/profile.ingested',
            data: {
              userId: user.id,
              intent: `${currentFocus} | Looking for: ${lookingFor} | Can offer: ${canOffer} | Location: ${location}`,
            },
          }),
        })
      } catch (e) {
        console.log('Inngest event send attempted:', e)
      }

    } catch (error) {
      console.error('Error in saveProfileAndTriggerIngestion:', error)
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
      // All questions answered - save to database
      await saveProfileAndTriggerIngestion()
      
      const completionMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Perfect! I've got everything I need. I'm now analyzing your profile and looking for great matches in your area. You'll see suggestions appear in your inbox as I find them. Let's go! 🚀",
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, completionMessage])
      
      setTimeout(() => {
        navigate('/inbox')
      }, 2000)
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
