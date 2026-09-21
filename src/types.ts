export type RiskLevel = 'high' | 'medium' | 'normal'
export type WorkStatus = 'waiting' | 'running' | 'complete' | 'urgent'

export interface PatientSummary {
  backendId?: number
  id: string
  name: string
  sex: 'M' | 'F'
  age: number
  exam: string
  risk: RiskLevel
  score?: number
  status: WorkStatus
  note: string
}

export interface TimelineItem {
  date: string
  title: string
  detail: string
  active?: boolean

  eventType?:
    | 'ENCOUNTER'
    | 'EXAMINATION'
    | 'AI_ANALYSIS'
    | 'REPORT'

    referenceId?: number
    status?: string
}

export interface DashboardSummary {
  date: string
  patientCount: number
  examinationPendingCount: number
  aiPendingCount: number
  consultationPendingCount: number
  signoffPendingCount: number
  totalPendingCount: number
}

export interface DashboardAIStatus {
  date: string
  queued: number
  running: number
  failed: number
  completed: number
  cancelled: number
  total: number
}

export interface DashboardWorkItem {
  id: number
  patientId?: number
  workType: string
  referenceType: string
  referenceId?: number
  priority: string
  status: string
  dueAt: string
  createdAt: string
  completedAt: string
}

export interface DashboardConsultationItem {
  id: number
  patientId?: number
  patientName: string
  requestedById?: number
  assignedDoctorId?: number
  subject: string
  priority: string
  status: string
  dueAt: string
  createdAt: string
  opinionCount: number
  hasResponse: boolean
}

export interface DashboardRecentPatient {
  patientId: number
  medicalRecordNo: string
  name: string
  birthDate: string
  gender: string
  status: string
  lastViewedAt: string
}

export interface DashboardExaminationStats {
  scheduled: number
  inProgress: number
  completed: number
}

export interface StaffReservation {
  id: number
  patientId?: number
  doctorId?: number
  applicantName: string
  reservedAt: string
  status: string
}

export interface StaffTodo {
  id: number
  title: string
  status: string
  priority: string
  dueAt: string
  completedAt: string
  description: string
}

export interface StaffTodoInput {
  title: string
  priority?: 'LOW' | 'NORMAL' | 'HIGH'
  dueAt?: string | null
  description?: string
}

export interface StaffAnnouncement {
  id: number
  title: string
  body: string
  category: string
  categoryLabel: string
  priority: string
  priorityLabel: string
  author: string
  publishedAt: string
  expiresAt: string
}

export interface LesionResult {
  vessel: string
  location: string
  stenosis: number
  confidence: number
  status: 'review' | 'observe'
}

export interface AnalysisResult {
  studyId: string
  modelVersion: string
  analyzedAt: string
  predictedFfr: number
  lesionLengthMm: number
  referenceDiameterMm: number
  frame: number
  totalFrames: number
  lesions: LesionResult[]
  draftImpression: string
}

export interface PatientDetail {
  backendId : number
  medicalRecordNo : string
  name : string
  birthDate : string
  sex : 'M' | 'F'
  age : number
  contact : string
  status : string
  registeredAt : string
}

export interface PatientDiagnosisSummary {
  id: number
  code: string
  name: string
  diagnosisType: string
  diagnosisText: string
  status: string
  diagnosedAt: string
  diagnosedByName: string
}

export interface PatientMedicalHistorySummary {
  id: number
  conditionCode: string
  conditionName: string
  status: string
  onsetDate: string
  resolvedDate: string
  note: string
}

/** PatientAllergy 조회 결과. isNoKnownAllergy=true인 ACTIVE 레코드가 있으면
 * "알레르기 없음"이 명시적으로 확인된 것이고, ACTIVE 레코드가 전혀 없으면
 * 아직 확인되지 않은 "미입력" 상태다. 실제 알레르기 레코드가 있으면 그 목록을 보여준다. */
export interface PatientAllergySummary {
  id: number
  allergenType: string | null
  allergenName: string | null
  reaction: string
  severity: string | null
  status: string
  isNoKnownAllergy: boolean
  note: string
  verifiedAt: string | null
}

/** GET /api/patients/{id}/medical-results/ (reports.StaffPatientMedicalResultListView) 응답 항목.
 * "결과보고서" 화면에서 환자를 검색/선택했을 때 보여줄 보고서 상태 목록이다. */
export interface PatientReportSummary {
  medicalResultId: number
  encounterId: number | null
  visitDate: string | null
  encounterType: string | null
  doctorName: string | null
  status: string
  latestVersion: { versionNo: number; sourceType: string; createdAt: string } | null
  latestSignoff: { signedAt: string; doctorName: string } | null
  latestReport: { reportId: number; reportName: string; status: string; createdAt: string } | null
  createdAt: string
  updatedAt: string
}

