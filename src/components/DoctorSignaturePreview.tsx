import { useEffect, useState } from 'react'
import { getStaffIdentity } from '../api/client'
import { getDoctorSignature } from '../doctorSignatures'
import type { StaffIdentity } from '../types'

export function DoctorSignaturePreview({ disabled = false, resetKey }: { disabled?: boolean; resetKey?: string }) {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => { setShown(false); setImageFailed(false) }, [resetKey])
  useEffect(() => {
    let active = true
    getStaffIdentity().then(value => { if (active) setIdentity(value) })
      .catch(() => { if (active) setError('로그인한 의료진 정보를 조회하지 못했습니다.') })
    return () => { active = false }
  }, [])
  const signature = getDoctorSignature(identity?.username)
  return <div className="doctor-signature-preview">
    <strong>의료진 서명</strong>
    <p>로컬 미리보기 · 실제 승인과 PDF에는 저장되지 않습니다.</p>
    {error ? <p role="alert">{error}</p> : !identity ? <p role="status">의료진 정보 조회 중…</p> : !signature ? <p>이 계정에 등록된 서명 이미지가 없습니다.</p> : <>
      <button type="button" className="primary" disabled={disabled || shown || imageFailed} onClick={() => setShown(true)}>서명하기</button>
      {shown && <div aria-live="polite">
        <p>{identity.name || identity.username} 의사 서명 · 미리보기</p>
        {!imageFailed && <img src={signature} alt={`${identity.name || identity.username} 의사 서명`} onError={() => setImageFailed(true)} style={{ display: 'block', width: 180, height: 90, objectFit: 'contain', background: '#fff' }} />}
        {imageFailed && <p role="alert">서명 이미지를 불러오지 못했습니다.</p>}
        <button type="button" disabled={disabled} onClick={() => { setShown(false); setImageFailed(false) }}>서명 취소</button>
      </div>}
    </>}
  </div>
}
