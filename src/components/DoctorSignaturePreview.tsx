import { useEffect, useState } from 'react'
import { getStaffIdentity } from '../api/client'
import { getDoctorSignature } from '../doctorSignatures'
import type { StaffIdentity } from '../types'

export function DoctorSignaturePreview({ disabled = false, resetKey, onShownChange }: { disabled?: boolean; resetKey?: string; onShownChange?: (shown: boolean) => void }) {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null)
  const [error, setError] = useState('')
  const [shown, setShown] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => { setShown(false); setImageFailed(false); onShownChange?.(false) }, [resetKey, onShownChange])
  useEffect(() => {
    let active = true
    getStaffIdentity().then(value => { if (active) setIdentity(value) })
      .catch(() => { if (active) setError('로그인한 의료진 정보를 조회하지 못했습니다.') })
    return () => { active = false }
  }, [])
  const signature = getDoctorSignature(identity?.username)
  return <div className="doctor-signature-preview">
    <strong>의료진 서명</strong>
    <p>로그인한 의료진의 등록 서명입니다. 최종 승인 시 서버에서 동일 의료진의 서명을 PDF에 기록합니다.</p>
    {error ? <p role="alert">{error}</p> : !identity ? <p role="status">의료진 정보 조회 중…</p> : !signature ? <p>이 계정에 등록된 서명 이미지가 없습니다.</p> : <>
      <button type="button" className="primary" disabled={disabled || shown || imageFailed} onClick={() => { setShown(true); onShownChange?.(true) }}>서명 이미지 확인</button>
      {shown && <div aria-live="polite">
        <p>{identity.name || identity.username} 의사 서명 확인</p>
        {!imageFailed && <img src={signature} alt={`${identity.name || identity.username} 의사 서명`} onError={() => setImageFailed(true)} style={{ display: 'block', width: 180, height: 90, objectFit: 'contain', background: '#fff' }} />}
        {imageFailed && <p role="alert">서명 이미지를 불러오지 못했습니다.</p>}
        <button type="button" disabled={disabled} onClick={() => { setShown(false); setImageFailed(false); onShownChange?.(false) }}>서명 확인 취소</button>
      </div>}
    </>}
  </div>
}
