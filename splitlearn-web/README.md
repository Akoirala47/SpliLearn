# SplitLearn Web Starter

Tech stack: React (Vite + TS), Tailwind v4, React Router, React Query, Zustand, Framer Motion, lucide-react.

### Scripts
- `npm run dev` - start dev server
- `npm run build` - typecheck and build
- `npm run preview` - preview production build

### Structure
- `src/modules/layout/RootLayout.tsx` - Sidebar, search, app chrome
- `src/modules/dashboard/DashboardPage.tsx` - Landing dashboard
- `src/modules/classes/ClassesPage.tsx` - Classes grid
- `src/modules/exams/ExamsPage.tsx` - Exams list
- `src/modules/exams/ExamDetailPage.tsx` - Exam detail + Study Guide placeholder
- `src/modules/learn/LearnPage.tsx` - Split-screen video/notes placeholder
- `src/modules/state/preferences.ts` - Basic Zustand store for UI prefs

### Tailwind
Using Tailwind v4 (no config file). Tokens set in `src/index.css` under `@theme`:
- Colors: primary, secondary, success, bg-light, bg-dark
- Fonts: heading, body, notes
- Helpers: `.glass`, `.brand-gradient`, `.notes-paper`

### Node requirement
Vite 7 recommends Node 20.19+ or 22.12+. Current Node 20.11 works but prints a warning. Consider upgrading Node for long-term stability.
