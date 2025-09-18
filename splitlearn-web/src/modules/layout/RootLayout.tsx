import { Outlet, Link, NavLink } from 'react-router-dom'
import { Menu, BookOpen, GraduationCap, PlayCircle, Search } from 'lucide-react'

export function RootLayout() {
  return (
    <div className="min-h-full flex">
      <aside className="hidden md:flex w-64 p-4 gap-4 flex-col glass">
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
      <div className="flex-1 p-4 md:p-8 space-y-4">
        <header className="flex items-center gap-3">
          <button className="md:hidden p-2 glass"><Menu /></button>
          <div className="flex-1" />
          <div className="glass flex items-center gap-2 px-3 py-2 rounded-full">
            <Search className="h-4 w-4 opacity-60" />
            <input placeholder="Search" className="bg-transparent outline-none placeholder:opacity-70" />
          </div>
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
    'flex items-center gap-2 px-3 py-2 rounded-full ' +
    (isActive
      ? 'brand-gradient text-white'
      : 'hover:bg-black/10 dark:hover:bg-white/10')
  )
}