export interface ImagingStudySummary {
  id: number
  examinationId?: number
  studyInstanceUid: string
  orthancStudyId?: string
  modality: string
  description: string
  studyDate: string
  status: string
  seriesCount?: number
  instanceCount?: number
}

export interface ImagingSeriesSummary {
  id: number
  studyId: number
  seriesInstanceUid: string
  orthancSeriesId: string
  seriesNumber?: number
  modality: string
  bodySite: string
  description: string
  instanceCount: number
}

export interface ImagingFileAssetSummary {
  id: number
  storageBackend: string
  bucketName: string
  objectKey: string
  orthancResourceId: string
  mimeType: string
}

export interface ImagingInstanceSummary {
  id: number
  seriesId: number
  sopInstanceUid: string
  orthancInstanceId: string
  sopClassUid: string
  instanceNumber?: number
  fileAsset?: ImagingFileAssetSummary
  createdAt: string
}

export interface ImagingInstancePreview {
  instanceId: number
  orthancInstanceId: string
  fileAsset?: ImagingFileAssetSummary
  previewUrl: string
}

export interface ImagingDicomManifestInstance {
  id: number
  sopInstanceUid: string
  instanceNumber?: number
  dicomUrl: string
  imagePositionPatient?: number[]
  imageOrientationPatient?: number[]
  sliceLocation?: number
}

export interface ImagingSeriesViewerManifest {
  studyId: number
  seriesId: number
  studyInstanceUid: string
  seriesInstanceUid: string
  modality: string
  instanceCount: number
  instances: ImagingDicomManifestInstance[]
}

export interface ImagingViewerAccess {
  studyId: number
  orthancStudyId: string
  viewerToken: string
  expiresIn: number
  viewerUrl: string
}

export interface ImagingStudyDetail extends ImagingStudySummary {
  series: ImagingSeriesSummary[]
}

export interface ImagingStudyComparison {
  current: ImagingStudySummary
  candidates: ImagingStudySummary[]
}

export interface LabObservation {
  id: string
  measurementId?: number
  clinicalVariableId?: number
  resultId?: number
  resultStatus?: string
  examinationId?: number
  stageLabel?: string
  code: string
  name: string
  value?: number
  textValue: string
  unit: string
  measuredAt: string
  referenceLow?: number
  referenceHigh?: number
  referenceRangeText: string
  referenceRangeId?: number
  specimenType?: string
  method?: string
  fasting?: boolean
  interpretationCode?: string
  sourceWarning?: string
  flag: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW' | 'ABNORMAL' | 'UNKNOWN'
}

export type PatientApiScope = 'ALL_ACCESSIBLE' | 'ASSIGNED_TO_ME' | 'CONSULTATION' | 'RECENT'
export interface PatientPage {
  results: PatientSummary[]
  count: number
  page: number
  hasNext: boolean
}

export interface ImagingAnnotationInput {
  imaging_series?: number | null
  imaging_instance?: number | null
  rendering_3d?: number | null
  viewer_type: '2D' | '3D_ORIGINAL' | '3D_RENDERED'
  tool_type: 'FREEHAND' | 'RECTANGLE' | 'TEXT'
  geometry_json: Record<string, unknown>
  text_content?: string | null
  color?: string
  frame_index?: number | null
  slice_index?: number | null
  camera_state_json?: Record<string, unknown> | null
}
export interface ImagingAnnotationRecord extends ImagingAnnotationInput {
  id: number
  version: number
  created_by_name?: string
}

export interface BackendCapabilities {
  patientScope: boolean
  /** PATCH /admin/reference-ranges/{id}/ 존재 여부 (새 버전 저장 + 감사 이력 조회 가능) */
  referenceAdministration: boolean
  /** POST /clinical-variables/{id}/reference-ranges/ 존재 여부 (신규 등록 가능) */
  referenceRangeCreate: boolean
}

export type CoronarySide = 'LEFT' | 'RIGHT' | 'UNKNOWN'

export interface AngiographySequenceSummary {
  id: number
  sequenceNo: number
  frameCount: number
  examinationId?: number
  coronarySide: CoronarySide
  coronarySideLabel: string
  displayName: string
  performedAt: string
  labels: unknown
}

export interface AngiographyFrame {
  index: number
  filename: string
  url: string
  expiresIn?: number
}

export interface Rendering3DSummary {
  id: number
  studyId: number
  fileAssetId?: number
  aiAnalysisJobId?: number
  generationType: string
  renderingType: string
  fileFormat: 'GLB' | 'VTK' | 'STL' | string
  version: number
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string
  generatedAt: string
  createdAt: string
  renderingConfig?: Record<string, unknown>
}

