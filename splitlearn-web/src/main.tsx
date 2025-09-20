import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { RootLayout } from './modules/layout/RootLayout'
import { DashboardPage } from './modules/dashboard/DashboardPage'
import { ClassesPage } from './modules/classes/ClassesPage'
import { ExamsPage } from './modules/exams/ExamsPage'
import { ExamDetailPage } from './modules/exams/ExamDetailPage'
import { LearnPage } from './modules/learn/LearnPage'
import { AuthProvider } from './modules/auth/AuthContext'
import { LoginPage } from './modules/auth/LoginPage'
import { Protected } from './modules/auth/Protected'
import { OnboardingGate } from './modules/onboarding/OnboardingGate'
import { ProfilePage } from './modules/profile/ProfilePage'
import { ToastProvider } from './modules/ui/Toast'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <Protected />,
    children: [
      {
        path: '/',
        element: (
          <OnboardingGate>
            <RootLayout />
          </OnboardingGate>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'classes', element: <ClassesPage /> },
          { path: 'exams', element: <ExamsPage /> },
          { path: 'exams/:examId', element: <ExamDetailPage /> },
          { path: 'exams/:examId/learn', element: <LearnPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
