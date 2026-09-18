import { postFormData } from "./client";

export interface CalcificationAnalysisResult {
  analysisId: string;
  status: "completed" | "failed";

  rawVoxels: number;
  hu130Voxels: number;

  stlUrl: string;
  overlayUrl: string;
  preview3dUrl: string;

  modelName: string;
  modelVersion: string;
}

export async function analyzeCalcification(
  ctFile: File
): Promise<CalcificationAnalysisResult> {
  const formData = new FormData();

  formData.append("ct", ctFile);

  return postFormData<CalcificationAnalysisResult>(
    "/api/v1/calcification/analyze",
    formData
  );

}