export interface Rendering3DViewerSource {
  renderingId: number
  fileId: number
  fileFormat: string
  downloadUrl: string
  expiresIn?: number
  sourceRole?: string
}

export interface Rendering3DSourceSummary {
  id: number
  renderingId: number
  aiSegmentationResultId?: number
  sourceFileAssetId?: number
  imagingSeriesId?: number
  sourceRole: string
}

export interface StaffNotification {
  recipientId: number
  notificationId: number
  type: string
  title: string
  body: string
  referenceType: string
  referenceId?: number
  priority: string
  isRead: boolean
  createdAt: string
}

export interface PatientMemo {
  id: number
  content : string
  authorName : string
  createdAt : string
  updatedAt : string
}

export interface ExaminationTypeSummary {
  id: number
  code: string
  name: string
  category: string
  modality: string
  description: string
}

export interface ExaminationOrderSummary {
  id: number
  encounterId: number
  examinationTypeId: number
  orderedById?: number
  priority: 'NORMAL' | 'URGENT'
  status: 'ORDERED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELED'
  clinicalNote: string
  orderedAt: string
  scheduledAt: string
  scheduledLocation: string

  canceledAt: string
  cancelReason: string
  canceledById?: number
}

export interface ExaminationExecutionSummary {
  id: number
  orderId: number
  attemptNumber?: number
  status: string
  performedAt: string
  location: string
}

export interface MedicationSummary {
  id: number
  code: string
  name: string
  ingredient: string
  defaultUnit: string
  ingredientCode: string
  manufacturer: string
  dosageForm: string
  strength: string
}

export interface MedicationFavoriteSummary {
  id: number
  medicationId: number
  displayOrder: number
  medication: MedicationSummary
}

export type PrescriptionStatus =
  | 'DRAFT'
  | 'SIGNED'
  | 'CANCELED'

export interface PrescriptionSummary {
  id: number
  encounterId: number
  patientId: number
  prescribedById?: number
  status: PrescriptionStatus
  notes: string
  prescribedAt: string
  signedAt: string
  canceledAt: string
  cancelReason: string
  updatedAt: string
}

