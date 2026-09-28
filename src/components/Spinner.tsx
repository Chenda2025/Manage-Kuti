export function Spinner({ label = 'កំពុងទាញទិន្នន័យ...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-line border-t-saffron" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
