import { Spinner } from '@/components/ui/spinner'

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" />
      {message ? (
        <p className="text-on-surface-variant">{message}</p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  )
}
