import type { AnalysisResult, PatientSummary, TimelineItem } from './types'

export const mockPatients: PatientSummary[] = [
  { id: 'P-002345', name: '홍길동', sex: 'M', age: 64, exam: 'CAG', risk: 'high', score: 72, status: 'waiting', note: 'LAD 병변 우선 확인' },
  { id: 'P-002149', name: '이은진', sex: 'F', age: 70, exam: 'CCTA', risk: 'medium', score: 58, status: 'waiting', note: '석회화 구간 검토' },
  { id: 'P-001872', name: '김미선', sex: 'F', age: 55, exam: '혈액검사', risk: 'normal', status: 'complete', note: '검사 결과 확인 완료' },
  { id: 'P-003018', name: '박준호', sex: 'M', age: 59, exam: 'CAG', risk: 'medium', status: 'waiting', note: '09:55 검사 예정' },
  { id: 'P-003026', name: '오서윤', sex: 'F', age: 67, exam: 'CAG', risk: 'normal', status: 'running', note: '촬영 18 / 56' },
  { id: 'P-001405', name: '최정민', sex: 'M', age: 71, exam: 'FFR', risk: 'high', score: 73, status: 'urgent', note: 'LCX 긴급 판독' },
]

export const defaultAnalysis: AnalysisResult = {
  studyId: 'ST-20260905-0042',
  modelVersion: 'AngioCAD v0.3',
  analyzedAt: '2026-09-05 09:42:18',
  predictedFfr: 0.76,
  lesionLengthMm: 14.2,
  referenceDiameterMm: 3.1,
  frame: 18,
  totalFrames: 56,
  lesions: [
    { vessel: 'LAD', location: '중간부', stenosis: 72, confidence: 78, status: 'review' },
    { vessel: 'LCX', location: '근위부', stenosis: 38, confidence: 66, status: 'observe' },
  ],
  draftImpression: 'LAD 중간부에 약 72% 협착이 의심되며 AI 예측 FFR은 0.76입니다. 임상 소견과 함께 중재 여부 검토를 권고합니다.',
}

export const mockTimeline: TimelineItem[] = [
  { date: '2026-09-05 · 오늘', title: '관상동맥조영술', detail: 'AI 분석 완료 · 검토 필요', active: true },
  { date: '2026-09-04', title: '심전도 · 혈액검사', detail: 'Troponin-I 정상 · LDL 141' },
  { date: '2026-08-28', title: '외래 진료', detail: '운동 시 흉통 · 약물 조정' },
  { date: '2026-05-16', title: 'CCTA', detail: '관상동맥 석회화 점수 286' },
  { date: '2025-12-02', title: '심초음파', detail: 'EF 58% · RWMA 없음' },
  { date: '2025-09-18', title: '입원 기록', detail: '불안정 협심증 의심' },
]
