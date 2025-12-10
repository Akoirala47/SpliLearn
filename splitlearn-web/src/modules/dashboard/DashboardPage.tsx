import { Link } from 'react-router-dom'
import { useProfile } from '../profile/useProfile'
import { GlassCard } from '../ui/GlassCard'
import { ProgressBar } from '../ui/ProgressBar'
import { CircularProgress } from '../ui/CircularProgress'
import { CountdownBar } from '../ui/CountdownBar'
import { useExamProgress } from './hooks'
import { useMemo } from 'react'
import { GraduationCap, PlayCircle, FileText, Flame } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

function useStudyStreak() {
  const { user } = useAuth()
  
  return useQuery({
    queryKey: ['study-streak', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return 0
      
      const oneYearAgo = new Date()
      oneYearAgo.setDate(oneYearAgo.getDate() - 365)
      oneYearAgo.setHours(0, 0, 0, 0)
      
      const { data: completions } = await supabase
        .from('video_completions')
        .select('completed_at')
        .eq('user_id', user.id)
        .gte('completed_at', oneYearAgo.toISOString())
        .order('completed_at', { ascending: false })
      
      if (!completions || completions.length === 0) return 0
      
      // collect unique dates with activity
      const datesWithActivity = new Set<string>()
      for (const comp of completions) {
        if (comp.completed_at) {
          const date = new Date(comp.completed_at)
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          datesWithActivity.add(dateStr)
        }
      }
      
      // count consecutive days backwards from today
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      let streak = 0
      let checkDate = new Date(today)
      
      // start from yesterday if today has no activity
      const todayStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
      if (!datesWithActivity.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1)
      }
      
      for (let i = 0; i < 365; i++) {
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
        
        if (datesWithActivity.has(dateStr)) {
          streak++
          checkDate.setDate(checkDate.getDate() - 1)
        } else {
          break
        }
      }
      
      return streak
    },
  })
}

export function DashboardPage() {
  const { firstName } = useProfile()
  const { data: examProgress } = useExamProgress()
  const { data: studyStreak } = useStudyStreak()
  
  // calculate overall progress across all exams
  const overallProgress = useMemo(() => {
    if (!examProgress || examProgress.length === 0) return { percentage: 0, completed: 0, total: 0 }
    const totalVideos = examProgress.reduce((sum, exam) => sum + exam.totalVideos, 0)
    const completedVideos = examProgress.reduce((sum, exam) => sum + exam.completedVideos, 0)
    return {
      percentage: totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0,
      completed: completedVideos,
      total: totalVideos
    }
  }, [examProgress])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl md:text-4xl font-semibold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
        Welcome back, {firstName}
      </h1>
      
      <GlassCard>
        <div className="text-sm text-muted mb-4">Quick Start</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/classes"
            className="glass p-4 rounded-xl hover:bg-white/5 transition-all flex items-center gap-3 group"
          >
            <div className="p-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors">
              <GraduationCap size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">Classes</div>
              <div className="text-xs text-muted">Manage your classes</div>
            </div>
          </Link>
          
          <Link
            to="/exams"
            className="glass p-4 rounded-xl hover:bg-white/5 transition-all flex items-center gap-3 group"
          >
            <div className="p-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors">
              <PlayCircle size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">Exams</div>
              <div className="text-xs text-muted">View and manage exams</div>
            </div>
          </Link>
          
          <Link
            to="/notes"
            className="glass p-4 rounded-xl hover:bg-white/5 transition-all flex items-center gap-3 group"
          >
            <div className="p-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors">
              <FileText size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">Notes</div>
              <div className="text-xs text-muted">Review your notes</div>
            </div>
          </Link>
        </div>
      </GlassCard>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <GlassCard>
          <div className="text-sm text-muted mb-4">Overall Study Progress</div>
          <div className="flex flex-col items-center justify-center py-4">
            <CircularProgress value={overallProgress.percentage} size={140} strokeWidth={10}>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{overallProgress.percentage}%</div>
                <div className="text-xs text-muted mt-1">
                  {overallProgress.completed}/{overallProgress.total}
                </div>
              </div>
            </CircularProgress>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-sm text-muted mb-4">Progress by Exam</div>
          <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
            {examProgress && examProgress.length > 0 ? (
              examProgress.map((exam) => (
                <div key={exam.examId} className="space-y-2 glass p-3 rounded-lg">
                  <div className="text-white font-medium text-sm">{exam.examTitle}</div>
                  <div className="text-xs text-muted mb-2">{exam.className}</div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Videos</span>
                      <span className="text-white/70">
                        {exam.completedVideos}/{exam.totalVideos}
                      </span>
                    </div>
                    <ProgressBar value={exam.progressPercentage} />
                  </div>
                  
                  {exam.examDate && (
                    <div className="pt-2">
                      <CountdownBar examDate={exam.examDate} />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-muted text-center py-4">No exams yet</div>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="text-sm text-muted mb-4 flex items-center gap-2">
            <Flame size={16} className="text-orange-400" />
            Study Streak
          </div>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-6xl font-bold text-white mb-2">
              {studyStreak ?? 0}
            </div>
            <div className="text-sm text-muted">
              {studyStreak === 1 ? 'day' : 'days'} in a row
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
