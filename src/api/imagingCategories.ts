import type { ImagingStudySummary } from '../types'

// CT/MR studies are volumetric sources, even before a rendering exists.
// Angiography sequences and other projection studies remain in the 2D list.
export function splitImagingStudies(studies: ImagingStudySummary[]) {
  const twoD: ImagingStudySummary[] = []
  const threeD: ImagingStudySummary[] = []
  for (const study of studies) {
    (['CT', 'MR'].includes(study.modality.trim().toUpperCase()) ? threeD : twoD).push(study)
  }
  return { twoD, threeD }
}

import type { AngiographyDetailedResponse, FrameRecord } from '../types';

/**
 * XCA 백엔드의 상세 분석 엔드포인트를 호출합니다.
 * 이 API는 프레임별 상세 좌표(bbox)와 Base64 PNG 마스크 데이터를 반환합니다.
 */
export async function analyzeAngiographyDetailed(
  patientId: string | number,
  frames: FrameRecord[]
): Promise<AngiographyDetailedResponse> {
  const response = await fetch('/api/v1/angiography/analyze-detailed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patient_id: patientId,
      frames,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.detail?.message || 
      `상세 AI 분석에 실패했습니다. (HTTP ${response.status})`
    );
  }

  return response.json();
}