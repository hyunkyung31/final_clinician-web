import { useState, type FormEvent } from 'react'
import logoMark from '../assets/dugn-mark.png'

interface LoginViewProps {
  loading: boolean
  error: string
  onLogin: (username: string, password: string) => Promise<void>
}

const ECG_LINE = 'M0 30 H86 L100 30 L112 18 L124 30 H188 L202 30 L214 8 L230 50 L246 16 L260 30 H360 L376 22 L394 30 H430 L444 30 L456 12 L472 46 L488 18 L502 30 H640'

export function LoginView({
  loading,
  error,
  onLogin,
}: LoginViewProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onLogin(username, password)
  }

  return (
    <main className="login-page">
      <div className="login-atmosphere" aria-hidden="true">
        <svg className="login-vessels" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path className="login-vessel" d="M-80 640 C 160 520, 280 760, 520 640 S 860 470, 1100 610" />
          <path className="login-vessel login-vessel-late" d="M860 -40 C 1040 80, 1180 -20, 1540 150" />
        </svg>
      </div>
      <div className="login-field" aria-hidden="true" />

      <div className="login-stage">
        <div className="login-logo-wrap">
          <img
            className="login-logo"
            src={logoMark}
            alt="DUGN"
            width={846}
            height={236}
            fetchPriority="high"
          />
        </div>
        <svg className="login-ecg" viewBox="0 0 640 56" aria-hidden="true">
          <path className="login-ecg-glow" pathLength="1" d={ECG_LINE} />
          <path className="login-ecg-line" pathLength="1" d={ECG_LINE} />
          <path className="login-ecg-head" pathLength="1" d={ECG_LINE} />
        </svg>

        <form className="login-form" onSubmit={handleSubmit}>
          <h1>의료진 로그인</h1>

          <label>
            <span>아이디</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={loading}
              required
            />
          </label>

          <label>
            <span>비밀번호</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              required
            />
          </label>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="login-submit" disabled={loading} type="submit">
            {loading ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  )
}