export interface PrescriptionItemSummary {
  id: number
  prescriptionId: number
  medicationId: number
  medication?: MedicationSummary
  status: string
  doseValue?: number
  doseUnit: string
  frequencyPerDay?: number
  durationDays?: number
  route: string
  instructions: string
  note: string
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export interface PrescriptionDetail {
  prescription: PrescriptionSummary
  items: PrescriptionItemSummary[]
}

export interface PrescriptionItemInput {
  medicationId?: number
  doseValue?: number
  doseUnit?: string
  frequencyPerDay?: number
  durationDays?: number
  route?: string
  instructions?: string
  note?: string
  startDate?: string
  endDate?: string
}

export interface StaffIdentity {
  id: number
  username: string
  name: string
  departmentName: string
  title: string
  roles: string[]
}

export interface StaffDoctor {
  id: number
  userId: number
  name: string
  departmentName: string
  title: string
  isActive: boolean
}

export type StaffScheduleType =
  | 'PERSONAL'
  | 'CLINICAL'
  | 'CONSULTATION'
  | 'ON_CALL'
  | 'OFF'

export interface StaffSchedule {
  id: number
  title: string
  type: StaffScheduleType
  startsAt: string
  endsAt: string
  description: string
  isAllDay: boolean
  color: string
  status: string
  ownerName: string
}

export interface StaffScheduleInput {
  title: string
  type: StaffScheduleType
  startsAt: string
  endsAt: string
  description?: string
  isAllDay?: boolean
  color?: string
}

export interface ScheduleChangeRequest {
  id: number
  scheduleId?: number
  requestType: 'UPDATE' | 'CANCEL'
  requestedScheduleType?: StaffScheduleType
  requestedStartsAt: string
  requestedEndsAt: string
  reason: string
  status: string
  requesterName: string
  reviewComment: string
  rejectionReason: string
  createdAt: string
}

export interface ConsultationSummary {
  id: number
  patientId?: number
  patientName: string
  subject: string
  requestNote: string
  requestedByName: string
  requestedById?: number
  requestedDepartmentName?: string
  patientNumber?: string
  patientLocation?: string
  assignedDoctorId?: number
  assignedDoctorName: string
  assignedDepartmentName?: string
  priority: 'NORMAL' | 'URGENT'
  status: 'REQUESTED' | 'ACCEPTED' | 'COMPLETED' | 'CANCELED'
  dueAt: string
  createdAt: string
}

export interface ConsultationOpinion {
  id: number
  doctorName: string
  opinionText: string
  isFinal: boolean
  createdAt: string
}

export interface ConsultationDetail {
  consultation: ConsultationSummary
  opinions: ConsultationOpinion[]
}

export interface ChatMember {
  id: number
  userId: number
  name: string
  username?: string
  departmentName?: string
  title?: string
  role: string
  status: string
}

export interface ChatMessage {
  id: number
  senderId?: number
  senderName: string
  messageType: string
  text: string
  createdAt: string
  deliveryStatus: string
  isDeleted: boolean
}

export interface ChatRoom {
  id: number
  title: string
  roomType: 'DIRECT' | 'GROUP' | 'CONSULTATION'
  status: string
  consultationId?: number
  createdAt: string
  members: ChatMember[]
  latestMessage?: ChatMessage
  unreadCount: number
}

export interface FollowUpMeasurement {
  id: number
  code: string
  name: string
  valueNumeric?: number
  valueText: string
  valueBoolean?: boolean
  unit: string
  abnormalFlag: 'NORMAL' | 'HIGH' | 'LOW' | string
  measuredAt: string
  referenceLow?: number
  referenceHigh?: number
  referenceRangeText?: string
}

export interface FollowUpExamination {
  orderId: number
  examinationId: number
  examinationType: ExaminationTypeSummary
  status: string
  performedAt: string
  location: string
  clinicalInput?: Record<string, number | string>
  result?: {
    id: number
    resultType: string
    status: string
    collectedAt: string
    summaryText: string
    measurements: FollowUpMeasurement[]
  }
}

export interface FollowUpVisit {
  stage: string
  stageLabel: string
  encounterId: number
  visitDate: string
  status: string
  doctor?: {
    id: number
    name: string
    departmentName: string
  }
  note: string
  examinations: FollowUpExamination[]
}

export interface PatientFollowUpRecords {
  patient: {
    id: number
    medicalRecordNo: string
    name: string
    sex?: 'M' | 'F'
    age?: number
  }
  programGroup: string
  isSyntheticDemo: boolean
  visitCount: number
  visits: FollowUpVisit[]
}

// 기존에 정의된 FrameRecord가 없다면 추가
export interface FrameRecord {
  patient_id: string | number;
  side: 'LEFT' | 'RIGHT';
  series_id: string | number;
  frame_index: number;
  image_path: string;
}

// ---------------------------------------------------------
// XCA 상세 분석(Detailed Analysis) 관련 타입
// ---------------------------------------------------------

export interface LocalizationComponent {
  bbox_xywh: [number, number, number, number]; // [x, y, w, h]
  area_pixels: number;
}

export interface LocalizationMask {
  encoding: 'png_base64';
  data: string; // Base64 인코딩된 PNG 문자열
  sha256: string;
  foreground_value: number;
  background_value: number;
  height: number;
  width: number;
}

export interface LocalizationTransform {
  source_hw: [number, number];
  model_hw: [number, number];
  shape_before_cropping: [number, number, number];
  shape_after_cropping_and_before_resampling: [number, number, number];
  bbox_used_for_cropping: [[number, number], [number, number], [number, number]];
  transpose_forward: [number, number, number];
  inverse_resampling: string;
  coordinate_space: string;
  clinical_geometry_validation: string;
}

export interface AngiographyFrameDetail {
  series_id: string;
  side: 'LEFT' | 'RIGHT';
  frame_index: number;
  source_png_sha256: string;
  features: Record<string, number>;
  localization: {
    label: string;
    validation: string;
    threshold: string;
    minimum_component_pixels_model_space: number;
    connectivity: number;
    model_component_count: number;
    source_components: LocalizationComponent[];
    transform: LocalizationTransform;
    mask: LocalizationMask | null; // 의심 영역이 없으면 null
  };
}

export interface AngiographySeriesExploratoryResult {
  series_id: string;
  side: string;
  n_frames: number;
  score_scope: string;
  classification_validation: string;
  classification: {
    side: string;
    features: Record<string, number>;
    any_stenosis: { ai_score: number; prediction: number };
    significant_stenosis: { ai_score: number; prediction: number };
    threshold: number;
  };
  suspected_frame_indices: number[];
  representative_frame_index: number | null;
  representative_selection: string;
}

export interface AngiographyDetailedResponse {
  detail_version: string;
  summary: Record<string, any>; // 기존 summary와 동일 구조 + processing_seconds 등
  series: AngiographySeriesExploratoryResult[];
  frames: AngiographyFrameDetail[];
  provenance: Record<string, string>;
  warnings: string[];
}

