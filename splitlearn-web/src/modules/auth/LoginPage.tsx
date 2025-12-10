import { useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Sparkles, ArrowLeft } from 'lucide-react'

export function LoginPage() {
  const { signInWithEmailPassword, signUpWithEmailPassword, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showLogin, setShowLogin] = useState(false)

  // validate email format and password length for form submission
  const isEmailValid = useMemo(() => /.+@.+\..+/.test(email), [email])
  const isPasswordValid = useMemo(() => password.length >= 6, [password])
  const canSubmit = isEmailValid && isPasswordValid && !loading

  // handle login or signup based on current mode
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') await signInWithEmailPassword(email, password)
      else await signUpWithEmailPassword(email, password)
    } catch (err: any) {
      setError(err.message ?? 'Auth failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      {/* animated transition between landing page and login form */}
      <AnimatePresence mode="wait">
        {!showLogin ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center space-y-8 max-w-2xl"
          >
            <div className="space-y-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm font-medium text-white/80 border border-white/10"
              >
                <Sparkles size={14} className="text-yellow-400" />
                AI-Powered Learning
              </motion.div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
                <span className="brand-gradient bg-clip-text text-transparent" style={{ WebkitBackgroundClip: 'text', color: 'transparent' }}>SplitLearn</span>
              </h1>
              <p className="text-xl text-muted max-w-lg mx-auto leading-relaxed">
                Turn your slides into interactive exams and smart notes instantly.
                The study companion that adapts to you.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowLogin(true)}
              className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-black font-semibold text-lg hover:bg-white/90 transition-colors"
            >
              Try it out
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md"
          >
            <button
              onClick={() => setShowLogin(false)}
              className="mb-6 flex items-center gap-2 text-muted hover:text-white transition-colors text-sm"
            >
              <ArrowLeft size={16} /> Back to home
            </button>

            <div className="glass p-8 rounded-3xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold brand-gradient mb-2">SplitLearn</h2>
                <h3 className="text-lg font-medium text-white/90">
                  {mode === 'login' ? 'Welcome back' : 'Create your account'}
                </h3>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="space-y-1">
                  <input
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/20 focus:bg-white/10 outline-none transition-all"
                    placeholder="Email address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {!isEmailValid && email.length > 0 && (
                    <div className="text-xs text-red-400 px-1">Please enter a valid email.</div>
                  )}
                </div>
                <div className="space-y-1">
                  <input
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/20 focus:bg-white/10 outline-none transition-all"
                    placeholder="Password (min 6 chars)"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {!isPasswordValid && password.length > 0 && (
                    <div className="text-xs text-red-400 px-1">Password must be at least 6 characters.</div>
                  )}
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  className="w-full py-3 rounded-xl text-white brand-gradient font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  disabled={!canSubmit}
                >
                  {loading ? 'Please wait…' : (mode === 'login' ? 'Log in' : 'Create account')}
                </button>
              </form>

              <div className="my-6 flex items-center gap-4">
                <div className="h-px bg-white/10 flex-1" />
                <span className="text-xs text-muted uppercase tracking-wider">Or continue with</span>
                <div className="h-px bg-white/10 flex-1" />
              </div>

              <button
                onClick={() => void signInWithGoogle()}
                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>

              <div className="mt-6 text-center">
                {mode === 'login' ? (
                  <button className="text-sm text-muted hover:text-white transition-colors" onClick={() => setMode('signup')}>
                    Don't have an account? <span className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">Sign up</span>
                  </button>
                ) : (
                  <button className="text-sm text-muted hover:text-white transition-colors" onClick={() => setMode('login')}>
                    Already have an account? <span className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">Log in</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


