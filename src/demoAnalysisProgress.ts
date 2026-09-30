export const AI_DEMO_PLAYBACK =
  import.meta.env.VITE_AI_DEMO_PLAYBACK === 'true'

export const AI_DEMO_DURATION_MS = Number(
  import.meta.env.VITE_AI_DEMO_DURATION_MS ?? '5000',
)

const demoDuration = Number.isFinite(AI_DEMO_DURATION_MS) && AI_DEMO_DURATION_MS > 0
  ? AI_DEMO_DURATION_MS
  : 5000

export const DEMO_PROGRESS_STEPS = [
  { ratio: 0.06, progress: 8, label: '영상 데이터 불러오는 중' },
  { ratio: 0.18, progress: 21, label: '영상 전처리 중' },
  { ratio: 0.32, progress: 38, label: '심혈관 영역 분석 중' },
  { ratio: 0.50, progress: 56, label: '관상동맥 병변 분석 중' },
  { ratio: 0.68, progress: 73, label: '석회화 및 협착 분석 중' },
  { ratio: 0.84, progress: 89, label: 'AI 분석 결과 생성 중' },
  { ratio: 0.96, progress: 96, label: '저장 결과 확인 중' },
  { ratio: 1, progress: 100, label: '분석 완료' },
] as const

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

export async function playDemoAnalysisProgress(
  update: (progress: number, label: string) => void,
) {
  let previousTime = 0

  for (const step of DEMO_PROGRESS_STEPS) {
    const currentTime = Math.round(demoDuration * step.ratio)

    await wait(currentTime - previousTime)
    update(step.progress, step.label)

    previousTime = currentTime
  }
}
