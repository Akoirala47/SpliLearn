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

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'classes', element: <ClassesPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'exams/:examId', element: <ExamDetailPage /> },
      { path: 'exams/:examId/learn', element: <LearnPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
