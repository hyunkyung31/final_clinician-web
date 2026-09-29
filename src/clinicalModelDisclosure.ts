export const CLINICAL_MODEL_DISCLOSURE = {
  eyebrow: 'RESEARCH CLINICAL MODEL · RANDOM FOREST',

  description:
    '임상 변수 54개를 사용해 관상동맥질환 관련 모델 신호를 계산합니다.',

  validationLabel: '연구용 모델 · 외부 검증 전',

  limitation:
    '개발 데이터 내부 교차검증을 기반으로 한 진료 보조 정보이며, 진단 확정이나 검사 결정을 대신하지 않습니다.',

  scoreLabel: '모델 예측 점수',
  thresholdLabel: '연구용 운영 기준',
  signalLabel: '결과 신호',

  highSignal: '추가 평가 필요',
  lowSignal: '낮은 신호',
} as const