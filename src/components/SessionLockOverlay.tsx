import { useState, type FormEvent } from 'react'
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'

interface SessionLockOverlayProps {
  clinicianName: string
  loading: boolean
  error: string
  onUnlock: (password: string) => Promise<void>
  onLogout: () => Promise<void>
}

export function SessionLockOverlay({
  clinicianName,
  loading,
  error,
  onUnlock,
  onLogout,
}: SessionLockOverlayProps) {
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password.trim() || loading) return
    await onUnlock(password)
    setPassword('')
  }

  return (
    <div className="session-lock-backdrop" role="dialog" aria-modal="true" aria-label="워크스테이션 잠금">
      <form className="session-lock-card" onSubmit={handleSubmit}>
        <span className="session-lock-icon"><LockKeyhole size={25} strokeWidth={1.8} /></span>
        <small>ANGIOCAD SECURITY</small>
        <h2>워크스테이션이 잠겼습니다</h2>
        <p>환자정보 보호를 위해 미사용 상태에서 자동으로 잠금 처리되었습니다.</p>

        <div className="session-lock-user">
          <ShieldCheck size={18} strokeWidth={1.8} />
          <span><small>로그인 의료진</small><strong>{clinicianName}</strong></span>
        </div>

        <label>
          <span>비밀번호 재인증</span>
          <input
            autoFocus
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호를 입력하세요"
            disabled={loading}
            required
          />
        </label>

        {error && <div className="session-lock-error" role="alert">{error}</div>}

        <button className="session-unlock-button" type="submit" disabled={loading || !password.trim()}>
          {loading ? '재인증 중…' : '잠금 해제'}
        </button>
        <button className="session-logout-button" type="button" onClick={() => void onLogout()} disabled={loading}>
          <LogOut size={15} strokeWidth={1.8} /> 다른 계정으로 로그인
        </button>
      </form>
    </div>
  )
}
