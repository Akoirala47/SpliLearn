import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Link } from 'react-router-dom'
import { useProfile } from '../profile/useProfile'

export function UserMenu() {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // close menu when clicking outside the component
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const { displayName } = useProfile()
  const label = (displayName?.[0] ?? 'U').toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full brand-gradient grid place-items-center shadow-sm"
        aria-label="Open user menu"
      >
        <span className="text-white text-sm font-semibold select-none">{label}</span>
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-56 glass p-2 rounded-2xl z-50">
          <div className="px-2 py-1.5 text-sm opacity-70 truncate">{displayName}</div>
          <Link to="/profile" onClick={() => setOpen(false)} className="block w-full text-left px-3 py-2 rounded-md hover:bg-black/10 dark:hover:bg-white/10">
            Profile
          </Link>
          <button onClick={() => void signOut()} className="block w-full text-left px-3 py-2 rounded-md hover:bg-black/10 dark:hover:bg-white/10">
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}


