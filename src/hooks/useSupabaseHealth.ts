import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface NetworkMember {
  firstName: string
  joinedAt: string
}

export interface SupabaseHealth {
  loading: boolean
  ok: boolean
  profileCount: number | null
  recentMembers: NetworkMember[]
  error: string | null
}

function firstName(displayName: string | null): string | null {
  const name = displayName?.trim().split(/\s+/)[0]
  return name && name !== 'User' ? name : null
}

/** Lightweight health check: anon client can reach Supabase and read profiles. */
export function useSupabaseHealth(): SupabaseHealth {
  const [health, setHealth] = useState<SupabaseHealth>({
    loading: true,
    ok: false,
    profileCount: null,
    recentMembers: [],
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data, count, error } = await supabase
        .from('profiles')
        .select('display_name, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(10)

      if (cancelled) return

      if (error) {
        setHealth({
          loading: false,
          ok: false,
          profileCount: null,
          recentMembers: [],
          error: error.message,
        })
        return
      }

      const recentMembers = (data ?? [])
        .map((p) => {
          const name = firstName(p.display_name)
          if (!name || !p.created_at) return null
          return { firstName: name, joinedAt: p.created_at }
        })
        .filter((member): member is NetworkMember => member !== null)

      setHealth({
        loading: false,
        ok: true,
        profileCount: count ?? 0,
        recentMembers,
        error: null,
      })
    }

    check()
    const interval = window.setInterval(check, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return health
}
