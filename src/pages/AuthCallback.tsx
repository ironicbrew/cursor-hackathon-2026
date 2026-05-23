import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Log the full URL for debugging
        console.log('Callback URL:', window.location.href)
        console.log('Search params:', window.location.search)
        console.log('Hash:', window.location.hash)

        // Check for error in URL params
        const params = new URLSearchParams(window.location.search)
        const error = params.get('error')
        const errorDescription = params.get('error_description')
        
        if (error) {
          console.error('OAuth error:', error, errorDescription)
          setStatus(`Error: ${errorDescription || error}`)
          setTimeout(() => navigate('/'), 3000)
          return
        }

        // Get the auth code from URL (PKCE flow)
        const code = params.get('code')
        console.log('Auth code present:', !!code)
        
        if (code) {
          setStatus('Exchanging code for session...')
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          
          if (exchangeError) {
            console.error('Exchange error:', exchangeError)
            setStatus(`Exchange error: ${exchangeError.message}`)
            setTimeout(() => navigate('/'), 3000)
            return
          }
          
          console.log('Exchange successful, session:', !!data.session)
          
          if (data.session) {
            setStatus('Success! Redirecting...')
            navigate('/onboarding')
            return
          }
        }

        // Check for hash params (implicit flow)
        if (window.location.hash) {
          setStatus('Processing hash params...')
          const { data, error: hashError } = await supabase.auth.getSession()
          
          if (hashError) {
            console.error('Hash session error:', hashError)
          }
          
          if (data.session) {
            setStatus('Success! Redirecting...')
            navigate('/onboarding')
            return
          }
        }

        // Fallback: check current session
        setStatus('Checking session...')
        const { data: sessionData } = await supabase.auth.getSession()
        console.log('Current session:', !!sessionData.session)
        
        if (sessionData.session) {
          navigate('/onboarding')
          return
        }

        // No session found
        setStatus('No session found. Redirecting...')
        setTimeout(() => navigate('/'), 2000)
        
      } catch (err) {
        console.error('Callback error:', err)
        setStatus(`Error: ${err}`)
        setTimeout(() => navigate('/'), 3000)
      }
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-on-surface-variant">{status}</p>
        <p className="text-xs text-on-surface-variant mt-2">Check browser console for details</p>
      </div>
    </div>
  )
}
