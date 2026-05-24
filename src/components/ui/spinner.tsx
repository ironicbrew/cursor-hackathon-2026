import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
} as const

export function Spinner({
  size = 'md',
  className,
}: {
  size?: keyof typeof sizeClasses
  className?: string
}) {
  return (
    <Loader2
      className={cn('animate-spin text-primary', sizeClasses[size], className)}
      aria-hidden
    />
  )
}
