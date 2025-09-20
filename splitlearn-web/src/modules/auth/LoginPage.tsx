import { useMemo, useState } from 'react'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { signInWithEmailPassword, signUpWithEmailPassword, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isEmailValid = useMemo(() => /.+@.+\..+/.test(email), [email])
  const isPasswordValid = useMemo(() => password.length >= 6, [password])
  const canSubmit = isEmailValid && isPasswordValid && !loading

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
    <div className="max-w-md mx-auto mt-16 p-6 glass">
      <h1 className="text-2xl font-semibold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>{mode === 'login' ? 'Log in' : 'Sign up'}</h1>
      <form className="space-y-3" onSubmit={handleSubmit} noValidate>
        <div className="space-y-1">
          <input
            className="w-full px-3 py-2 rounded-md bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!isEmailValid && email.length > 0 ? (
            <div className="text-xs text-red-600">Enter a valid email.</div>
          ) : null}
        </div>
        <div className="space-y-1">
          <input
            className="w-full px-3 py-2 rounded-md bg-white/80 dark:bg-black/50 border border-black/10 dark:border-white/10"
            placeholder="Password (min 6 chars)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!isPasswordValid && password.length > 0 ? (
            <div className="text-xs text-red-600">Password must be at least 6 characters.</div>
          ) : null}
        </div>
        {error ? <div className="text-red-600 text-sm">{error}</div> : null}
        <button className="w-full py-2 rounded-full text-white brand-gradient disabled:opacity-50" disabled={!canSubmit}>
          {loading ? 'Please wait…' : (mode === 'login' ? 'Log in' : 'Create account')}
        </button>
      </form>
      <div className="my-4 text-center text-sm">or</div>
      <button onClick={() => void signInWithGoogle()} className="w-full py-2 rounded-full glass">Continue with Google</button>
      <div className="mt-4 text-sm text-center">
        {mode === 'login' ? (
          <button className="underline" onClick={() => setMode('signup')}>Need an account? Sign up</button>
        ) : (
          <button className="underline" onClick={() => setMode('login')}>Have an account? Log in</button>
        )}
      </div>
    </div>
  )
}


