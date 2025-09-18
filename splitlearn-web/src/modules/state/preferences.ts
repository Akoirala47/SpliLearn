import { create } from 'zustand'

type PreferencesState = {
  typingPausesVideo: boolean
  setTypingPausesVideo: (value: boolean) => void
}

export const usePreferences = create<PreferencesState>((set) => ({
  typingPausesVideo: true,
  setTypingPausesVideo: (value) => set({ typingPausesVideo: value }),
}))


