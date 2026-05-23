import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useMatchSuggestions } from '@/hooks/useMatchSuggestions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { 
  LogOut, 
  Inbox as InboxIcon, 
  Sparkles, 
  Check, 
  X, 
  MessageSquare,
  MapPin,
  Briefcase
} from 'lucide-react'
import type { MatchSuggestion, Profile } from '@/types/database'
import type { MatchRationale } from '@/types/matching'

interface SuggestionWithMatch extends MatchSuggestion {
  matched_profile?: Profile | null
}

function SuggestionCard({ 
  suggestion, 
  onSelect 
}: { 
  suggestion: SuggestionWithMatch
  onSelect: () => void 
}) {
  const rationale = suggestion.rationale as MatchRationale
  const profile = suggestion.matched_profile
  const isNew = suggestion.status === 'new'

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-[--shadow-elevation-2] ${isNew ? 'border-l-4 border-l-primary' : ''}`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Avatar className="w-12 h-12">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary-container text-on-secondary-container">
              {profile?.display_name?.charAt(0) ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">
              {profile?.display_name ?? 'Unknown'}
              {isNew && <span className="ml-2 text-xs bg-primary text-on-primary px-2 py-0.5 rounded-full">New</span>}
            </CardTitle>
            <CardDescription className="flex items-center gap-1 truncate">
              <Briefcase className="w-3 h-3" />
              {profile?.headline ?? 'No headline'}
            </CardDescription>
            {profile?.location && (
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {profile.location}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-on-surface-variant line-clamp-2">
          {rationale?.why ?? 'AI match suggestion'}
        </p>
      </CardContent>
    </Card>
  )
}

function SuggestionDetail({
  suggestion,
  onAccept,
  onDecline,
  onBack,
}: {
  suggestion: SuggestionWithMatch
  onAccept: () => void
  onDecline: (reason: string) => void
  onBack: () => void
}) {
  const [showDeclineInput, setShowDeclineInput] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  
  const rationale = suggestion.rationale as MatchRationale
  const profile = suggestion.matched_profile
  const isResolved = suggestion.status !== 'new'

  const handleDecline = () => {
    if (showDeclineInput && declineReason.trim()) {
      onDecline(declineReason)
    } else {
      setShowDeclineInput(true)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-outline-variant">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          ← Back to inbox
        </Button>
        
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-secondary-container text-on-secondary-container text-xl">
              {profile?.display_name?.charAt(0) ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold text-on-surface">{profile?.display_name}</h2>
            <p className="text-on-surface-variant">{profile?.headline}</p>
            {profile?.location && (
              <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
                <MapPin className="w-4 h-4" />
                {profile.location}
              </p>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-5 h-5 text-primary" />
                Why You Should Connect
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-on-surface">{rationale?.why}</p>
            </CardContent>
          </Card>

          {rationale?.common_ground && rationale.common_ground.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Common Ground</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {rationale.common_ground.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-on-surface">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {rationale?.conversation_starters && rationale.conversation_starters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Conversation Starters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {rationale.conversation_starters.map((starter, i) => (
                    <li key={i} className="p-3 bg-surface-variant rounded-[--radius-md] text-on-surface-variant">
                      "{starter}"
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {rationale?.networking_tips && rationale.networking_tips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Networking Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {rationale.networking_tips.map((tip, i) => (
                    <li key={i} className="text-on-surface-variant">• {tip}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {!isResolved && (
        <div className="p-4 border-t border-outline-variant">
          {showDeclineInput ? (
            <div className="space-y-2">
              <p className="text-sm text-on-surface-variant">Why isn't this a good match?</p>
              <Input
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Help us improve..."
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowDeclineInput(false)} className="flex-1">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDecline} className="flex-1" disabled={!declineReason.trim()}>
                  Submit
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDecline} className="flex-1 gap-2">
                <X className="w-4 h-4" />
                Not for me
              </Button>
              <Button onClick={onAccept} className="flex-1 gap-2">
                <Check className="w-4 h-4" />
                Let's connect!
              </Button>
            </div>
          )}
        </div>
      )}

      {isResolved && (
        <div className="p-4 border-t border-outline-variant">
          <p className={`text-center ${suggestion.status === 'accepted' ? 'text-primary' : 'text-on-surface-variant'}`}>
            {suggestion.status === 'accepted' ? '✓ You accepted this connection' : '✗ You passed on this one'}
          </p>
        </div>
      )}
    </div>
  )
}

export function Inbox() {
  const { user, signOut } = useAuth()
  const { suggestions, loading, updateSuggestionStatus } = useMatchSuggestions(user?.id)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedSuggestion = suggestions.find(s => s.id === selectedId)
  const newCount = suggestions.filter(s => s.status === 'new').length

  const handleAccept = async () => {
    if (!selectedId) return
    await updateSuggestionStatus(selectedId, 'accepted')
  }

  const handleDecline = async (reason: string) => {
    if (!selectedId) return
    await updateSuggestionStatus(selectedId, 'declined', reason)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-on-surface-variant">Loading your matches...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-outline-variant flex flex-col">
        <div className="p-4 border-b border-outline-variant">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-on-surface flex items-center gap-2">
              <InboxIcon className="w-5 h-5" />
              Inbox
              {newCount > 0 && (
                <span className="text-xs bg-primary text-on-primary px-2 py-0.5 rounded-full">
                  {newCount}
                </span>
              )}
            </h1>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {suggestions.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No matches yet!</p>
                <p className="text-sm mt-1">We're finding great connections for you.</p>
              </div>
            ) : (
              suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onSelect={() => setSelectedId(suggestion.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex-1">
        {selectedSuggestion ? (
          <SuggestionDetail
            suggestion={selectedSuggestion}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-on-surface-variant">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Select a match to see details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
