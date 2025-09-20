import { Outlet, Link, NavLink } from 'react-router-dom'
import { Menu, BookOpen, GraduationCap, PlayCircle, Search } from 'lucide-react'
import { UserMenu } from './UserMenu'
import { useProfile } from '../profile/useProfile'

export function RootLayout() {
  const { firstName } = useProfile()
  return (
    <div className="min-h-full flex">
      <div className="liquid-bg" aria-hidden>
        <div className="liquid-blob blob-a" />
        <div className="liquid-blob blob-b" />
      </div>
      <aside className="hidden md:flex sidebar glass">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full brand-gradient" />
          <Link to="/" className="font-semibold">SplitLearn</Link>
        </div>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
            <BookOpen className="h-4 w-4" /> Dashboard
          </NavLink>
          <NavLink to="/classes" className={({ isActive }) => navClass(isActive)}>
            <GraduationCap className="h-4 w-4" /> Classes
          </NavLink>
          <NavLink to="/exams" className={({ isActive }) => navClass(isActive)}>
            <PlayCircle className="h-4 w-4" /> Exams
          </NavLink>
        </nav>
      </aside>
      <div className="flex-1 p-4 md:p-8 space-y-4 container">
        <header className="flex items-center gap-3">
          <button className="md:hidden p-2 glass"><Menu /></button>
          <div className="flex-1" />
          <div className="glass search-glow flex items-center gap-2 px-3 py-2 rounded-full">
            <Search className="h-4 w-4 opacity-60" />
            <input placeholder={`Search your study space, ${firstName}`} className="bg-transparent outline-none placeholder:opacity-70 text-white" />
          </div>
          <UserMenu />
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function navClass(isActive: boolean) {
  return (
    'nav-item ' +
    (isActive
      ? 'nav-active'
      : '')
  )
}


