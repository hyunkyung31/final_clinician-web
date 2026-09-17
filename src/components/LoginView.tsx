import { useState, type FormEvent } from 'react'

interface LoginViewProps {
  loading: boolean
  error: string
  onLogin: (username: string, password: string) => Promise<void>
}

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
      <section className="login-visual">
        <div className="login-brand">
          <span className="login-brand-icon">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M5 17h5l2.2-5 3.5 10 3.1-7 2 2H27" />
            </svg>
          </span>

          <div>
            <strong>AngioCAD</strong>
            <small>CLINICAL AI WORKSPACE</small>
          </div>
        </div>

        <div className="login-copy">
          <p>ANGIOCAD CLINICAL WORKSPACE</p>

          <h1>
            영상부터 판독까지,
            <br />
            하나의 흐름으로
          </h1>

          <span>
            환자 정보와 CAG·AI 분석 결과를 한 화면에서 검토하고
            <br />
            더 빠르고 정확하게 판독을 완료하세요.
          </span>
        </div>

        <div className="angiocad-motion" aria-hidden="true">
          <svg viewBox="0 0 360 360" role="presentation">
            <defs>
              <linearGradient
                id="motionGradient"
                x1="40"
                y1="50"
                x2="320"
                y2="310"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#82c7ff" />
                <stop offset="48%" stopColor="#4f8cff" />
                <stop offset="100%" stopColor="#55e0c1" />
              </linearGradient>

              <radialGradient id="coreGradient">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="35%" stopColor="#8fd1ff" />
                <stop offset="100%" stopColor="#3d7df0" />
              </radialGradient>

              <filter id="motionGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <circle
              className="motion-orbit motion-orbit-outer"
              cx="180"
              cy="180"
              r="145"
            />

            <circle
              className="motion-orbit motion-orbit-inner"
              cx="180"
              cy="180"
              r="105"
            />

            <circle
              className="motion-scan-ring motion-scan-ring-first"
              cx="180"
              cy="180"
              r="72"
            />

            <circle
              className="motion-scan-ring motion-scan-ring-second"
              cx="180"
              cy="180"
              r="72"
            />

            <g className="motion-vessels">
              <path
                className="motion-vessel motion-vessel-main"
                pathLength="1"
                d="M180 276
                   C178 244 179 219 182 192
                   C185 165 183 137 174 105
                   C169 87 161 70 151 54"
              />

              <path
                className="motion-vessel motion-vessel-left"
                pathLength="1"
                d="M181 195
                   C157 177 136 158 118 133
                   C102 111 92 88 86 67"
              />

              <path
                className="motion-vessel motion-vessel-right"
                pathLength="1"
                d="M182 190
                   C205 168 229 151 256 139
                   C276 130 294 126 312 126"
              />

              <path
                className="motion-vessel motion-vessel-lower"
                pathLength="1"
                d="M180 220
                   C202 224 224 238 244 260
                   C256 273 267 288 276 305"
              />
            </g>

            <path
              className="motion-heartbeat-track"
              d="M44 181
                 H113
                 L130 181
                 L143 160
                 L159 214
                 L176 131
                 L196 197
                 L210 181
                 H316"
            />

            <path
              className="motion-heartbeat-line"
              pathLength="1"
              d="M44 181
                 H113
                 L130 181
                 L143 160
                 L159 214
                 L176 131
                 L196 197
                 L210 181
                 H316"
            />

            <circle
              className="motion-core-glow"
              cx="180"
              cy="181"
              r="18"
            />

            <circle
              className="motion-core"
              cx="180"
              cy="181"
              r="7"
            />
          </svg>

          <div className="motion-caption">
            <strong>ANGIOCAD</strong>
            <span>Coronary AI analysis</span>
          </div>
        </div>

        <div className="login-system">
          <i />
          API 서버 연결 준비됨
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <header className="login-form-header">
            <small>의료진 전용</small>
            <h2>로그인</h2>
            <p>CDSS 의료진 계정으로 로그인해주세요.</p>
          </header>

          <label>
            <span>아이디</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="아이디를 입력하세요"
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
              placeholder="비밀번호를 입력하세요"
              disabled={loading}
              required
            />
          </label>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="login-submit"
            disabled={loading}
            type="submit"
          >
            {loading ? '로그인 중…' : '로그인'}
          </button>

          <p className="login-notice">
            환자 개인정보 보호를 위해 공용 PC에서는 사용 후 반드시
            로그아웃하세요.
          </p>
        </form>
      </section>
    </main>
  )
}