import { usePreferences } from '../state/preferences'

export function LearnPage() {
  const { typingPausesVideo, setTypingPausesVideo } = usePreferences()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
          Let’s Learn
        </h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={typingPausesVideo}
            onChange={(e) => setTypingPausesVideo(e.target.checked)}
          />
          Typing pauses video
        </label>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="glass rounded-2xl aspect-video" />
        <div className="glass rounded-2xl p-4 notes-paper">
          <textarea
            className="w-full h-[60vh] bg-transparent outline-none resize-none"
            placeholder="Your notes..."
          />
        </div>
      </div>
    </div>
  )
}


