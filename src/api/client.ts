import type {
  BackendCapabilities,
  ImagingAnnotationInput,
  ImagingAnnotationRecord,
  PatientApiScope,
  PatientPage,
  DashboardAIStatus,
  DashboardConsultationItem,
  DashboardExaminationStats,
  DashboardRecentPatient,
  DashboardSummary,
  DashboardWorkItem,
  AngiographyFrame,
  AngiographySequenceSummary,
  ChatMessage,
  ChatRoom,
  ConsultationDetail,
  ConsultationOpinion,
  ConsultationSummary,
  ExaminationOrderSummary,
  ExaminationExecutionSummary,
  ExaminationTypeSummary,
  ImagingFileAssetSummary,
  ImagingInstancePreview,
  ImagingInstanceSummary,
  ImagingSeriesViewerManifest,
  ImagingSeriesSummary,
  ImagingStudyComparison,
  ImagingStudyDetail,
  ImagingStudySummary,
  ImagingViewerAccess,
  LabObservation,
  MedicationFavoriteSummary,
  MedicationSummary,
  PatientDetail,
  PatientFollowUpRecords,
  PatientMemo,
  PatientSummary,
  PrescriptionDetail,
  PrescriptionItemInput,
  PrescriptionItemSummary,
  PrescriptionSummary,
  Rendering3DSummary,
  Rendering3DSourceSummary,
  Rendering3DViewerSource,
  RiskLevel,
  ScheduleChangeRequest,
  StaffDoctor,
  StaffIdentity,
  StaffNotification,
  StaffReservation,
  StaffSchedule,
  StaffScheduleInput,
  StaffScheduleType,
  StaffTodo,
  StaffTodoInput,
  TimelineItem,
  WorkStatus,
} from '../types'
import { coronarySideLabels, normalizeCoronarySide } from './angiographyGrouping'
import { fetchXCABridgeHealth, requestXCAAnalysis } from './xcaAnalysis'
import { listXCADetails, listXCAFrames, readXCAFrame, type XCADetailResult } from './xcaDetails'
import { prepareXCAReportTarget, readXCAReportTarget, attachXCAReportDraft, fetchXCAPDF, finalizeXCAReport, type XCAReportTarget, type XCAPDFPreview } from './xcaReport'
export function getXCAReportPDF(target: XCAReportTarget) {
  return fetchXCAPDF(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), target)
}
export function signXCAReport(target: XCAReportTarget, preview: XCAPDFPreview, reauth: string, confirmed: boolean) {
  return finalizeXCAReport(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), target, preview, reauth, confirmed)
}
export type { XCAAnalysisResult, XCABridgeHealth } from './xcaAnalysis'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const ACCESS_TOKEN_KEY = 'angiocad.staff.accessToken'
const REFRESH_TOKEN_KEY = 'angiocad.staff.refreshToken'

export const getXCABridgeHealth = fetchXCABridgeHealth
export function getSavedXCADetails(patientId: number, examinationId: number) {
  return listXCADetails(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), patientId, examinationId)
}
export function getSavedXCAFrames(detail: XCADetailResult, sequenceId: number) {
  return listXCAFrames(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), detail, sequenceId)
}
export function getSavedXCAFrame(detail: XCADetailResult, frameId: number) {
  return readXCAFrame(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), detail, frameId)
}
export function prepareXCAReport(patientId: number, encounterId: number) {
  return prepareXCAReportTarget(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), patientId, encounterId)
}
export function reloadXCAReport(target: XCAReportTarget) {
  return readXCAReportTarget(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), target.id, target.patientId, target.encounterId)
}
export function saveXCAReportDraft(detail: XCADetailResult, target: XCAReportTarget, frameIds: number[], reviewNote: string, reauthToken?: string) {
  return attachXCAReportDraft(API_BASE_URL, sessionStorage.getItem(ACCESS_TOKEN_KEY), detail, target, frameIds, reviewNote, reauthToken)
}
export function analyzeXCAExamination(patientId: number, examinationId: number) {
  return requestXCAAnalysis(patientId, examinationId, sessionStorage.getItem(ACCESS_TOKEN_KEY))
}

interface ApiErrorPayload {
  detail?: string
  message?: string
  code?: string
  [key: string]: unknown
}

interface StaffLoginResponse extends ApiErrorPayload {
  access?: string
  refresh?: string
  access_token?: string
  refresh_token?: string
  token?: string
  tokens?: {
    access?: string
    refresh?: string
  }
}

interface StaffPatientListResponse {
  count: number
  next: string | null
  previous: string | null
  results: StaffPatient[]
}

interface StaffPatient {
  id: number
  medical_record_no: string
  name: string
  birth_date: string
  gender: string
  contact: string
  status?: string
  registered_at: string
}

interface ApiDashboardSummary {
  date: string
  department_id: number | null
  patient_count: number
  examination_pending_count: number
  ai_pending_count: number
  consultation_pending_count: number
  signoff_pending_count: number
  total_pending_count: number
}

interface ApiDashboardAIStatus {
  date: string
  queued: number
  running: number
  failed: number
  completed: number
  cancelled: number
  total: number
}

interface ApiTimelineResponse {
  patient_id: number
  results: Array<{
    event_type: 'ENCOUNTER' | 'EXAMINATION' | 'AI_ANALYSIS' | 'REPORT'
    reference_id: number
    occurred_at: string
    title: string
    status: string | null
    summary: string | null
    data: unknown
  }>
}

type UnknownRecord = Record<string, unknown>

export class ApiError extends Error {
  status: number
  payload?: ApiErrorPayload

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

function getAccessTokenFromPayload(payload: StaffLoginResponse): string | undefined {
  return payload.access ?? payload.access_token ?? payload.token ?? payload.tokens?.access
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') || contentType.includes('+json')
    ? await response.json() as T & ApiErrorPayload
    : undefined

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | undefined
    throw new ApiError(
      errorPayload?.detail ?? errorPayload?.message ?? `API 요청에 실패했습니다. (${response.status})`,
      response.status,
      errorPayload,
    )
  }

  return payload as T
}

interface ApiRequestInit extends RequestInit {
  clearSessionOnUnauthorized?: boolean
  refreshOnUnauthorized?: boolean
}

let accessTokenRefreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (accessTokenRefreshPromise) return accessTokenRefreshPromise

  const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return null

  const operation = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/staff/refresh/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: refreshToken }),
      })

      if (!response.ok) return null

      const payload = await response.json() as StaffLoginResponse
      const accessToken = getAccessTokenFromPayload(payload)
      if (!accessToken) return null

      sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
      const nextRefreshToken =
        payload.refresh ?? payload.refresh_token ?? payload.tokens?.refresh
      if (nextRefreshToken) {
        sessionStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken)
      }

      return accessToken
    } catch {
      return null
    }
  })()

  accessTokenRefreshPromise = operation

  try {
    return await operation
  } finally {
    if (accessTokenRefreshPromise === operation) {
      accessTokenRefreshPromise = null
    }
  }
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const {
    clearSessionOnUnauthorized = true,
    refreshOnUnauthorized = clearSessionOnUnauthorized,
    ...requestInit
  } = init
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY)
  const headers = new Headers(requestInit.headers)
  headers.set('Accept', 'application/json')
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers,
  })

  if (response.status === 401 && refreshOnUnauthorized) {
    const refreshedAccessToken = await refreshAccessToken()
    if (refreshedAccessToken) {
      headers.set('Authorization', `Bearer ${refreshedAccessToken}`)
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...requestInit,
        headers,
      })
    }
  }

  if (response.status === 401 && clearSessionOnUnauthorized) clearSession()
  return parseResponse<T>(response)
}

export function postFormData<T>(path: string, body: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body })
}

function calculateAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(`${birthDate}T00:00:00`)
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return Number.isFinite(age) ? age : 0
}

function mapRisk(status?: string): RiskLevel {
  if (status === 'URGENT' || status === 'CRITICAL') return 'high'
  if (status === 'WARNING' || status === 'PENDING') return 'medium'
  return 'normal'
}

function mapWorkStatus(status?: string): WorkStatus {
  if (status === 'IN_PROGRESS' || status === 'PROCESSING') return 'running'
  if (status === 'DONE' || status === 'COMPLETED') return 'complete'
  if (status === 'URGENT' || status === 'CRITICAL') return 'urgent'
  return 'waiting'
}

function mapPatient(patient: StaffPatient): PatientSummary {
  const risk = mapRisk(patient.status)
  return {
    backendId: patient.id,
    id: patient.medical_record_no,
    name: patient.name,
    sex: patient.gender.toUpperCase().startsWith('F') ? 'F' : 'M',
    age: calculateAge(patient.birth_date),
    exam: '진료 기록',
    risk,
    status: mapWorkStatus(patient.status),
    note: patient.status === 'ACTIVE' ? '활성 환자' : patient.status ?? '환자 정보',
  }
}

function formatTimelineDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: UnknownRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function readNumber(record: UnknownRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function extractList(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }
  
  if (!isRecord(payload)) {
    return []
  }

  for (const key of [
    'results', 
    'items', 
    'data', 
    'studies',
    'memos',
    'schedules',
    'requests',
    'consultations',
    'rooms',
    'messages',
  ]) {
    const value = payload[key]

    if (Array.isArray(value)) {
      return value.filter(isRecord)
    }

    if (isRecord(value)) {
      const nestedItems = extractList(value)

      if (nestedItems.length > 0) {
        return nestedItems
      }
    }
  }

  return []
}

function mapPatientMemo(
  memo: UnknownRecord,
): PatientMemo | null {
  const id = readNumber(memo, 'id', 'memo_id')

  if (id === undefined) {
    return null
  }

  const authorValue =
    memo.author ??
    memo.created_by ??
    memo.staff ??
    memo.writer

  let authorName = readString(
    memo,
    'author_name',
    'writer_name',
    'staff_name',
  )

  if (!authorName && isRecord(authorValue)) {
    authorName =
      readString(
        authorValue,
        'name',
        'full_name',
        'username',
      ) || '의료진'
  }

  return {
    id,
    content: readString(
      memo,
      'memo_text',
      'content',
      'memo',
      'body',
      'text',
    ),
    authorName: authorName || '의료진',
    createdAt: readString(
      memo,
      'created_at',
      'createdAt',
    ),
    updatedAt:
      readString(memo, 'updated_at', 'updatedAt') ||
      readString(memo, 'created_at', 'createdAt'),
  }
}


function mapImagingStudy(study: UnknownRecord): ImagingStudySummary | null {
  const id = readNumber(study, 'id', 'study_id')
  if (id === undefined) return null

  return {
    id,
    examinationId: readNumber(study, 'examination_id', 'examination'),
    studyInstanceUid: readString(
      study,
      'study_instance_uid',
      'studyInstanceUid',
      'orthanc_study_id',
      'study_uid',
    ),
    orthancStudyId: readString(study, 'orthanc_study_id', 'orthancStudyId'),
    modality: readString(study, 'modality') || '영상',
    description:
      readString(study, 'description', 'study_description', 'title') ||
      '영상검사',
    studyDate: readString(
      study,
      'study_date',
      'performed_at',
      'acquired_at',
      'created_at',
    ),
    status: readString(study, 'status') || 'UNKNOWN',
    seriesCount: readNumber(study, 'series_count', 'number_of_series'),
    instanceCount: readNumber(study, 'instance_count', 'number_of_instances'),
  }
}

function mapImagingFileAsset(value: unknown): ImagingFileAssetSummary | undefined {
  if (!isRecord(value)) return undefined
  const id = readNumber(value, 'id', 'file_id')
  if (id === undefined) return undefined
  return {
    id,
    storageBackend: readString(value, 'storage_backend', 'storageBackend'),
    bucketName: readString(value, 'bucket_name', 'bucketName'),
    objectKey: readString(value, 'object_key', 'objectKey'),
    orthancResourceId: readString(value, 'orthanc_resource_id', 'orthancResourceId'),
    mimeType: readString(value, 'mime_type', 'mimeType'),
  }
}

function mapImagingSeries(series: UnknownRecord): ImagingSeriesSummary | null {
  const id = readNumber(series, 'id', 'series_id')
  const studyId = readNumber(series, 'imaging_study', 'study_id')
  if (id === undefined || studyId === undefined) return null
  return {
    id,
    studyId,
    seriesInstanceUid: readString(series, 'series_instance_uid', 'seriesInstanceUid'),
    orthancSeriesId: readString(series, 'orthanc_series_id', 'orthancSeriesId'),
    seriesNumber: readNumber(series, 'series_number', 'seriesNumber'),
    modality: readString(series, 'modality') || '영상',
    bodySite: readString(series, 'body_site', 'bodySite'),
    description:
      readString(series, 'series_description', 'description', 'title') ||
      `Series ${readNumber(series, 'series_number', 'seriesNumber') ?? id}`,
    instanceCount: readNumber(series, 'instance_count', 'instanceCount') ?? 0,
  }
}

function mapImagingInstance(instance: UnknownRecord): ImagingInstanceSummary | null {
  const id = readNumber(instance, 'id', 'instance_id')
  const seriesId = readNumber(instance, 'imaging_series', 'series_id')
  if (id === undefined || seriesId === undefined) return null
  return {
    id,
    seriesId,
    sopInstanceUid: readString(instance, 'sop_instance_uid', 'sopInstanceUid'),
    orthancInstanceId: readString(instance, 'orthanc_instance_id', 'orthancInstanceId'),
    sopClassUid: readString(instance, 'sop_class_uid', 'sopClassUid'),
    instanceNumber: readNumber(instance, 'instance_number', 'instanceNumber'),
    fileAsset: mapImagingFileAsset(instance.file_asset ?? instance.fileAsset),
    createdAt: readString(instance, 'created_at', 'createdAt'),
  }
}

export function hasSession(): boolean {
  return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY))
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

export async function loginStaff(username: string, password: string): Promise<void> {
  const payload = await request<StaffLoginResponse>('/api/auth/staff/login/', {
    method: 'POST',
    refreshOnUnauthorized: false,
    body: JSON.stringify({
      username,
      password,
      client_type: 'REACT_WEB',
      platform: 'WINDOWS',
      device_name: 'AngioCAD Clinician Web',
    }),
  })

  const accessToken = getAccessTokenFromPayload(payload)
  if (!accessToken) throw new ApiError('로그인 응답에서 access token을 찾지 못했습니다.', 500, payload)
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  const refreshToken = payload.refresh ?? payload.refresh_token ?? payload.tokens?.refresh
  if (refreshToken) sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export async function logoutStaff(): Promise<void> {
  try {
    await request<void>('/api/auth/staff/logout/', {
      method: 'POST',
      refreshOnUnauthorized: false,
    })
  } finally {
    clearSession()
  }
}

export async function reauthenticateStaff(password: string): Promise<string> {
  const payload = await request<unknown>('/api/staff/reauthenticate/', {
    method: 'POST',
    body: JSON.stringify({
      auth_method: 'PASSWORD',
      credential: password,
    }),
  })

  if (!isRecord(payload)) {
    throw new ApiError('재인증 응답을 확인하지 못했습니다.', 500)
  }

  const reauthToken = readString(payload, 'reauth_token')
  if (!reauthToken) {
    throw new ApiError('재인증 토큰을 확인하지 못했습니다.', 500, payload)
  }

  return reauthToken
}

export interface PatientSearchFilters {
  patientScope?: PatientApiScope
  page?: number
  size?: number
  examDateFrom?: string
  examDateTo?: string
  examinationTypeId?: number
  examinationStatus?: string
  aiStatus?: string
  doctorId?: number
}

export async function getPatients(
  search = '',
  assignedToMe = false,
  filters: PatientSearchFilters = {},
): Promise<PatientSummary[]> {
  return (await getPatientsPage(search, assignedToMe, filters)).results
}

export async function getBackendCapabilities(): Promise<BackendCapabilities> {
  try {
    const schema = await request<unknown>('/api/schema/?format=json')
    const paths = isRecord(schema) && isRecord(schema.paths) ? schema.paths : {}
    const patients = Object.entries(paths).find(([path]) => /\/patients\/$/.test(path))?.[1]
    const operation = isRecord(patients) && isRecord(patients.get) ? patients.get : undefined
    const parameters = operation && Array.isArray(operation.parameters) ? operation.parameters.filter(isRecord) : []
    // 감사 이력은 전용 audit-logs 엔드포인트 대신 공용 /api/admin/audit-events/ 로 조회하므로
    // referenceAdministration 판정에서 audit-logs 경로 존재 여부는 더 이상 확인하지 않는다.
    const referenceRangeCreateMethods = Object.entries(paths)
      .find(([path]) => /\/examinations\/clinical-variables\/\{[^/]+\}\/reference-ranges\/$/.test(path))?.[1]
    return {
      patientScope: parameters.some((parameter) => parameter.name === 'patient_scope'),
      referenceAdministration: Object.entries(paths).some(([path, methods]) => /\/admin\/reference-ranges\/\{[^/]+\}\/$/.test(path) && isRecord(methods) && Boolean(methods.patch)),
      referenceRangeCreate: isRecord(referenceRangeCreateMethods) && Boolean(referenceRangeCreateMethods.post),
    }
  } catch {
    return { patientScope: false, referenceAdministration: false, referenceRangeCreate: false }
  }
}

let capabilitiesPromise: Promise<BackendCapabilities> | undefined
function capabilities() {
  return capabilitiesPromise ??= getBackendCapabilities()
}

export async function getPatientsPage(
  search = '', assignedToMe = false, filters: PatientSearchFilters = {},
): Promise<PatientPage> {
  const page = filters.page ?? 1
  const size = filters.size ?? 50
  const scope = filters.patientScope ?? (assignedToMe ? 'ASSIGNED_TO_ME' : 'ALL_ACCESSIBLE')
  const supportsScope = (await capabilities()).patientScope
  const params = new URLSearchParams({ size: String(size), page: String(page), scope: 'all' })
  if (search.trim()) params.set('search', search.trim())
  if (supportsScope) params.set('patient_scope', scope)
  else if (scope === 'ASSIGNED_TO_ME') params.set('assigned_to_me', 'true')
  if (filters.examDateFrom) params.set('exam_date_from', filters.examDateFrom)
  if (filters.examDateTo) params.set('exam_date_to', filters.examDateTo)
  if (filters.examinationTypeId) params.set('examination_type_id', String(filters.examinationTypeId))
  if (filters.examinationStatus) params.set('examination_status', filters.examinationStatus)
  if (filters.aiStatus) params.set('ai_status', filters.aiStatus)
  if (filters.doctorId) params.set('doctor_id', String(filters.doctorId))
  if (!supportsScope && (scope === 'CONSULTATION' || scope === 'RECENT')) {
    const ids = scope === 'RECENT'
      ? (await getDashboardRecentPatients()).map((item) => item.patientId)
      : (await getConsultations()).filter((item) => !['COMPLETED', 'CANCELED', 'CANCELLED'].includes(item.status)).map((item) => item.patientId)
    const allowedIds = new Set(ids)
    const matched: StaffPatient[] = []
    params.set('page', '1')
    params.set('size', '100')
    if (allowedIds.size) {
      let scanPage = 1
      while (true) {
        params.set('page', String(scanPage))
        const batch = await request<StaffPatientListResponse>(`/api/patients/?${params.toString()}`)
        matched.push(...batch.results.filter((item) => allowedIds.has(item.id)))
        if (!batch.next || matched.length === allowedIds.size) break
        scanPage += 1
      }
    }
    if (scope === 'RECENT') matched.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    return { results: matched.slice((page - 1) * size, page * size).map(mapPatient), count: matched.length, page, hasNext: page * size < matched.length }
  }
  const payload = await request<StaffPatientListResponse>(`/api/patients/?${params.toString()}`)
  return { results: payload.results.map(mapPatient), count: payload.count, page, hasNext: Boolean(payload.next) }
}

export async function getPatientDetail(
  patientId: number,
): Promise<PatientDetail> {
  const patient = await request<StaffPatient>(
    `/api/patients/${patientId}/`,
  )

  return {
    backendId: patient.id,
    medicalRecordNo: patient.medical_record_no,
    name: patient.name,
    birthDate: patient.birth_date,
    sex: patient.gender.toUpperCase().startsWith('F') ? 'F' : 'M',
    age: calculateAge(patient.birth_date),
    contact: patient.contact,
    status: patient.status ?? 'UNKNOWN',
    registeredAt: patient.registered_at,
  }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const payload = await request<ApiDashboardSummary>('/api/dashboard/summary/')
  return {
    date: payload.date,
    patientCount: payload.patient_count,
    examinationPendingCount: payload.examination_pending_count,
    aiPendingCount: payload.ai_pending_count,
    consultationPendingCount: payload.consultation_pending_count,
    signoffPendingCount: payload.signoff_pending_count,
    totalPendingCount: payload.total_pending_count,
  }
}

export async function getDashboardAIStatus(): Promise<DashboardAIStatus> {
  const payload = await request<ApiDashboardAIStatus>('/api/dashboard/ai-status/')
  return payload
}

export async function getDashboardWorkItems(): Promise<DashboardWorkItem[]> {
  const payload = await request<unknown>('/api/dashboard/work-items/')
  return extractList(payload).map((item) => ({
    id: readNumber(item, 'id') ?? 0,
    patientId: readNumber(item, 'patient', 'patient_id'),
    workType: readString(item, 'work_type', 'workType'),
    referenceType: readString(item, 'reference_type', 'referenceType'),
    referenceId: readNumber(item, 'reference_id', 'referenceId'),
    priority: readString(item, 'priority') || 'NORMAL',
    status: readString(item, 'status') || 'TODO',
    dueAt: readString(item, 'due_at', 'dueAt'),
    createdAt: readString(item, 'created_at', 'createdAt'),
    completedAt: readString(item, 'completed_at', 'completedAt'),
  })).filter((item) => item.id > 0)
}

export async function getDashboardConsultations(): Promise<DashboardConsultationItem[]> {
  const payload = await request<unknown>('/api/dashboard/consultations/')
  return extractList(payload).map((item) => ({
    id: readNumber(item, 'id') ?? 0,
    patientId: readNumber(item, 'patient_id', 'patient'),
    patientName: readString(item, 'patient_name') || '환자 정보 없음',
    requestedById: readNumber(item, 'requested_by_id', 'requested_by'),
    assignedDoctorId: readNumber(item, 'assigned_doctor_id', 'assigned_doctor'),
    subject: readString(item, 'subject') || '협진 요청',
    priority: readString(item, 'priority') || 'NORMAL',
    status: readString(item, 'status') || 'REQUESTED',
    dueAt: readString(item, 'due_at'),
    createdAt: readString(item, 'created_at'),
    opinionCount: readNumber(item, 'opinion_count') ?? 0,
    hasResponse: Boolean(item.has_response),
  })).filter((item) => item.id > 0)
}

export async function getDashboardRecentPatients(): Promise<DashboardRecentPatient[]> {
  const payload = await request<unknown>('/api/dashboard/recent-patients/')
  return extractList(payload).map((item) => ({
    patientId: readNumber(item, 'patient_id', 'patient') ?? 0,
    medicalRecordNo: readString(item, 'medical_record_no'),
    name: readString(item, 'name') || '이름 없음',
    birthDate: readString(item, 'birth_date'),
    gender: readString(item, 'gender'),
    status: readString(item, 'status'),
    lastViewedAt: readString(item, 'last_viewed_at'),
  })).filter((item) => item.patientId > 0)
}

export async function getDashboardExaminationStats(): Promise<DashboardExaminationStats> {
  const statuses = ['ORDERED', 'SCHEDULED', 'COMPLETED'] as const
  const payloads = await Promise.all(
    statuses.map((status) =>
      request<unknown>(`/api/examinations/orders/?status=${status}`),
    ),
  )

  return {
    scheduled: extractList(payloads[0]).length,
    inProgress: extractList(payloads[1]).length,
    completed: extractList(payloads[2]).length,
  }
}

export async function getStaffReservations(
  date: string,
  doctorId?: number,
): Promise<StaffReservation[]> {
  const params = new URLSearchParams({ date })
  if (doctorId) params.set('doctor_id', String(doctorId))
  const payload = await request<unknown>(`/api/staff/reservations/?${params}`)
  return extractList(payload).map((item) => ({
    id: readNumber(item, 'id') ?? 0,
    patientId: readNumber(item, 'patient', 'patient_id'),
    doctorId: readNumber(item, 'doctor', 'doctor_id'),
    applicantName: readString(item, 'applicant_name', 'patient_name') || '예약 환자',
    reservedAt: readString(item, 'reserved_at'),
    status: readString(item, 'status') || 'REQUESTED',
  })).filter((item) => item.id > 0)
}

function mapStaffTodo(item: UnknownRecord): StaffTodo | null {
  const id = readNumber(item, 'id')
  if (id === undefined) return null
  return {
    id,
    title: readString(item, 'title') || '할 일',
    status: readString(item, 'status') || 'TODO',
    priority: readString(item, 'priority') || 'NORMAL',
    dueAt: readString(item, 'due_at'),
    completedAt: readString(item, 'completed_at'),
    description: readString(item, 'description'),
  }
}

export async function getStaffTodos(): Promise<StaffTodo[]> {
  const payload = await request<unknown>('/api/staff/todos/')
  return extractList(payload)
    .map(mapStaffTodo)
    .filter((item): item is StaffTodo => item !== null)
}

export async function createStaffTodo(input: StaffTodoInput): Promise<StaffTodo> {
  const payload = await request<unknown>('/api/staff/todos/', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      priority: input.priority ?? 'NORMAL',
      due_at: input.dueAt ?? null,
      description: input.description ?? '',
    }),
  })
  if (!isRecord(payload)) throw new ApiError('To-do 등록 응답 형식이 올바르지 않습니다.', 500)
  const todo = mapStaffTodo(payload)
  if (!todo) throw new ApiError('등록된 To-do 정보를 확인하지 못했습니다.', 500)
  return todo
}

export async function updateStaffTodo(
  todoId: number,
  input: Partial<StaffTodoInput> & { status?: string },
): Promise<StaffTodo> {
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.title = input.title
  if (input.status !== undefined) body.status = input.status
  if (input.priority !== undefined) body.priority = input.priority
  if (input.dueAt !== undefined) body.due_at = input.dueAt
  if (input.description !== undefined) body.description = input.description
  const payload = await request<unknown>(`/api/staff/todos/${todoId}/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  if (!isRecord(payload)) throw new ApiError('To-do 수정 응답 형식이 올바르지 않습니다.', 500)
  const todo = mapStaffTodo(payload)
  if (!todo) throw new ApiError('수정된 To-do 정보를 확인하지 못했습니다.', 500)
  return todo
}

export async function deleteStaffTodo(todoId: number): Promise<void> {
  await request<void>(`/api/staff/todos/${todoId}/`, { method: 'DELETE' })
}

export async function getPatientTimeline(
  patientId: number,
): Promise<TimelineItem[]> {
  const payload = await request<ApiTimelineResponse>(
    `/api/patients/${patientId}/timeline`,
  )

  return payload.results.map((item, index) => ({
    date: formatTimelineDate(item.occurred_at),
    title: item.title,
    detail: 
      item.summary ?? 
      item.status ?? 
      item.event_type,
    active: index === 0,
    eventType: item.event_type,
    referenceId: item.reference_id,
    status: item.status ?? undefined,
  }))
}

export async function getImagingStudies(
  patientId: number,
  modality = '',
): Promise<ImagingStudySummary[]> {
  const params = new URLSearchParams({ patient_id: String(patientId) })
  if (modality.trim()) params.set('modality', modality.trim())
  const payload = await request<unknown>(
    `/api/imaging-studies/?${params.toString()}`,
  )

  return extractList(payload)
    .map(mapImagingStudy)
    .filter((study): study is ImagingStudySummary => study !== null)
}

export async function getImagingStudyDetail(
  studyId: number,
): Promise<ImagingStudyDetail> {
  const payload = await request<unknown>(`/api/imaging-studies/${studyId}/`)
  if (!isRecord(payload)) {
    throw new ApiError('영상검사 상세 응답 형식이 올바르지 않습니다.', 500)
  }
  const study = mapImagingStudy(payload)
  if (!study) throw new ApiError('영상검사 상세정보를 확인하지 못했습니다.', 500)
  const series = Array.isArray(payload.series)
    ? payload.series
        .filter(isRecord)
        .map(mapImagingSeries)
        .filter((item): item is ImagingSeriesSummary => item !== null)
    : []
  return { ...study, series }
}

export async function getImagingStudySeries(
  studyId: number,
): Promise<ImagingSeriesSummary[]> {
  const payload = await request<unknown>(`/api/imaging-studies/${studyId}/series/`)
  return extractList(payload)
    .map(mapImagingSeries)
    .filter((item): item is ImagingSeriesSummary => item !== null)
}

export async function getComparableImagingStudies(
  studyId: number,
): Promise<ImagingStudyComparison> {
  const payload = await request<unknown>(`/api/imaging-studies/${studyId}/compare/`)
  if (!isRecord(payload) || !isRecord(payload.current)) {
    throw new ApiError('비교 영상 목록 응답 형식이 올바르지 않습니다.', 500)
  }
  const current = mapImagingStudy(payload.current)
  if (!current) throw new ApiError('현재 영상검사 정보를 확인하지 못했습니다.', 500)
  const candidates = Array.isArray(payload.comparison_candidates)
    ? payload.comparison_candidates
        .filter(isRecord)
        .map(mapImagingStudy)
        .filter((item): item is ImagingStudySummary => item !== null)
    : []
  return { current, candidates }
}

export async function getImagingStudyViewerAccess(
  studyId: number,
): Promise<ImagingViewerAccess> {
  const payload = await request<unknown>(`/api/imaging-studies/${studyId}/viewer-token/`)
  if (!isRecord(payload)) {
    throw new ApiError('영상 뷰어 인증 응답 형식이 올바르지 않습니다.', 500)
  }
  const viewerToken = readString(payload, 'viewer_token', 'viewerToken')
  if (!viewerToken) throw new ApiError('영상 뷰어 토큰이 없습니다.', 409)
  return {
    studyId: readNumber(payload, 'study_id', 'studyId') ?? studyId,
    orthancStudyId: readString(payload, 'orthanc_study_id', 'orthancStudyId'),
    viewerToken,
    expiresIn: readNumber(payload, 'expires_in', 'expiresIn') ?? 300,
    viewerUrl: readString(payload, 'viewer_url', 'viewerUrl'),
  }
}

export async function getImagingSeriesDetail(
  seriesId: number,
): Promise<ImagingSeriesSummary & { instances: ImagingInstanceSummary[] }> {
  const payload = await request<unknown>(`/api/imaging-series/${seriesId}/`)
  if (!isRecord(payload)) {
    throw new ApiError('영상 Series 상세 응답 형식이 올바르지 않습니다.', 500)
  }
  const series = mapImagingSeries(payload)
  if (!series) throw new ApiError('영상 Series 정보를 확인하지 못했습니다.', 500)
  const instances = Array.isArray(payload.instances)
    ? payload.instances
        .filter(isRecord)
        .map(mapImagingInstance)
        .filter((item): item is ImagingInstanceSummary => item !== null)
    : []
  return { ...series, instances }
}

export async function getImagingSeriesInstances(
  seriesId: number,
): Promise<ImagingInstanceSummary[]> {
  const payload = await request<unknown>(`/api/imaging-series/${seriesId}/instances/`)
  return extractList(payload)
    .map(mapImagingInstance)
    .filter((item): item is ImagingInstanceSummary => item !== null)
}

function readNumberList(record: UnknownRecord, ...keys: string[]): number[] | undefined {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      const numbers = value.map(Number).filter(Number.isFinite)
      if (numbers.length) return numbers
    }
    if (typeof value === 'string') {
      const numbers = value.split(/[\\,]/).map((item) => Number(item.trim())).filter(Number.isFinite)
      if (numbers.length) return numbers
    }
  }
  return undefined
}

export async function getImagingSeriesViewerManifest(
  seriesId: number,
): Promise<ImagingSeriesViewerManifest> {
  const payload = await request<unknown>(
    `/api/imaging-series/${seriesId}/viewer-manifest/`,
  )
  if (!isRecord(payload)) {
    throw new ApiError('DICOM viewer manifest 응답 형식이 올바르지 않습니다.', 500)
  }

  const study = isRecord(payload.study) ? payload.study : {}
  const series = isRecord(payload.series) ? payload.series : {}
  const instances = Array.isArray(payload.instances)
    ? payload.instances.filter(isRecord).map((instance, index) => ({
        id: readNumber(instance, 'id', 'instance_id') ?? index + 1,
        sopInstanceUid: readString(instance, 'sop_instance_uid', 'sopInstanceUid'),
        instanceNumber: readNumber(instance, 'instance_number', 'instanceNumber'),
        dicomUrl: readString(instance, 'dicom_url', 'dicomUrl'),
        imagePositionPatient: readNumberList(instance, 'image_position_patient', 'imagePositionPatient'),
        imageOrientationPatient: readNumberList(instance, 'image_orientation_patient', 'imageOrientationPatient'),
        sliceLocation: readNumber(instance, 'slice_location', 'sliceLocation'),
      })).filter((instance) => Boolean(instance.dicomUrl))
    : []

  return {
    studyId: readNumber(study, 'id', 'study_id') ?? 0,
    seriesId: readNumber(series, 'id', 'series_id') ?? seriesId,
    studyInstanceUid: readString(study, 'study_instance_uid', 'studyInstanceUid'),
    seriesInstanceUid: readString(series, 'series_instance_uid', 'seriesInstanceUid'),
    modality: readString(series, 'modality') || readString(study, 'modality'),
    instanceCount: readNumber(payload, 'instance_count', 'instanceCount') ?? instances.length,
    instances,
  }
}

function resolveBinaryApiUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname.startsWith('/api/')) {
      return `${API_BASE_URL}${parsed.pathname}${parsed.search}`
    }
  } catch {
    // Keep non-standard signed URLs unchanged and let fetch report the error.
  }
  return url.startsWith('/api/') ? `${API_BASE_URL}${url}` : url
}

export async function getImagingDicomBlob(dicomUrl: string, signal?: AbortSignal): Promise<Blob> {
  const targetUrl = resolveBinaryApiUrl(dicomUrl)
  let token = sessionStorage.getItem(ACCESS_TOKEN_KEY)
  const createHeaders = () => {
    // DRF negotiates its API renderer before the view returns the binary HttpResponse.
    const headers = new Headers({ Accept: '*/*' })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  }

  let response = await fetch(targetUrl, { headers: createHeaders(), signal })
  if (response.status === 401) {
    token = await refreshAccessToken()
    if (token) response = await fetch(targetUrl, { headers: createHeaders(), signal })
  }
  if (response.status === 401) clearSession()
  if (!response.ok) {
    throw new ApiError(`DICOM 원본 파일을 불러오지 못했습니다. (${response.status})`, response.status)
  }
  return response.blob()
}

export async function getImagingInstanceDetail(
  instanceId: number,
): Promise<ImagingInstanceSummary> {
  const payload = await request<unknown>(`/api/imaging-instances/${instanceId}/`)
  if (!isRecord(payload)) {
    throw new ApiError('DICOM Instance 상세 응답 형식이 올바르지 않습니다.', 500)
  }
  const instance = mapImagingInstance(payload)
  if (!instance) throw new ApiError('DICOM Instance 정보를 확인하지 못했습니다.', 500)
  return instance
}

export async function getImagingInstancePreview(
  instanceId: number,
): Promise<ImagingInstancePreview> {
  const payload = await request<unknown>(`/api/imaging-instances/${instanceId}/preview/`)
  if (!isRecord(payload)) {
    throw new ApiError('DICOM 미리보기 응답 형식이 올바르지 않습니다.', 500)
  }
  const source = isRecord(payload.preview_source) ? payload.preview_source : payload
  return {
    instanceId: readNumber(payload, 'instance_id', 'instanceId') ?? instanceId,
    orthancInstanceId: readString(source, 'orthanc_instance_id', 'orthancInstanceId'),
    fileAsset: mapImagingFileAsset(source.file_asset ?? source.fileAsset),
    previewUrl:
      readString(payload, 'preview_url', 'previewUrl', 'url', 'download_url') ||
      readString(source, 'preview_url', 'previewUrl', 'url', 'download_url'),
  }
}

function mapObservationFlag(
  resource: UnknownRecord,
  value: number | undefined,
  low: number | undefined,
  high: number | undefined,
): LabObservation['flag'] {
  const interpretations = Array.isArray(resource.interpretation)
    ? resource.interpretation.filter(isRecord)
    : []
  const codes = interpretations.flatMap((interpretation) => {
    const coding = Array.isArray(interpretation.coding)
      ? interpretation.coding.filter(isRecord)
      : []
    return coding.map((item) => readString(item, 'code').toUpperCase())
  })

  if (codes.some((code) => ['HH', 'CRITICAL_HIGH'].includes(code))) return 'CRITICAL_HIGH'
  if (codes.some((code) => ['LL', 'CRITICAL_LOW'].includes(code))) return 'CRITICAL_LOW'
  if (codes.some((code) => ['H', 'HIGH'].includes(code))) return 'HIGH'
  if (codes.some((code) => ['L', 'LOW'].includes(code))) return 'LOW'
  if (codes.includes('N') || codes.includes('NORMAL')) return 'NORMAL'
  if (codes.some((code) => ['A', 'AA', 'ABNORMAL'].includes(code))) return 'ABNORMAL'
  if (value !== undefined && high !== undefined && value > high) return 'HIGH'
  if (value !== undefined && low !== undefined && value < low) return 'LOW'
  if (value !== undefined && (low !== undefined || high !== undefined)) return 'NORMAL'
  return 'UNKNOWN'
}

export async function getPatientLabObservations(
  patientId: number,
  followUpRecords?: PatientFollowUpRecords,
): Promise<LabObservation[]> {
  let nativeItems: LabObservation[] = []
  let followup = followUpRecords
  if (!followup) {
    try {
      followup = await getPatientFollowUpRecords(patientId)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error
    }
  }
  if (followup && followup.patient.id !== patientId) {
    throw new Error('선택한 환자와 추적검사 기록이 일치하지 않습니다.')
  }
  const labExaminations = (followup?.visits ?? []).flatMap((visit) =>
    visit.examinations
      .filter((exam) => exam.result?.resultType === 'LAB_PANEL' && exam.result.status === 'FINAL')
      .map((exam) => ({ exam, visit })),
  )
  if (labExaminations.length > 0) {
    const results = await Promise.all(labExaminations.map(async ({ exam, visit }) => {
      const detail = await request<unknown>(`/api/examinations/results/${exam.result!.id}/`)
      if (!isRecord(detail) || !Array.isArray(detail.measurements)) {
        throw new Error('혈액검사 상세 응답에 측정값이 없습니다.')
      }
      const result = isRecord(detail.result) ? detail.result : null
      return detail.measurements.filter(isRecord).map((measurement): LabObservation => {
        const snapshot = isRecord(measurement.reference_range_snapshot_json)
          ? measurement.reference_range_snapshot_json : isRecord(measurement.reference_range_snapshot)
          ? measurement.reference_range_snapshot : measurement
        const interpretation = readString(measurement, 'interpretation_code').toUpperCase()
        const flag = interpretation || readString(measurement, 'abnormal_flag').toUpperCase()
        return {
          id: `measurement-${readNumber(measurement, 'id')}`,
          measurementId: readNumber(measurement, 'measurement_id', 'id'),
          clinicalVariableId: readNumber(measurement, 'clinical_variable_id', 'clinical_variable'),
          resultId: exam.result!.id,
          resultStatus: exam.result!.status,
          examinationId: exam.examinationId,
          stageLabel: visit.stageLabel,
          code: readString(measurement, 'code'),
          name: readString(measurement, 'display_name', 'name'),
          value: readNumber(measurement, 'value_numeric', 'value'),
          textValue: readString(measurement, 'value_text'),
          unit: readString(measurement, 'unit'),
          measuredAt: readString(measurement, 'measured_at') ||
            (result ? readString(result, 'collected_at') : '') ||
            exam.result!.collectedAt || exam.performedAt || visit.visitDate,
          referenceLow: readNumber(snapshot, 'reference_min', 'lower_bound', 'reference_lower_bound'),
          referenceHigh: readNumber(snapshot, 'reference_max', 'upper_bound', 'reference_upper_bound'),
          referenceRangeText: readString(snapshot, 'reference_text', 'display_text', 'reference_range_text'),
          referenceRangeId: readNumber(snapshot, 'reference_range_id', 'applied_reference_range_id'),
          specimenType: readString(measurement, 'specimen_type'),
          method: readString(measurement, 'method', 'test_method'),
          fasting: typeof measurement.is_fasting === 'boolean' ? measurement.is_fasting : typeof measurement.fasting === 'boolean' ? measurement.fasting : undefined,
          interpretationCode: interpretation,
          flag: normalizeLabFlag(flag),
        }
      })
    }))
    const unique = new Map(results.flat().map((item) => [item.id, item]))
    nativeItems = [...unique.values()]
  }

  let payload: unknown
  try {
    payload = await getFhirObservationBundle(patientId)
  } catch (error) {
    if (!nativeItems.length || (error instanceof ApiError && error.status === 401)) throw error
    return nativeItems.map((item) => ({ ...item, sourceWarning: '추가 완료 검사 이력을 조회하지 못했습니다. 추적검사 결과만 표시합니다.' }))
  }

  if (!isRecord(payload) || !Array.isArray(payload.entry)) return nativeItems

  const fhirItems = payload.entry
    .filter(isRecord)
    .map((entry, index): LabObservation | null => {
      const resource = isRecord(entry.resource) ? entry.resource : null
      if (!resource || readString(resource, 'resourceType') !== 'Observation') return null
      if (resource.status && !['final', 'amended', 'corrected'].includes(readString(resource, 'status'))) return null
      const subject = isRecord(resource.subject) ? readString(resource.subject, 'reference') : ''
      if (subject && !subject.endsWith(`Patient/${patientId}`)) return null

      const code = isRecord(resource.code) ? resource.code : null
      const coding = code && Array.isArray(code.coding)
        ? code.coding.filter(isRecord)[0]
        : null
      const quantity = isRecord(resource.valueQuantity) ? resource.valueQuantity : null
      const referenceRange = Array.isArray(resource.referenceRange)
        ? resource.referenceRange.filter(isRecord)[0]
        : null
      const lowRecord = referenceRange && isRecord(referenceRange.low) ? referenceRange.low : null
      const highRecord = referenceRange && isRecord(referenceRange.high) ? referenceRange.high : null
      const value = quantity ? readNumber(quantity, 'value') : undefined
      const referenceLow = lowRecord ? readNumber(lowRecord, 'value') : undefined
      const referenceHigh = highRecord ? readNumber(highRecord, 'value') : undefined

      return {
        id: /^\d+$/.test(readString(resource, 'id')) ? `measurement-${readString(resource, 'id')}` : readString(resource, 'id') || `observation-${index}`,
        measurementId: /^\d+$/.test(readString(resource, 'id')) ? Number(resource.id) : undefined,
        code: (coding ? readString(coding, 'code') : '') || `LAB-${index + 1}`,
        name:
          (coding ? readString(coding, 'display') : '') ||
          (code ? readString(code, 'text') : '') ||
          '검사항목',
        value,
        textValue: readString(resource, 'valueString'),
        unit: quantity ? readString(quantity, 'unit', 'code') : '',
        measuredAt: readString(
          resource,
          'effectiveDateTime',
          'issued',
          'measured_at',
        ),
        referenceLow,
        referenceHigh,
        referenceRangeText: referenceRange ? readString(referenceRange, 'text') : '',
        method: isRecord(resource.method) ? readString(resource.method, 'text') || codingText(resource.method) : '',
        specimenType: isRecord(resource.specimen) ? readString(resource.specimen, 'display') : '',
        fasting: fhirFasting(resource),
        flag: mapObservationFlag(resource, value, referenceLow, referenceHigh),
      }
    })
    .filter((item): item is LabObservation => item !== null)
  // The legacy FHIR endpoint returns undated source-cohort values for DEMO patients.
  // Keep the selected visit measurements authoritative; only supplement dated history.
  const merged = new Map(fhirItems.filter((item) => !nativeItems.length || item.measuredAt).map((item) => [item.id, item]))
  nativeItems.forEach((item) => merged.set(item.id, item))
  return [...merged.values()].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.id.localeCompare(b.id, undefined, { numeric: true }))
}

export function normalizeLabFlag(value: string): LabObservation['flag'] {
  const mapped: Record<string, LabObservation['flag']> = { LL: 'CRITICAL_LOW', L: 'LOW', N: 'NORMAL', H: 'HIGH', HH: 'CRITICAL_HIGH' }
  return mapped[value] ?? (['NORMAL', 'HIGH', 'LOW', 'CRITICAL_HIGH', 'CRITICAL_LOW', 'ABNORMAL'].includes(value) ? value as LabObservation['flag'] : 'UNKNOWN')
}

function codingText(value: UnknownRecord) {
  return Array.isArray(value.coding) ? value.coding.filter(isRecord).map((item) => readString(item, 'display', 'code')).join(', ') : ''
}
function fhirFasting(resource: UnknownRecord): boolean | undefined {
  if (!Array.isArray(resource.extension)) return undefined
  const extension = resource.extension.filter(isRecord).find((item) => /fasting/i.test(readString(item, 'url')))
  return extension && typeof extension.valueBoolean === 'boolean' ? extension.valueBoolean : undefined
}

async function getFhirObservationBundle(patientId: number): Promise<UnknownRecord> {
  const entries: unknown[] = []
  let url = `/api/fhir/Observation/?patient=${patientId}`
  const visited = new Set<string>()
  while (url && !visited.has(url)) {
    visited.add(url)
    const payload = await request<unknown>(url)
    if (!isRecord(payload) || (!Array.isArray(payload.entry) && payload.resourceType !== 'Bundle')) throw new Error('FHIR 검사 이력 응답 형식이 올바르지 않습니다.')
    entries.push(...(Array.isArray(payload.entry) ? payload.entry : []))
    const next = Array.isArray(payload.link) ? payload.link.filter(isRecord).find((link) => link.relation === 'next') : undefined
    const nextUrl = next ? readString(next, 'url') : ''
    if (!nextUrl) break
    const resolved = new URL(nextUrl, 'https://api.34-50-57-207.sslip.io')
    if (resolved.pathname !== '/api/fhir/Observation/' || !['api.34-50-57-207.sslip.io', '127.0.0.1', 'localhost'].includes(resolved.hostname)) {
      throw new Error('FHIR 페이지 주소가 허용된 검사 API 경로와 다릅니다.')
    }
    if (resolved.searchParams.get('patient') && resolved.searchParams.get('patient') !== String(patientId)) throw new Error('FHIR 페이지의 환자가 일치하지 않습니다.')
    resolved.searchParams.set('patient', String(patientId))
    url = resolved.pathname + resolved.search
  }
  return { entry: entries }
}

export async function getPatientAngiographySequences(
  patientId: number,
): Promise<AngiographySequenceSummary[]> {
  let payload: unknown
  try {
    payload = await request<unknown>(`/api/patients/${patientId}/integrated/`)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    payload = await request<unknown>(`/api/patients/${patientId}/integrated-data/`)
  }

  if (!isRecord(payload) || !Array.isArray(payload.angiography_sequences)) return []

  return payload.angiography_sequences
    .filter(isRecord)
    .map((sequence): AngiographySequenceSummary | null => {
      const id = readNumber(sequence, 'id')
      if (id === undefined) return null
      const coronarySide = normalizeCoronarySide(sequence.coronary_side)
      const sequenceNo = readNumber(sequence, 'sequence_no') ?? id
      return {
        id,
        sequenceNo,
        frameCount: readNumber(sequence, 'frame_count') ?? 0,
        examinationId: readNumber(sequence, 'examination_id'),
        coronarySide,
        coronarySideLabel: readString(sequence, 'coronary_side_label') || coronarySideLabels[coronarySide],
        displayName: readString(sequence, 'display_name') || `${coronarySideLabels[coronarySide]} 촬영 ${sequenceNo}`,
        performedAt: readString(sequence, 'performed_at'),
        labels: sequence.labels,
      }
    })
    .filter((item): item is AngiographySequenceSummary => item !== null)
}

export async function getAngiographyFrames(
  sequenceId: number,
): Promise<AngiographyFrame[]> {
  const payload = await request<unknown>(
    `/api/angiography-sequences/${sequenceId}/frames/?page=1&page_size=100`,
  )

  if (!isRecord(payload) || !Array.isArray(payload.frames)) return []

  return payload.frames
    .filter(isRecord)
    .map((frame): AngiographyFrame | null => {
      const index = readNumber(frame, 'index')
      const url = readString(frame, 'url', 'download_url', 'preview_url')
      if (index === undefined || !url) return null
      return {
        index,
        filename: readString(frame, 'filename') || `frame-${index + 1}`,
        url,
        expiresIn: readNumber(frame, 'expires_in'),
      }
    })
    .filter((item): item is AngiographyFrame => item !== null)
}

function mapRendering3D(rendering: UnknownRecord): Rendering3DSummary | null {
  const id = readNumber(rendering, 'id', 'rendering_id')
  const studyId = readNumber(rendering, 'imaging_study', 'study_id')
  if (id === undefined || studyId === undefined) return null

  return {
    id,
    studyId,
    fileAssetId: readNumber(rendering, 'file_asset', 'file_id'),
    aiAnalysisJobId: readNumber(rendering, 'ai_analysis_job', 'aiAnalysisJobId'),
    generationType: readString(rendering, 'generation_type'),
    renderingConfig: isRecord(rendering.rendering_config) ? rendering.rendering_config : undefined,
    renderingType: readString(rendering, 'rendering_type'),
    fileFormat: readString(rendering, 'file_format') || 'GLB',
    version: readNumber(rendering, 'version') ?? 1,
    status: readString(rendering, 'status') || 'PENDING',
    generatedAt: readString(rendering, 'generated_at'),
    createdAt: readString(rendering, 'created_at'),
  }
}

function mapRendering3DSource(source: UnknownRecord): Rendering3DSourceSummary | null {
  const id = readNumber(source, 'id', 'source_id')
  const renderingId = readNumber(source, 'rendering_3d', 'rendering_id')
  if (id === undefined || renderingId === undefined) return null

  return {
    id,
    renderingId,
    aiSegmentationResultId: readNumber(
      source,
      'ai_segmentation_result',
      'aiSegmentationResultId',
    ),
    sourceFileAssetId: readNumber(source, 'source_file_asset', 'sourceFileAssetId'),
    imagingSeriesId: readNumber(source, 'imaging_series', 'imagingSeriesId'),
    sourceRole: readString(source, 'source_role', 'sourceRole') || 'SOURCE',
  }
}

export async function getRendering3DSources(
  renderingId: number,
): Promise<Rendering3DSourceSummary[]> {
  const payload = await requestRenderingApi<unknown>(`renderings-3d/${renderingId}/sources/`)
  return extractList(payload)
    .map(mapRendering3DSource)
    .filter((item): item is Rendering3DSourceSummary => item !== null)
}

function infer3DFileFormat(file: UnknownRecord): string {
  const objectKey = readString(file, 'object_key', 'objectKey').toUpperCase()
  const mimeType = readString(file, 'mime_type', 'mimeType').toUpperCase()
  if (objectKey.endsWith('.GLB') || mimeType.includes('GLTF-BINARY')) return 'GLB'
  if (objectKey.endsWith('.GLTF') || mimeType.includes('GLTF+JSON')) return 'GLTF'
  if (objectKey.endsWith('.STL') || mimeType.includes('STL')) return 'STL'
  if (objectKey.endsWith('.VTK') || mimeType.includes('VTK')) return 'VTK'
  if (objectKey.endsWith('.NII') || objectKey.endsWith('.NII.GZ')) return 'NIFTI'
  return ''
}

async function requestFileApi<T>(fileId: number, suffix = ''): Promise<T> {
  try {
    return await request<T>(`/api/files/${fileId}/${suffix}`)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    return request<T>(`/api/staff/files/${fileId}/${suffix}`)
  }
}

/**
 * 임의의 FileAsset id를 서명된 다운로드 URL로 변환한다.
 * CCTA 결과의 calcification_overlay.png / calcification_3d.png 처럼
 * Rendering3D.rendering_config 또는 AIAnalysisResult.result_json에
 * *_file_asset_id 로만 연결된 보조 파일을 화면에 표시할 때 사용한다.
 */
export async function getFileDownloadUrl(fileId: number): Promise<string> {
  const download = await requestFileApi<unknown>(fileId, 'download/')
  if (!isRecord(download)) {
    throw new ApiError('파일 다운로드 응답 형식이 올바르지 않습니다.', 500)
  }
  const url = readString(download, 'download_url', 'url')
  if (!url) {
    throw new ApiError('파일의 서명 URL이 없습니다.', 409)
  }
  return url
}

async function getFileViewerSource(
  renderingId: number,
  fileId: number,
  sourceRole: string,
): Promise<Rendering3DViewerSource> {
  const metadata = await requestFileApi<unknown>(fileId)
  if (!isRecord(metadata)) {
    throw new ApiError('원본 3D 파일 메타데이터 형식이 올바르지 않습니다.', 500)
  }

  const fileFormat = infer3DFileFormat(metadata)
  if (!['GLB', 'GLTF', 'STL', 'VTK'].includes(fileFormat)) {
    throw new ApiError(
      fileFormat === 'NIFTI'
        ? '원본 분할 데이터가 NIfTI 마스크만 제공됩니다. 웹 표시용 GLB·VTK·STL mesh_file_asset 연결이 필요합니다.'
        : '원본 파일 형식을 확인할 수 없습니다. GLB·VTK·STL mesh_file_asset 연결이 필요합니다.',
      409,
    )
  }

  const download = await requestFileApi<unknown>(fileId, 'download/')
  if (!isRecord(download)) {
    throw new ApiError('원본 3D 파일 다운로드 응답 형식이 올바르지 않습니다.', 500)
  }
  const downloadUrl = readString(download, 'download_url', 'url')
  if (!downloadUrl) {
    throw new ApiError('원본 3D 파일의 서명 URL이 없습니다.', 409)
  }

  return {
    renderingId,
    fileId,
    fileFormat,
    downloadUrl,
    expiresIn: readNumber(download, 'expires_in'),
    sourceRole,
  }
}

export async function getStudyRenderings3D(
  studyId: number,
): Promise<Rendering3DSummary[]> {
  const payload = await requestRenderingApi<unknown>(`imaging-studies/${studyId}/renderings-3d/`)

  return extractList(payload)
    .map(mapRendering3D)
    .filter((item): item is Rendering3DSummary => item !== null)
}

async function requestRenderingApi<T>(path: string, init?: ApiRequestInit): Promise<T> {
  // ai/rendering_urls.py는 config/api_v1_urls.py에서 "staff/" 프리픽스로만 마운트되어 있어
  // 실제 유효 경로는 /api/staff/... 이다. staff 경로를 우선 시도하고,
  // 향후 배포에서 프리픽스 없는 경로가 추가될 경우를 대비해 폴백을 유지한다.
  try { return await request<T>(`/api/staff/${path}`, init) }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    return request<T>(`/api/${path}`, init)
  }
}

export async function getRendering3D(renderingId: number): Promise<Rendering3DSummary> {
  const item = mapRendering3D(await requestRenderingApi<UnknownRecord>(`renderings-3d/${renderingId}/`))
  if (!item) throw new Error('3D 렌더링 상세 형식이 올바르지 않습니다.')
  return item
}

export async function createStudyRendering3D(studyId: number, input: {
  rendering_type: string; source_series_ids: number[]; file_format: string; generation_type?: 'CCTA' | 'ANGIO_2D_TO_3D'; rendering_config?: Record<string, unknown>
}): Promise<Rendering3DSummary> {
  const item = mapRendering3D(await requestRenderingApi<UnknownRecord>(`imaging-studies/${studyId}/renderings-3d/`, { method: 'POST', body: JSON.stringify(input) }))
  if (!item) throw new Error('3D 렌더링 생성 응답을 확인하지 못했습니다.')
  return item
}

export async function regenerateRendering3D(renderingId: number, renderingConfig: Record<string, unknown>, fileFormat: string): Promise<Rendering3DSummary> {
  const item = mapRendering3D(await requestRenderingApi<UnknownRecord>(`renderings-3d/${renderingId}/regenerate/`, { method: 'POST', body: JSON.stringify({ rendering_config: renderingConfig, file_format: fileFormat }) }))
  if (!item) throw new Error('3D 재생성 응답을 확인하지 못했습니다.')
  return item
}

export async function getImagingAnnotations(studyId: number): Promise<ImagingAnnotationRecord[]> {
  return extractList(await request(`/api/imaging-studies/${studyId}/annotations/`)) as unknown as ImagingAnnotationRecord[]
}
export function getImagingAnnotation(id: number): Promise<ImagingAnnotationRecord> {
  return request(`/api/imaging-annotations/${id}/`)
}
export function createImagingAnnotation(studyId: number, input: ImagingAnnotationInput): Promise<ImagingAnnotationRecord> {
  return request(`/api/imaging-studies/${studyId}/annotations/`, { method: 'POST', body: JSON.stringify(input) })
}
export function updateImagingAnnotation(id: number, input: Partial<ImagingAnnotationInput>): Promise<ImagingAnnotationRecord> {
  return request(`/api/imaging-annotations/${id}/`, { method: 'PATCH', body: JSON.stringify(input) })
}
export async function deleteImagingAnnotation(id: number): Promise<void> {
  await request(`/api/imaging-annotations/${id}/`, { method: 'DELETE' })
}

export function getExaminationResultDetail(id: number): Promise<UnknownRecord> {
  return request(`/api/examinations/results/${id}/`)
}
export async function getClinicalVariables(): Promise<UnknownRecord[]> {
  return extractList(await request('/api/examinations/clinical-variables/?size=100'))
}

export interface ApiFormField {
  name: string
  type: string
  required: boolean
  label: string
  enum?: string[]
  format?: string
}
export async function getReferenceRangeFormFields(edit = false): Promise<ApiFormField[]> {
  const schema = await request<UnknownRecord>('/api/schema/?format=json')
  if (!isRecord(schema.paths)) return []
  const entry = Object.entries(schema.paths).find(([path]) => edit
    ? /\/examinations\/admin\/reference-ranges\/\{[^/]+\}\/$/.test(path)
    : /\/examinations\/clinical-variables\/\{[^/]+\}\/reference-ranges\/$/.test(path))
  if (!entry || !isRecord(entry[1])) return []
  const operation = entry[1][edit ? 'patch' : 'post']
  if (!isRecord(operation) || !isRecord(operation.requestBody)) return []
  const content = operation.requestBody.content
  if (!isRecord(content) || !isRecord(content['application/json'])) return []
  let body = content['application/json'].schema
  const resolve = (value: unknown): UnknownRecord | undefined => {
    if (!isRecord(value)) return undefined
    if (typeof value.$ref !== 'string') return value
    let result: unknown = schema
    for (const segment of value.$ref.replace('#/', '').split('/')) result = isRecord(result) ? result[segment] : undefined
    return isRecord(result) ? result : undefined
  }
  body = resolve(body)
  if (!isRecord(body) || !isRecord(body.properties)) return []
  const required = Array.isArray(body.required) ? body.required : []
  return Object.entries(body.properties).flatMap(([name, value]) => {
    const field = resolve(value)
    if (!field || field.readOnly || name === 'clinical_variable') return []
    return [{ name, type: readString(field, 'type') || 'string', required: required.includes(name), label: readString(field, 'title') || name, enum: Array.isArray(field.enum) ? field.enum.map(String) : undefined, format: readString(field, 'format') }]
  })
}
export function updateClinicalMeasurement(id: number, input: Record<string, unknown>): Promise<UnknownRecord> {
  return request(`/api/examinations/measurements/${id}/`, { method: 'PATCH', body: JSON.stringify(input) })
}
export function saveClinicalMeasurements(resultId: number, measurements: Record<string, unknown>[]): Promise<UnknownRecord> {
  return request(`/api/examinations/results/${resultId}/measurements/bulk/`, { method: 'POST', body: JSON.stringify({ measurements }) })
}
export function correctExaminationResult(id: number, reason: string): Promise<UnknownRecord> {
  return request(`/api/examinations/results/${id}/correct/`, { method: 'POST', body: JSON.stringify({ reason }) })
}
export function finalizeExaminationResult(id: number): Promise<UnknownRecord> {
  return request(`/api/examinations/results/${id}/finalize/`, { method: 'POST', body: JSON.stringify({}) })
}

export async function getClinicalReferenceRanges(variableId: number): Promise<UnknownRecord[]> {
  return extractList(await request(`/api/examinations/clinical-variables/${variableId}/reference-ranges/`))
}
export function createClinicalReferenceRange(variableId: number, input: Record<string, unknown>): Promise<UnknownRecord> {
  return request(`/api/examinations/clinical-variables/${variableId}/reference-ranges/`, { method: 'POST', body: JSON.stringify(input) })
}
export function versionClinicalReferenceRange(id: number, input: Record<string, unknown>): Promise<UnknownRecord> {
  return request(`/api/examinations/admin/reference-ranges/${id}/`, { method: 'PATCH', body: JSON.stringify(input) })
}
export async function getReferenceRangeAuditLogs(id: number): Promise<UnknownRecord[]> {
  // 전용 audit-logs 엔드포인트는 backend에 존재하지 않으므로,
  // 공용 감사 로그 조회 API(object_id 필터 지원)로 대체한다.
  const payload = await request<unknown>(
    `/api/admin/audit-events/?object=CLINICAL_REFERENCE_RANGE&object_id=${id}`,
  )
  return extractList(payload).map((entry) => {
    const metadata = isRecord(entry.metadata_json) ? entry.metadata_json : {}
    const actorLabel = entry.actor_type && entry.actor_id
      ? `${entry.actor_type}#${entry.actor_id}`
      : entry.actor_type ?? undefined
    return {
      ...entry,
      created_at: entry.created_at ?? entry.occurred_at,
      actor: entry.actor ?? actorLabel,
      before: entry.before ?? metadata.before,
      after: entry.after ?? metadata.after,
    }
  })
}

export async function getRendering3DViewerSource(
  renderingId: number,
): Promise<Rendering3DViewerSource> {
  const viewer = await requestRenderingApi<unknown>(`renderings-3d/${renderingId}/viewer/`)
  if (!isRecord(viewer)) {
    throw new ApiError('3D 뷰어 응답 형식이 올바르지 않습니다.', 500)
  }

  const viewerUrl = readString(viewer, 'viewer_url', 'viewerUrl')
  if (!viewerUrl) {
    throw new ApiError('3D 파일 조회 주소가 없습니다.', 409)
  }

  let download: unknown
  try {
    download = await request<unknown>(viewerUrl)
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 404 ||
      !viewerUrl.startsWith('/api/staff/files/')
    ) throw error
    download = await request<unknown>(viewerUrl.replace('/api/staff/files/', '/api/files/'))
  }
  if (!isRecord(download)) {
    throw new ApiError('3D 파일 다운로드 응답 형식이 올바르지 않습니다.', 500)
  }

  const downloadUrl = readString(download, 'download_url', 'url')
  if (!downloadUrl) {
    throw new ApiError('3D 파일의 서명 URL이 없습니다.', 409)
  }

  return {
    renderingId: readNumber(viewer, 'rendering_id') ?? renderingId,
    fileId: readNumber(viewer, 'file_id') ?? 0,
    fileFormat: readString(viewer, 'file_format') || 'GLB',
    downloadUrl,
    expiresIn: readNumber(download, 'expires_in'),
  }
}

export async function getRendering3DOriginalViewerSource(
  rendering: Rendering3DSummary,
): Promise<Rendering3DViewerSource> {
  const sources = await getRendering3DSources(rendering.id)
  if (!sources.length) {
    throw new ApiError('이 렌더링에 연결된 원본 3D source가 없습니다.', 404)
  }

  const segmentationIds = new Set(
    sources
      .map((source) => source.aiSegmentationResultId)
      .filter((id): id is number => id !== undefined),
  )
  const fileCandidates: Array<{ fileId: number; sourceRole: string }> = []

  if (rendering.aiAnalysisJobId && segmentationIds.size) {
    try {
      const result = await request<unknown>(
        `/api/ai-analysis-jobs/${rendering.aiAnalysisJobId}/result/`,
      )
      if (isRecord(result)) {
        const resultId = readNumber(result, 'id', 'result_id')
        if (resultId !== undefined) {
          const segmentationPayload = await request<unknown>(
            `/api/ai-results/${resultId}/segmentations/`,
          )
          extractList(segmentationPayload).forEach((item) => {
            const segmentationId = readNumber(item, 'id', 'segmentation_id')
            const meshFileId = readNumber(item, 'mesh_file_asset', 'meshFileAssetId')
            if (
              segmentationId !== undefined &&
              segmentationIds.has(segmentationId) &&
              meshFileId !== undefined
            ) {
              const source = sources.find(
                (candidate) => candidate.aiSegmentationResultId === segmentationId,
              )
              fileCandidates.push({
                fileId: meshFileId,
                sourceRole: source?.sourceRole ?? 'SEGMENTATION_MESH',
              })
            }
          })
        }
      }
    } catch {
      // Older deployments can omit the AI result detail routes. In that case,
      // continue with source_file_asset from the rendering provenance response.
    }
  }

  sources.forEach((source) => {
    if (
      source.sourceFileAssetId !== undefined &&
      !fileCandidates.some((candidate) => candidate.fileId === source.sourceFileAssetId)
    ) {
      fileCandidates.push({
        fileId: source.sourceFileAssetId,
        sourceRole: source.sourceRole,
      })
    }
  })

  if (!fileCandidates.length) {
    throw new ApiError(
      '원본 source는 DICOM Series로만 연결되어 있습니다. 원본 3D mesh_file_asset이 필요합니다.',
      409,
    )
  }

  let lastError: unknown
  for (const candidate of fileCandidates) {
    try {
      return await getFileViewerSource(
        rendering.id,
        candidate.fileId,
        candidate.sourceRole,
      )
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new ApiError('표시 가능한 원본 3D 파일을 찾지 못했습니다.', 404)
}

function mapStaffNotification(recipient: UnknownRecord): StaffNotification | null {
  const recipientId = readNumber(recipient, 'id', 'recipient_id')
  const notification = isRecord(recipient.notification)
    ? recipient.notification
    : recipient
  const notificationId = readNumber(notification, 'id', 'notification_id')
  if (recipientId === undefined || notificationId === undefined) return null

  return {
    recipientId,
    notificationId,
    type: readString(notification, 'notification_type', 'type') || 'GENERAL',
    title: readString(notification, 'title') || '새 알림',
    body: readString(notification, 'body', 'message'),
    referenceType: readString(notification, 'reference_type'),
    referenceId: readNumber(notification, 'reference_id'),
    priority: readString(notification, 'priority') || 'NORMAL',
    isRead: Boolean(recipient.is_read ?? recipient.read_at),
    createdAt:
      readString(notification, 'created_at') ||
      readString(recipient, 'created_at'),
  }
}

export async function getStaffNotifications(): Promise<StaffNotification[]> {
  const payload = await request<unknown>('/api/notifications/?page=1', {
    clearSessionOnUnauthorized: false,
  })
  return extractList(payload)
    .map(mapStaffNotification)
    .filter((item): item is StaffNotification => item !== null)
}

export async function getStaffNotificationUnreadCount(): Promise<number> {
  const payload = await request<unknown>('/api/notifications/unread-count/', {
    clearSessionOnUnauthorized: false,
  })
  return isRecord(payload) ? readNumber(payload, 'unread_count') ?? 0 : 0
}

export async function markStaffNotificationRead(recipientId: number): Promise<void> {
  await request(`/api/notifications/${recipientId}/read/`, {
    method: 'POST',
    clearSessionOnUnauthorized: false,
  })
}

export async function markAllStaffNotificationsRead(): Promise<void> {
  await request('/api/notifications/read-all/', {
    method: 'POST',
    clearSessionOnUnauthorized: false,
  })
}


export async function getPatientMemos(
  patientId: number,
): Promise<PatientMemo[]> {
  const payload = await request<unknown>(
    `/api/staff/patients/${patientId}/memos/`,
  )

  return extractList(payload)
    .map(mapPatientMemo)
    .filter(
      (memo): memo is PatientMemo =>
        memo !== null,
    )
}

export async function createPatientMemo(
  patientId: number,
  content: string,
): Promise<void> {
  await request<unknown>(
    `/api/staff/patients/${patientId}/memos/`,
    {
      method: 'POST',
      body: JSON.stringify({
        memo_text: content,
      }),
    },
  )
}

export async function updatePatientMemo(
  memoId: number,
  content: string,
): Promise<void> {
  await request<unknown>(
    `/api/staff/patient-memos/${memoId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        memo_text: content,
      }),
    },
  )
}

function mapExaminationType(
  item: UnknownRecord,
): ExaminationTypeSummary | null {
  const id = readNumber(item, 'id')

  if (id === undefined) {
    return null
  }

  return {
    id,
    code: readString(item, 'code'),
    name: readString(item, 'name') || '검사',
    category: readString(item, 'category'),
    modality: readString(item, 'modality'),
    description: readString(item, 'description'),
  }
}

function mapExaminationOrder(
  item: UnknownRecord,
): ExaminationOrderSummary | null {
  const id = readNumber(item, 'id')
  const encounter = nestedRecord(item, 'encounter')
  const examinationType = nestedRecord(item, 'examination_type')
  const encounterId = readNumber(item, 'encounter_id') ?? (encounter ? readNumber(encounter, 'id') : undefined)
  const examinationTypeId = readNumber(item, 'examination_type_id', 'type_id') ?? (examinationType ? readNumber(examinationType, 'id') : undefined)

  if (
    id === undefined ||
    encounterId === undefined ||
    examinationTypeId === undefined
  ) {
    return null
  }

  const priorityValue = readString(item, 'priority')
  const statusValue = readString(item, 'status')

  return {
    id,
    encounterId,
    examinationTypeId,
    orderedById: readNumber(
      item,
      'ordered_by',
      'ordered_by_id',
    ),
    priority: priorityValue === 'URGENT' ? 'URGENT' : 'NORMAL',
    status:
      statusValue === 'SCHEDULED' ||
      statusValue === 'COMPLETED' ||
      statusValue === 'CANCELED'
        ? statusValue
        : 'ORDERED',
    clinicalNote: readString(item, 'clinical_note'),
    orderedAt: readString(item, 'ordered_at'),
    scheduledAt: readString(item, 'scheduled_at'),
    scheduledLocation: readString(
      item,
      'scheduled_location',
      'location',
    ),
    canceledAt: readString(item, 'canceled_at'),
    cancelReason: readString(item, 'cancel_reason'),
    canceledById: readNumber(
      item,
      'canceled_by',
      'cancled_by_id',
    ),
  }
}

export async function getExaminationTypes(): Promise<
  ExaminationTypeSummary[]
> {
  const payload = await request<unknown>(
    '/api/examinations/types/',
  )

  return extractList(payload)
    .map(mapExaminationType)
    .filter(
      (item): item is ExaminationTypeSummary =>
        item !== null,
    )
}

export async function getExaminationOrders(
  patientId: number,
): Promise<ExaminationOrderSummary[]> {
  const params = new URLSearchParams({
    patient_id: String(patientId),
  })

  const payload = await request<unknown>(
    `/api/examinations/orders/?${params.toString()}`,
  )

  return extractList(payload)
    .map(mapExaminationOrder)
    .filter(
      (item): item is ExaminationOrderSummary =>
        item !== null,
    )
}

export async function createExaminationOrder(
  encounterId: number,
  examinationTypeId: number,
  clinicalNote: string,
): Promise<ExaminationOrderSummary> {
  const payload = await request<unknown>(
    `/api/encounters/${encounterId}/examination-orders/`,
    {
      method: 'POST',
      body: JSON.stringify({
        examination_type_id: examinationTypeId,
        priority: 'NORMAL',
        ...(clinicalNote.trim()
          ? { clinical_note: clinicalNote.trim() }
          : {}),
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '검사 오더 응답 형식을 확인하지 못했습니다.',
      500,
    )
  }

  const order = mapExaminationOrder(payload)

  if (!order) {
    throw new ApiError(
      '검사 오더 응답을 변환하지 못했습니다.',
      500,
    )
  }

  return order
}

export async function cancelExaminationOrder(
  orderId: number,
  reason: string,
): Promise<ExaminationOrderSummary> {
  const payload = await request<unknown>(
    `/api/examinations/orders/${orderId}/cancel/`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: reason.trim(),
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '검사 오더 취소 응답을 확인하지 못했습니다.',
      500,
    )
  }

  const order = mapExaminationOrder(payload)

  if (!order) {
    throw new ApiError(
      '검사 오더 취소 결과를 변환하지 못했습니다.',
      500,
    )
  }

  return order
}

export async function updateExaminationOrder(
  orderId: number,
  input: { priority: 'NORMAL' | 'URGENT'; clinicalNote: string },
): Promise<ExaminationOrderSummary> {
  const payload = await request<unknown>(`/api/examinations/orders/${orderId}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      priority: input.priority,
      clinical_note: input.clinicalNote.trim(),
    }),
  })
  const order = isRecord(payload) ? mapExaminationOrder(payload) : null
  if (!order) throw new ApiError('수정된 검사 오더를 확인하지 못했습니다.', 500)
  return order
}

export async function scheduleExaminationOrder(
  orderId: number,
  scheduledAt: string,
  location: string,
): Promise<ExaminationOrderSummary> {
  const payload = await request<unknown>(`/api/examinations/orders/${orderId}/schedule/`, {
    method: 'POST',
    body: JSON.stringify({ scheduled_at: scheduledAt, location: location.trim() }),
  })
  const order = isRecord(payload) ? mapExaminationOrder(payload) : null
  if (!order) throw new ApiError('등록된 검사 일정을 확인하지 못했습니다.', 500)
  return order
}

export async function getOrderExaminations(orderId: number): Promise<ExaminationExecutionSummary[]> {
  const payload = await request<unknown>(`/api/examinations/orders/${orderId}/examinations/`)
  return extractList(payload).flatMap((item): ExaminationExecutionSummary[] => {
    const id = readNumber(item, 'id', 'examination_id')
    if (id === undefined) return []
    return [{
      id,
      orderId: readNumber(item, 'order_id', 'examination_order_id') ?? orderId,
      attemptNumber: readNumber(item, 'attempt_number', 'attempt_no'),
      status: readString(item, 'status'),
      performedAt: readString(item, 'performed_at'),
      location: readString(item, 'location'),
    }]
  })
}

function mapMedication(
  item: UnknownRecord,
): MedicationSummary | null {
  const id = readNumber(item, 'id')

  if (id === undefined) {
    return null
  }

  return {
    id,
    code: readString(item, 'code'),
    name:
      readString(item, 'name') ||
      '이름 없는 약품',
    ingredient: readString(
      item,
      'ingredient',
    ),
    defaultUnit: readString(
      item,
      'default_unit',
      'defaultUnit',
    ),
    ingredientCode: readString(
      item,
      'ingredient_code',
      'ingredientCode',
    ),
    manufacturer: readString(
      item,
      'manufacturer',
    ),
    dosageForm: readString(
      item,
      'dosage_form',
      'dosageForm',
    ),
    strength: readString(
      item,
      'strength',
    ),
  }
}

function mapMedicationFavorite(
  item: UnknownRecord,
): MedicationFavoriteSummary | null {
  const id = readNumber(item, 'id')
  const medicationId = readNumber(
    item,
    'medication',
    'medication_id',
  )

  const medicationValue =
    item.medication_detail

  if (
    id === undefined ||
    medicationId === undefined ||
    !isRecord(medicationValue)
  ) {
    return null
  }

  const medication =
    mapMedication(medicationValue)

  if (!medication) {
    return null
  }

  return {
    id,
    medicationId,
    displayOrder:
      readNumber(item, 'display_order') ?? 0,
    medication,
  }
}

function mapPrescription(
  item: UnknownRecord,
): PrescriptionSummary | null {
  const id = readNumber(item, 'id')
  const encounterId = readNumber(
    item,
    'encounter',
    'encounter_id',
  )
  const patientId = readNumber(
    item,
    'patient',
    'patient_id',
  )

  if (
    id === undefined ||
    encounterId === undefined ||
    patientId === undefined
  ) {
    return null
  }

  const statusValue =
    readString(item, 'status')

  return {
    id,
    encounterId,
    patientId,
    prescribedById: readNumber(
      item,
      'prescribed_by',
      'prescribed_by_id',
    ),
    status:
      statusValue === 'SIGNED' ||
      statusValue === 'CANCELED'
        ? statusValue
        : 'DRAFT',
    notes: readString(item, 'notes'),
    prescribedAt: readString(
      item,
      'prescribed_at',
    ),
    signedAt: readString(
      item,
      'signed_at',
    ),
    canceledAt: readString(
      item,
      'canceled_at',
    ),
    cancelReason: readString(
      item,
      'cancel_reason',
    ),
    updatedAt: readString(
      item,
      'updated_at',
    ),
  }
}

function mapPrescriptionItem(
  item: UnknownRecord,
): PrescriptionItemSummary | null {
  const id = readNumber(item, 'id')
  const prescriptionId = readNumber(
    item,
    'prescription',
    'prescription_id',
  )
  const medicationId = readNumber(
    item,
    'medication',
    'medication_id',
  )

  if (
    id === undefined ||
    prescriptionId === undefined ||
    medicationId === undefined
  ) {
    return null
  }

  const medicationValue =
    item.medication_detail

  const medication = isRecord(
    medicationValue,
  )
    ? mapMedication(medicationValue) ??
      undefined
    : undefined

  return {
    id,
    prescriptionId,
    medicationId,
    medication,
    status:
      readString(item, 'status') ||
      'ACTIVE',
    doseValue: readNumber(
      item,
      'dose_value',
      'dose',
    ),
    doseUnit: readString(
      item,
      'dose_unit',
    ),
    frequencyPerDay: readNumber(
      item,
      'frequency_per_day',
      'frequency',
    ),
    durationDays: readNumber(
      item,
      'duration_days',
      'duration',
    ),
    route: readString(item, 'route'),
    instructions: readString(
      item,
      'instructions',
    ),
    note: readString(item, 'note'),
    startDate: readString(
      item,
      'start_date',
    ),
    endDate: readString(
      item,
      'end_date',
    ),
    createdAt: readString(
      item,
      'created_at',
    ),
    updatedAt: readString(
      item,
      'updated_at',
    ),
  }
}

function mapPrescriptionDetail(
  payload: unknown,
): PrescriptionDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const prescriptionValue =
    payload.prescription

  if (!isRecord(prescriptionValue)) {
    return null
  }

  const prescription =
    mapPrescription(prescriptionValue)

  if (!prescription) {
    return null
  }

  const itemValues = Array.isArray(
    payload.items,
  )
    ? payload.items.filter(isRecord)
    : []

  const items = itemValues
    .map(mapPrescriptionItem)
    .filter(
      (
        item,
      ): item is PrescriptionItemSummary =>
        item !== null,
    )

  return {
    prescription,
    items,
  }
}

export async function getMedications(
  search = '',
): Promise<MedicationSummary[]> {
  const params = new URLSearchParams()

  if (search.trim()) {
    params.set('search', search.trim())
  }

  const query = params.toString()

  const payload = await request<unknown>(
    `/api/medications/${
      query ? `?${query}` : ''
    }`,
  )

  return extractList(payload)
    .map(mapMedication)
    .filter(
      (
        item,
      ): item is MedicationSummary =>
        item !== null,
    )
}

export async function getMedicationFavorites(): Promise<
  MedicationFavoriteSummary[]
> {
  const payload = await request<unknown>(
    '/api/medication-favorites/',
  )

  return extractList(payload)
    .map(mapMedicationFavorite)
    .filter(
      (
        item,
      ): item is MedicationFavoriteSummary =>
        item !== null,
    )
}

export async function getPrescriptions(
  patientId: number,
): Promise<PrescriptionSummary[]> {
  const params = new URLSearchParams({
    patient_id: String(patientId),
  })

  const payload = await request<unknown>(
    `/api/prescriptions/?${params.toString()}`,
  )

  return extractList(payload)
    .map(mapPrescription)
    .filter(
      (
        item,
      ): item is PrescriptionSummary =>
        item !== null,
    )
}

export async function getPrescriptionDetail(
  prescriptionId: number,
): Promise<PrescriptionDetail> {
  const payload = await request<unknown>(
    `/api/prescriptions/${prescriptionId}/`,
  )

  const detail =
    mapPrescriptionDetail(payload)

  if (!detail) {
    throw new ApiError(
      '처방 상세정보를 변환하지 못했습니다.',
      500,
    )
  }

  return detail
}

export async function createPrescriptionDraft(
  encounterId: number,
  patientId: number,
  notes = '',
): Promise<PrescriptionSummary> {
  const payload = await request<unknown>(
    `/api/encounters/${encounterId}/prescriptions/`,
    {
      method: 'POST',
      body: JSON.stringify({
        patient_id: patientId,
        ...(notes.trim()
          ? { notes: notes.trim() }
          : {}),
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '처방 생성 응답을 확인하지 못했습니다.',
      500,
    )
  }

  const prescription =
    mapPrescription(payload)

  if (!prescription) {
    throw new ApiError(
      '처방 생성 결과를 변환하지 못했습니다.',
      500,
    )
  }

  return prescription
}

export async function updatePrescriptionNotes(
  prescriptionId: number,
  notes: string,
): Promise<PrescriptionSummary> {
  const payload = await request<unknown>(
    `/api/prescriptions/${prescriptionId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        notes: notes.trim(),
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '처방 수정 응답을 확인하지 못했습니다.',
      500,
    )
  }

  const prescription =
    mapPrescription(payload)

  if (!prescription) {
    throw new ApiError(
      '처방 수정 결과를 변환하지 못했습니다.',
      500,
    )
  }

  return prescription
}

export async function createPrescriptionItem(
  prescriptionId: number,
  input: PrescriptionItemInput & {
    medicationId: number
  },
): Promise<PrescriptionItemSummary> {
  const payload = await request<unknown>(
    `/api/prescriptions/${prescriptionId}/items/`,
    {
      method: 'POST',
      body: JSON.stringify({
        medication_id: input.medicationId,
        dose_value: input.doseValue,
        dose_unit: input.doseUnit,
        frequency_per_day:
          input.frequencyPerDay,
        duration_days: input.durationDays,
        route: input.route,
        instructions: input.instructions,
        note: input.note,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '처방 약품 추가 응답을 확인하지 못했습니다.',
      500,
    )
  }

  const item =
    mapPrescriptionItem(payload)

  if (!item) {
    throw new ApiError(
      '처방 약품 정보를 변환하지 못했습니다.',
      500,
    )
  }

  return item
}

export async function updatePrescriptionItem(
  itemId: number,
  input: PrescriptionItemInput,
): Promise<PrescriptionItemSummary> {
  const payload = await request<unknown>(
    `/api/prescription-items/${itemId}/`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        dose_value: input.doseValue,
        dose_unit: input.doseUnit,
        frequency_per_day:
          input.frequencyPerDay,
        duration_days: input.durationDays,
        route: input.route,
        instructions: input.instructions,
        note: input.note,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '처방 약품 수정 응답을 확인하지 못했습니다.',
      500,
    )
  }

  const item =
    mapPrescriptionItem(payload)

  if (!item) {
    throw new ApiError(
      '수정된 처방 약품을 변환하지 못했습니다.',
      500,
    )
  }

  return item
}

export async function deletePrescriptionItem(
  itemId: number,
): Promise<void> {
  await request<void>(
    `/api/prescription-items/${itemId}/`,
    {
      method: 'DELETE',
    },
  )
}

export async function runPrescriptionDurCheck(
  prescriptionId: number,
): Promise<unknown> {
  return request<unknown>(
    `/api/prescriptions/${prescriptionId}/dur-check/`,
    {
      method: 'POST',
    },
  )
}

export async function cancelPrescription(
  prescriptionId: number,
  reason: string,
): Promise<PrescriptionSummary> {
  const payload = await request<unknown>(
    `/api/prescriptions/${prescriptionId}/cancel/`,
    {
      method: 'POST',
      body: JSON.stringify({
        cancel_reason: reason.trim(),
      }),
    },
  )

  if (!isRecord(payload)) {
    throw new ApiError(
      '처방 취소 응답을 확인하지 못했습니다.',
      500,
    )
  }

  const prescription =
    mapPrescription(payload)

  if (!prescription) {
    throw new ApiError(
      '처방 취소 결과를 변환하지 못했습니다.',
      500,
    )
  }

  return prescription
}

function readBoolean(record: UnknownRecord, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
    if (value === 1 || value === '1' || value === 'true') return true
  }
  return false
}

function nestedRecord(record: UnknownRecord, ...keys: string[]): UnknownRecord | null {
  for (const key of keys) {
    if (isRecord(record[key])) return record[key] as UnknownRecord
  }
  return null
}

function readPersonName(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return fallback
  return readString(value, 'name', 'full_name', 'display_name', 'username', 'title') || fallback
}

function normalizeScheduleType(value: string): StaffScheduleType {
  const candidate = value.toUpperCase()
  if (
    candidate === 'PERSONAL' ||
    candidate === 'CLINICAL' ||
    candidate === 'CONSULTATION' ||
    candidate === 'ON_CALL' ||
    candidate === 'OFF'
  ) return candidate
  return 'PERSONAL'
}

function mapStaffSchedule(record: UnknownRecord): StaffSchedule | null {
  const id = readNumber(record, 'id', 'schedule_id')
  if (id === undefined) return null
  const owner = record.staff ?? record.user ?? record.doctor ?? record.owner
  return {
    id,
    title: readString(record, 'title', 'name') || '일정',
    type: normalizeScheduleType(readString(record, 'schedule_type', 'type')),
    startsAt: readString(record, 'starts_at', 'start_at', 'start'),
    endsAt: readString(record, 'ends_at', 'end_at', 'end'),
    description: readString(record, 'description', 'memo', 'note'),
    isAllDay: readBoolean(record, 'is_all_day', 'all_day'),
    color: readString(record, 'color'),
    status: readString(record, 'status') || 'ACTIVE',
    ownerName: readPersonName(owner, readString(record, 'staff_name', 'doctor_name', 'owner_name')),
  }
}

function mapScheduleChangeRequest(record: UnknownRecord): ScheduleChangeRequest | null {
  const id = readNumber(record, 'id', 'request_id')
  if (id === undefined) return null
  const schedule = nestedRecord(record, 'schedule', 'staff_schedule')
  const requester = record.requested_by ?? record.requester ?? record.staff
  const requestType = readString(record, 'request_type').toUpperCase() === 'CANCEL' ? 'CANCEL' : 'UPDATE'
  const requestedType = readString(record, 'requested_schedule_type')
  return {
    id,
    scheduleId: readNumber(record, 'schedule_id', 'schedule') ?? (schedule ? readNumber(schedule, 'id') : undefined),
    requestType,
    requestedScheduleType: requestedType ? normalizeScheduleType(requestedType) : undefined,
    requestedStartsAt: readString(record, 'requested_starts_at', 'requested_start_at'),
    requestedEndsAt: readString(record, 'requested_ends_at', 'requested_end_at'),
    reason: readString(record, 'reason', 'request_reason'),
    status: readString(record, 'status') || 'PENDING',
    requesterName: readPersonName(requester, readString(record, 'requester_name', 'staff_name')),
    reviewComment: readString(record, 'review_comment'),
    rejectionReason: readString(record, 'rejection_reason'),
    createdAt: readString(record, 'created_at', 'requested_at'),
  }
}

function mapStaffDoctor(record: UnknownRecord): StaffDoctor | null {
  const id = readNumber(record, 'id', 'doctor_id')
  if (id === undefined) return null
  const user = nestedRecord(record, 'user', 'staff')
  return {
    id,
    userId: readNumber(record, 'user_id', 'staff_user_id', 'user') ?? (user ? readNumber(user, 'id') : undefined) ?? id,
    name: readString(record, 'name', 'doctor_name') || readPersonName(user, `의료진 ${id}`),
    departmentName: readString(record, 'department_name', 'department') || (nestedRecord(record, 'department') ? readString(nestedRecord(record, 'department')!, 'name') : ''),
    title: readString(record, 'title', 'position'),
    isActive: record.is_active === undefined ? true : readBoolean(record, 'is_active'),
  }
}

function mapConsultation(record: UnknownRecord): ConsultationSummary | null {
  const id = readNumber(record, 'id', 'consultation_id')
  if (id === undefined) return null
  const patient = record.patient
  const requester = record.requested_by ?? record.requester
  const assignee = record.assigned_doctor ?? record.assignee
  const priority = readString(record, 'priority').toUpperCase() === 'URGENT' ? 'URGENT' : 'NORMAL'
  const rawStatus = readString(record, 'status').toUpperCase()
  const status = rawStatus === 'CANCELLED' ? 'CANCELED' : rawStatus === 'ACCEPTED' || rawStatus === 'COMPLETED' || rawStatus === 'CANCELED' ? rawStatus : 'REQUESTED'
  return {
    id,
    patientId: readNumber(record, 'patient_id', 'patient') ?? (isRecord(patient) ? readNumber(patient, 'id') : undefined),
    patientName: readPersonName(patient, readString(record, 'patient_name')),
    subject: readString(record, 'subject', 'title') || '협진 요청',
    requestNote: readString(record, 'request_note', 'note'),
    requestedByName: readPersonName(requester, readString(record, 'requested_by_name', 'requester_name')),
    requestedById: readNumber(record, 'requested_by_id', 'requester_id', 'requested_by', 'requester') ?? (isRecord(requester) ? readNumber(requester, 'user_id', 'id') : undefined),
    requestedDepartmentName: readString(record, 'requested_department_name', 'requester_department_name') || (isRecord(requester) ? readString(requester, 'department_name') : ''),
    patientNumber: readString(record, 'patient_number', 'medical_record_no') || (isRecord(patient) ? readString(patient, 'medical_record_no', 'patient_number') : ''),
    patientLocation: readString(record, 'patient_location', 'ward_name') || (isRecord(patient) ? readString(patient, 'ward_name', 'location') : ''),
    assignedDoctorId: readNumber(record, 'assigned_doctor_id', 'assigned_doctor') ?? (isRecord(assignee) ? readNumber(assignee, 'id') : undefined),
    assignedDoctorName: readPersonName(assignee, readString(record, 'assigned_doctor_name')),
    assignedDepartmentName: readString(record, 'assigned_department_name') || (isRecord(assignee) ? readString(assignee, 'department_name') : ''),
    priority,
    status,
    dueAt: readString(record, 'due_at'),
    createdAt: readString(record, 'created_at'),
  }
}

function mapConsultationOpinion(record: UnknownRecord): ConsultationOpinion | null {
  const id = readNumber(record, 'id', 'opinion_id')
  if (id === undefined) return null
  return {
    id,
    doctorName: readPersonName(record.doctor, readString(record, 'doctor_name', 'author_name')) || '의료진',
    opinionText: readString(record, 'opinion_text', 'text', 'content'),
    isFinal: readBoolean(record, 'is_final'),
    createdAt: readString(record, 'created_at'),
  }
}

function mapChatMessage(record: UnknownRecord): ChatMessage | null {
  const id = readNumber(record, 'id', 'message_id')
  if (id === undefined) return null
  const sender = record.sender
  return {
    id,
    senderId: readNumber(record, 'sender_id', 'sender') ?? (isRecord(sender) ? readNumber(sender, 'id') : undefined),
    senderName: readPersonName(sender, readString(record, 'sender_name')) || '의료진',
    messageType: readString(record, 'message_type', 'type') || 'TEXT',
    text: readString(record, 'message_text', 'text'),
    createdAt: readString(record, 'created_at'),
    deliveryStatus: readString(record, 'delivery_status') || 'SENT',
    isDeleted: readBoolean(record, 'is_deleted') || Boolean(record.deleted_at),
  }
}

function mapChatRoom(payload: UnknownRecord): ChatRoom | null {
  const record = nestedRecord(payload, 'room', 'chat_room') ?? payload
  const id = readNumber(record, 'id', 'room_id')
  if (id === undefined) return null
  const rawType = readString(record, 'room_type', 'type').toUpperCase()
  const roomType = rawType === 'DIRECT' || rawType === 'CONSULTATION' ? rawType : 'GROUP'
  const memberRecords = Array.isArray(payload.members) ? payload.members.filter(isRecord) : []
  const members = memberRecords.map((member) => {
    const user = member.user
    const profile = nestedRecord(member, 'profile', 'staff_profile', 'doctor')
    const department = profile ? nestedRecord(profile, 'department') : null
    return {
      id: readNumber(member, 'id', 'member_id') ?? 0,
      userId: readNumber(member, 'user_id', 'user') ?? (isRecord(user) ? readNumber(user, 'id') : undefined) ?? 0,
      name:
        readString(member, 'user_name', 'staff_name', 'doctor_name', 'name') ||
        (profile ? readString(profile, 'name', 'full_name') : '') ||
        readPersonName(user, '') ||
        '의료진',
      username:
        readString(member, 'username') ||
        (profile ? readString(profile, 'username') : '') ||
        (isRecord(user) ? readString(user, 'username') : ''),
      departmentName:
        readString(member, 'department_name') ||
        (profile ? readString(profile, 'department_name') : '') ||
        (department ? readString(department, 'name') : ''),
      title:
        readString(member, 'title', 'position') ||
        (profile ? readString(profile, 'title', 'position', 'staff_type') : ''),
      role: readString(member, 'member_role', 'role') || 'MEMBER',
      status: readString(member, 'membership_status', 'status') || 'ACTIVE',
    }
  })
  const latestRecord = isRecord(payload.latest_message) ? payload.latest_message : isRecord(record.latest_message) ? record.latest_message : null
  return {
    id,
    title: readString(record, 'title') || (roomType === 'DIRECT' ? '1:1 채팅' : '그룹 채팅'),
    roomType,
    status: readString(record, 'status') || 'ACTIVE',
    consultationId: readNumber(record, 'consultation_id', 'consultation_request'),
    createdAt: readString(record, 'created_at'),
    members,
    latestMessage: latestRecord ? mapChatMessage(latestRecord) ?? undefined : undefined,
    unreadCount: readNumber(payload, 'unread_count') ?? readNumber(record, 'unread_count') ?? 0,
  }
}

export async function getStaffIdentity(): Promise<StaffIdentity> {
  const payload = await request<unknown>('/api/auth/staff/me/')
  if (!isRecord(payload)) throw new ApiError('의료진 계정 정보를 확인하지 못했습니다.', 500)
  const rolesValue = payload.roles
  return {
    id: readNumber(payload, 'id', 'user_id') ?? 0,
    username: readString(payload, 'username'),
    name: readString(payload, 'name', 'full_name', 'username') || '의료진',
    departmentName: readString(payload, 'department_name'),
    title: readString(payload, 'title'),
    roles: Array.isArray(rolesValue)
      ? rolesValue.map((role) => typeof role === 'string' ? role : isRecord(role) ? readString(role, 'code', 'name') : '').filter(Boolean)
      : [],
  }
}

export async function getStaffDoctors(search = ''): Promise<StaffDoctor[]> {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
  const payload = await request<unknown>(`/api/doctors/${query}`)
  return extractList(payload).map(mapStaffDoctor).filter((item): item is StaffDoctor => item !== null)
}

export async function getStaffSchedules(from: string, to: string, type?: StaffScheduleType): Promise<StaffSchedule[]> {
  const params = new URLSearchParams({ from, to })
  if (type) params.set('type', type)
  const payload = await request<unknown>(`/api/staff/schedules/?${params}`)
  return extractList(payload).map(mapStaffSchedule).filter((item): item is StaffSchedule => item !== null)
}

export async function createStaffSchedule(input: StaffScheduleInput): Promise<StaffSchedule> {
  const payload = await request<unknown>('/api/staff/schedules/', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      type: input.type,
      schedule_type: input.type,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      description: input.description || null,
      is_all_day: input.isAllDay ?? false,
      color: input.color || null,
      status: 'ACTIVE',
    }),
  })
  const schedule = isRecord(payload) ? mapStaffSchedule(payload) : null
  if (!schedule) throw new ApiError('생성된 일정을 확인하지 못했습니다.', 500)
  return schedule
}

export async function updateStaffSchedule(id: number, input: StaffScheduleInput): Promise<StaffSchedule> {
  const payload = await request<unknown>(`/api/staff/schedules/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: input.title,
      schedule_type: input.type,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      description: input.description || null,
      is_all_day: input.isAllDay ?? false,
      color: input.color || null,
    }),
  })
  const schedule = isRecord(payload) ? mapStaffSchedule(payload) : null
  if (!schedule) throw new ApiError('수정된 일정을 확인하지 못했습니다.', 500)
  return schedule
}

export async function deleteStaffSchedule(id: number): Promise<void> {
  await request<void>(`/api/staff/schedules/${id}/`, { method: 'DELETE' })
}

export async function getScheduleChangeRequests(): Promise<ScheduleChangeRequest[]> {
  const payload = await request<unknown>('/api/staff/schedule-change-requests/')
  return extractList(payload).map(mapScheduleChangeRequest).filter((item): item is ScheduleChangeRequest => item !== null)
}

export async function createScheduleChangeRequest(scheduleId: number, input: {
  requestType: 'UPDATE' | 'CANCEL'
  requestedScheduleType?: StaffScheduleType
  requestedStartsAt?: string
  requestedEndsAt?: string
  reason: string
}): Promise<void> {
  await request<unknown>(`/api/staff/schedules/${scheduleId}/change-requests/`, {
    method: 'POST',
    body: JSON.stringify({
      request_type: input.requestType,
      requested_schedule_type: input.requestedScheduleType ?? null,
      requested_starts_at: input.requestedStartsAt ?? null,
      requested_ends_at: input.requestedEndsAt ?? null,
      reason: input.reason,
    }),
  })
}

export async function cancelScheduleChangeRequest(id: number): Promise<void> {
  await request<unknown>(`/api/staff/schedule-change-requests/${id}/cancel/`, { method: 'POST' })
}

export async function getAdminPendingScheduleRequests(): Promise<ScheduleChangeRequest[]> {
  const payload = await request<unknown>('/api/staff/admin/schedule-change-requests/?status=PENDING')
  return extractList(payload).map(mapScheduleChangeRequest).filter((item): item is ScheduleChangeRequest => item !== null)
}

export async function approveScheduleChangeRequest(id: number, comment = ''): Promise<void> {
  await request<unknown>(`/api/staff/admin/schedule-change-requests/${id}/approve/`, {
    method: 'POST', body: JSON.stringify({ review_comment: comment }),
  })
}

export async function rejectScheduleChangeRequest(id: number, reason: string): Promise<void> {
  await request<unknown>(`/api/staff/admin/schedule-change-requests/${id}/reject/`, {
    method: 'POST', body: JSON.stringify({ rejection_reason: reason }),
  })
}

export async function getAdminOnCallSchedules(from: string, to: string): Promise<StaffSchedule[]> {
  const params = new URLSearchParams({ type: 'ON_CALL', from, to })
  const payload = await request<unknown>(`/api/staff/admin/schedules/?${params}`)
  return extractList(payload).map(mapStaffSchedule).filter((item): item is StaffSchedule => item !== null)
}

export async function getConsultations(): Promise<ConsultationSummary[]> {
  const items = new Map<number, ConsultationSummary>()
  let path = '/api/consultations/'
  const visited = new Set<string>()
  while (path) {
    if (visited.has(path)) throw new ApiError('협진 목록의 페이지 주소가 반복되었습니다.', 500)
    visited.add(path)
    const payload = await request<unknown>(path)
    extractList(payload).map(mapConsultation).forEach((item) => { if (item) items.set(item.id, item) })
    const next = isRecord(payload) ? readString(payload, 'next') : ''
    if (!next) break
    // Never send an auth token to a response-supplied host. Follow only the query on our own API.
    const resolved = new URL(next, 'https://pagination.invalid/api/consultations/')
    if (resolved.pathname !== '/api/consultations/') throw new ApiError('협진 목록의 다음 페이지 경로가 올바르지 않습니다.', 500)
    path = resolved.pathname + resolved.search
  }
  return [...items.values()]
}

export async function getConsultationDetail(id: number): Promise<ConsultationDetail> {
  const payload = await request<unknown>(`/api/consultations/${id}/`)
  if (!isRecord(payload)) throw new ApiError('협진 상세정보를 확인하지 못했습니다.', 500)
  const consultationRecord = nestedRecord(payload, 'consultation') ?? payload
  const consultation = mapConsultation(consultationRecord)
  if (!consultation) throw new ApiError('협진 상세정보를 변환하지 못했습니다.', 500)
  const opinions = Array.isArray(payload.opinions)
    ? payload.opinions.filter(isRecord).map(mapConsultationOpinion).filter((item): item is ConsultationOpinion => item !== null)
    : []
  return { consultation, opinions }
}

export async function createConsultation(input: {
  patientId: number
  subject: string
  note: string
  assignedDoctorId: number
  encounterId?: number
  priority: 'NORMAL' | 'URGENT'
  dueAt?: string
}): Promise<void> {
  await request<unknown>('/api/consultations/', {
    method: 'POST',
    body: JSON.stringify({
      patient_id: input.patientId,
      subject: input.subject,
      note: input.note,
      assigned_doctor_id: input.assignedDoctorId,
      encounter_id: input.encounterId ?? null,
      priority: input.priority,
      due_at: input.dueAt || null,
    }),
  })
}

export async function changeConsultationStatus(id: number, action: 'accept' | 'complete'): Promise<void> {
  await request<unknown>(`/api/consultations/${id}/${action}/`, { method: 'POST' })
}

export async function withdrawConsultation(id: number, reason: string): Promise<void> {
  await request<unknown>(`/api/consultations/${id}/withdraw/`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })
}

export async function addConsultationOpinion(id: number, text: string, isFinal: boolean): Promise<void> {
  await request<unknown>(`/api/consultations/${id}/opinions/`, {
    method: 'POST', body: JSON.stringify({ opinion_text: text, is_final: isFinal }),
  })
}

export async function getChatRooms(): Promise<ChatRoom[]> {
  const payload = await request<unknown>('/api/staff/chat-rooms/')
  return extractList(payload).map(mapChatRoom).filter((item): item is ChatRoom => item !== null)
}

export async function getChatRoom(id: number): Promise<ChatRoom> {
  const payload = await request<unknown>(`/api/staff/chat-rooms/${id}/`)
  const room = isRecord(payload) ? mapChatRoom(payload) : null
  if (!room) throw new ApiError('채팅방 정보를 확인하지 못했습니다.', 500)
  return room
}

export async function createChatRoom(input: {
  roomType: 'DIRECT' | 'GROUP'
  title?: string
  memberUserIds: number[]
}): Promise<void> {
  await request<unknown>('/api/staff/chat-rooms/', {
    method: 'POST',
    body: JSON.stringify({
      type: input.roomType,
      room_type: input.roomType,
      title: input.title || null,
      members: input.memberUserIds,
    }),
  })
}

export async function inviteChatRoomMember(
  roomId: number,
  userId: number,
): Promise<void> {
  await request<unknown>(`/api/staff/chat-rooms/${roomId}/members/`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      role: 'MEMBER',
    }),
  })
}

export async function acceptChatRoomInvite(
  roomId: number,
  memberId: number,
): Promise<void> {
  await request<unknown>(
    `/api/staff/chat-rooms/${roomId}/members/${memberId}/accept/`,
    { method: 'POST' },
  )
}

export async function leaveChatRoom(
  roomId: number,
  memberId: number,
): Promise<void> {
  await request<void>(
    `/api/staff/chat-rooms/${roomId}/members/${memberId}/`,
    { method: 'DELETE' },
  )
}

export async function getChatMessages(roomId: number): Promise<ChatMessage[]> {
  const payload = await request<unknown>(`/api/staff/chat-rooms/${roomId}/messages/?size=100`)
  return extractList(payload).map(mapChatMessage).filter((item): item is ChatMessage => item !== null).sort((a, b) => a.id - b.id)
}

function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export async function sendChatMessage(roomId: number, text: string): Promise<void> {
  await request<unknown>(`/api/staff/chat-rooms/${roomId}/messages/`, {
    method: 'POST',
    body: JSON.stringify({
      client_message_id: createClientMessageId(),
      type: 'TEXT',
      message_type: 'TEXT',
      text,
      message_text: text,
    }),
  })
}

export async function markChatRoomRead(roomId: number, messageId: number): Promise<void> {
  await request<unknown>(`/api/staff/chat-rooms/${roomId}/read/`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  })
}

export function createStaffChatSocket(): WebSocket | null {
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return null
  const base = API_BASE_URL || window.location.origin
  const url = new URL('/ws/staff/chat/', base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return new WebSocket(url.toString())
}

export interface ProcedureRecordData {
  id?: number
  status: string
  procedureName: string
  accessSite: string
  primaryOperatorId?: number
  specialNotes: string
}

export interface ProcedureEventData {
  id: number
  eventCode: string
  eventCategory: string
  eventText: string
  medicationOrDevice: string
  actualDoseOrSpec: string
  note: string
  eventAt: string
  createdByName: string
  prescriptionItemId?: number
}

function mapProcedureRecord(payload: UnknownRecord): ProcedureRecordData {
  const record = nestedRecord(payload, 'latest_record', 'record', 'procedure_record') ?? payload
  return {
    id: readNumber(record, 'id'),
    status: readString(record, 'status') || 'DRAFT',
    procedureName: readString(record, 'procedure_name'),
    accessSite: readString(record, 'access_site'),
    primaryOperatorId: readNumber(record, 'primary_operator_id', 'primary_operator'),
    specialNotes: readString(record, 'special_notes'),
  }
}

function mapProcedureEvent(payload: UnknownRecord): ProcedureEventData | null {
  const id = readNumber(payload, 'id')
  if (id === undefined) return null
  const creator = nestedRecord(payload, 'created_by', 'performed_by')
  return {
    id,
    eventCode: readString(payload, 'event_code'),
    eventCategory: readString(payload, 'event_category', 'category'),
    eventText: readString(payload, 'event_text', 'text'),
    medicationOrDevice: readString(payload, 'medication_or_device'),
    actualDoseOrSpec: readString(payload, 'actual_dose_or_spec'),
    note: readString(payload, 'note'),
    eventAt: readString(payload, 'event_at'),
    createdByName: readPersonName(creator, readString(payload, 'created_by_name')) || '의료진',
    prescriptionItemId: readNumber(payload, 'prescription_item_id', 'prescription_item'),
  }
}

export async function getProcedureRecord(examinationId: number): Promise<ProcedureRecordData> {
  const payload = await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-record/`)
  if (!isRecord(payload)) throw new ApiError('시술기록을 확인하지 못했습니다.', 500)
  return mapProcedureRecord(payload)
}

export async function updateProcedureRecord(examinationId: number, input: {
  procedureName: string
  accessSite: string
  specialNotes: string
  primaryOperatorId?: number
}): Promise<ProcedureRecordData> {
  const payload = await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-record/`, {
    method: 'PATCH',
    body: JSON.stringify({
      procedure_name: input.procedureName,
      access_site: input.accessSite,
      special_notes: input.specialNotes,
      ...(input.primaryOperatorId ? { primary_operator_id: input.primaryOperatorId } : {}),
    }),
  })
  if (!isRecord(payload)) throw new ApiError('저장된 시술기록을 확인하지 못했습니다.', 500)
  return mapProcedureRecord(payload)
}

export async function finalizeProcedureRecord(examinationId: number): Promise<ProcedureRecordData> {
  const payload = await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-record/finalize/`, { method: 'POST' })
  if (!isRecord(payload)) throw new ApiError('확정된 시술기록을 확인하지 못했습니다.', 500)
  return mapProcedureRecord(payload)
}

export async function getProcedureEvents(examinationId: number): Promise<ProcedureEventData[]> {
  const payload = await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-events/`)
  return extractList(payload).map(mapProcedureEvent).filter((item): item is ProcedureEventData => item !== null)
}

export async function createProcedureEvent(examinationId: number, input: {
  eventCode: string
  eventCategory: string
  eventText: string
  medicationOrDevice?: string
  actualDoseOrSpec?: string
  note?: string
  eventAt: string
  prescriptionItemId?: number
}): Promise<ProcedureEventData> {
  const payload = await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-events/`, {
    method: 'POST',
    body: JSON.stringify({
      event_code: input.eventCode,
      client_event_id: createClientMessageId(),
      entry_method: 'MANUAL',
      event_category: input.eventCategory,
      event_text: input.eventText,
      medication_or_device: input.medicationOrDevice || '',
      actual_dose_or_spec: input.actualDoseOrSpec || '',
      note: input.note || '',
      event_at: input.eventAt,
      ...(input.prescriptionItemId ? { prescription_item_id: input.prescriptionItemId } : {}),
    }),
  })
  const mapped = isRecord(payload) ? mapProcedureEvent(payload) : null
  if (!mapped) throw new ApiError('저장된 시술 이벤트를 확인하지 못했습니다.', 500)
  return mapped
}

export async function correctProcedureEvent(eventId: number, input: Record<string, unknown>): Promise<ProcedureEventData> {
  const payload = await request<unknown>(`/api/staff/procedure-events/${eventId}/correct/`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const mapped = isRecord(payload) ? mapProcedureEvent(payload) : null
  if (!mapped) throw new ApiError('정정된 시술 이벤트를 확인하지 못했습니다.', 500)
  return mapped
}

export async function cancelProcedureEvent(eventId: number, reason: string): Promise<void> {
  await request<unknown>(`/api/staff/procedure-events/${eventId}/cancel/`, {
    method: 'POST',
    body: JSON.stringify({ reason, cancel_reason: reason }),
  })
}

export async function getProcedureNursingChart(examinationId: number): Promise<unknown> {
  return request<unknown>(`/api/staff/examinations/${examinationId}/procedure-nursing-chart/`)
}

export async function updateProcedureNursingChart(examinationId: number, input: Record<string, unknown>): Promise<unknown> {
  return request<unknown>(`/api/staff/examinations/${examinationId}/procedure-nursing-chart/`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function finalizeProcedureNursingChart(examinationId: number): Promise<unknown> {
  return request<unknown>(`/api/staff/examinations/${examinationId}/procedure-nursing-chart/finalize/`, { method: 'POST' })
}

export async function getProcedurePrescriptionItems(examinationId: number): Promise<unknown[]> {
  const payload = await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-prescription-items/`)
  return extractList(payload)
}

export async function getProcedureDevices(filters: { category?: string; search?: string; active?: boolean } = {}): Promise<unknown[]> {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.search) params.set('search', filters.search)
  if (filters.active !== undefined) params.set('active', String(filters.active))
  const query = params.size ? `?${params}` : ''
  return extractList(await request<unknown>(`/api/staff/procedure-devices/${query}`))
}

export async function getProcedureDeviceUsages(examinationId: number): Promise<unknown[]> {
  return extractList(await request<unknown>(`/api/staff/examinations/${examinationId}/procedure-device-usages/`))
}

export async function createProcedureDeviceUsage(examinationId: number, input: Record<string, unknown>): Promise<unknown> {
  return request<unknown>(`/api/staff/examinations/${examinationId}/procedure-device-usages/`, { method: 'POST', body: JSON.stringify(input) })
}

export async function correctProcedureDeviceUsage(usageId: number, input: Record<string, unknown>): Promise<unknown> {
  return request<unknown>(`/api/staff/procedure-device-usages/${usageId}/correct/`, { method: 'POST', body: JSON.stringify(input) })
}

export async function cancelProcedureDeviceUsage(usageId: number, reason: string): Promise<unknown> {
  return request<unknown>(`/api/staff/procedure-device-usages/${usageId}/cancel/`, { method: 'POST', body: JSON.stringify({ reason, cancel_reason: reason }) })
}

export async function getMedicationAdministrations(examinationId: number): Promise<unknown[]> {
  return extractList(await request<unknown>(`/api/staff/examinations/${examinationId}/medication-administrations/`))
}

export async function createMedicationAdministration(examinationId: number, input: Record<string, unknown>): Promise<unknown> {
  return request<unknown>(`/api/staff/examinations/${examinationId}/medication-administrations/`, { method: 'POST', body: JSON.stringify(input) })
}

export async function correctMedicationAdministration(administrationId: number, input: Record<string, unknown>): Promise<unknown> {
  return request<unknown>(`/api/staff/medication-administrations/${administrationId}/correct/`, { method: 'POST', body: JSON.stringify(input) })
}

export async function cancelMedicationAdministration(administrationId: number, reason: string): Promise<unknown> {
  return request<unknown>(`/api/staff/medication-administrations/${administrationId}/cancel/`, { method: 'POST', body: JSON.stringify({ reason, cancel_reason: reason }) })
}

export async function getPatientFollowUpRecords(patientId: number): Promise<PatientFollowUpRecords> {
  const payload = await request<unknown>(`/api/patients/${patientId}/follow-up-records/`)
  if (!isRecord(payload)) throw new ApiError('추적관찰 기록을 확인하지 못했습니다.', 500)
  const patient = nestedRecord(payload, 'patient') ?? {}
  const visits = Array.isArray(payload.visits) ? payload.visits.filter(isRecord).map((visit) => ({
    stage: readString(visit, 'stage'),
    stageLabel: readString(visit, 'stage_label') || readString(visit, 'stage'),
    encounterId: readNumber(visit, 'encounter_id') ?? 0,
    visitDate: readString(visit, 'visit_date'),
    status: readString(visit, 'status'),
    doctor: (() => {
      const doctor = nestedRecord(visit, 'doctor')
      return doctor ? {
        id: readNumber(doctor, 'id') ?? 0,
        name: readString(doctor, 'name'),
        departmentName: readString(doctor, 'department_name'),
      } : undefined
    })(),
    note: readString(visit, 'note'),
    examinations: Array.isArray(visit.examinations) ? visit.examinations.filter(isRecord).map((exam) => {
      const type = nestedRecord(exam, 'examination_type') ?? {}
      const result = nestedRecord(exam, 'result')
      const mappedType = mapExaminationType(type) ?? { id: 0, code: '', name: '검사', category: '', modality: '', description: '' }
      return {
        orderId: readNumber(exam, 'order_id') ?? 0,
        examinationId: readNumber(exam, 'examination_id') ?? 0,
        examinationType: mappedType,
        status: readString(exam, 'status'),
        performedAt: readString(exam, 'performed_at'),
        location: readString(exam, 'location'),
        clinicalInput: isRecord(exam.clinical_input_json)
          ? Object.fromEntries(Object.entries(exam.clinical_input_json).filter((entry): entry is [string, number | string] => typeof entry[1] === 'string' || (typeof entry[1] === 'number' && Number.isFinite(entry[1]))))
          : undefined,
        result: result ? {
          id: readNumber(result, 'id') ?? 0,
          resultType: readString(result, 'result_type'),
          status: readString(result, 'status'),
          collectedAt: readString(result, 'collected_at'),
          summaryText: readString(result, 'summary_text'),
          measurements: Array.isArray(result.measurements) ? result.measurements.filter(isRecord).map((measurement) => ({
            id: readNumber(measurement, 'id') ?? 0,
            code: readString(measurement, 'code'),
            name: readString(measurement, 'name'),
            valueNumeric: readNumber(measurement, 'value_numeric'),
            valueText: readString(measurement, 'value_text'),
            valueBoolean: typeof measurement.value_boolean === 'boolean' ? measurement.value_boolean : undefined,
            unit: readString(measurement, 'unit'),
            abnormalFlag: readString(measurement, 'abnormal_flag') || 'UNKNOWN',
            measuredAt: readString(measurement, 'measured_at'),
            referenceLow: readNumber(measurement, 'reference_min'),
            referenceHigh: readNumber(measurement, 'reference_max'),
            referenceRangeText: readString(measurement, 'reference_text'),
          })) : [],
        } : undefined,
      }
    }) : [],
  })) : []
  return {
    patient: {
      id: readNumber(patient, 'id') ?? patientId,
      medicalRecordNo: readString(patient, 'medical_record_no'),
      name: readString(patient, 'name'),
      sex: ['M', 'F'].includes(readString(patient, 'gender')) ? readString(patient, 'gender') as 'M' | 'F' : undefined,
      age: readString(patient, 'birth_date') ? calculateAge(readString(patient, 'birth_date')) : undefined,
    },
    programGroup: readString(payload, 'program_group'),
    isSyntheticDemo: readBoolean(payload, 'is_synthetic_demo'),
    visitCount: readNumber(payload, 'visit_count') ?? visits.length,
    visits,
  }
}

export type ClinicalInputPayload = Record<string, number | string>

export interface CTAIAnalysis {
  analysis: { id: number; status: string }
  jobs: Array<{ id: number; status: string; error_message?: string | null; progress_percent?: number | string | null }>
  results?: Array<{ id: number; result_type: string; summary_text: string; status: string; generated_at: string }>
}

export const CT_AI_READY = import.meta.env.VITE_CT_AI_PIPELINE_READY === 'true'
export const CT_AI_VERSION_ID = Number(import.meta.env.VITE_CT_AI_MODEL_VERSION_ID ?? '')

export function createCTAIAnalysis(examinationId: number, studyId: number, seriesId: number): Promise<CTAIAnalysis> {
  if (![examinationId, studyId, seriesId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    return Promise.reject(new ApiError('분석할 검사와 CT 원본 Series를 선택해주세요.', 400))
  }
  if (!CT_AI_READY || !Number.isSafeInteger(CT_AI_VERSION_ID) || CT_AI_VERSION_ID <= 0) {
    return Promise.reject(new ApiError('CT AI 분석 서버가 아직 연결되지 않았습니다.', 503))
  }
  return request<CTAIAnalysis>(`/api/examinations/${examinationId}/ai-analyses/`, {
    method: 'POST',
    body: JSON.stringify({ analysis_type: 'CCTA', model_version_ids: [CT_AI_VERSION_ID], input_refs: [{ input_type: 'IMAGING_SERIES', imaging_study_id: studyId, imaging_series_id: seriesId }] }),
  })
}

export function getCTAIAnalysis(id: number): Promise<CTAIAnalysis> {
  return request<CTAIAnalysis>(`/api/ai-analyses/${id}/`)
}

export interface ClinicalAIResult {
  id: number
  ai_analysis_job: number
  result_type: 'RISK_PREDICTION'
  summary_text: string
  confidence: number | string | null
  result_json: {
    probability: number
    threshold: number
    prediction: 0 | 1
    warnings: string[]
  }
  generated_at: string
  status: 'VALID' | 'INVALID' | 'REVIEW_REQUIRED'
}

export interface ClinicalAIAnalysis {
  analysis: {
    id: number
    examination: number
    analysis_type: 'CLINICAL'
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    requested_at: string
    completed_at: string | null
  }
  jobs: Array<{
    id: number
    ai_analysis: number
    ai_model_version: number
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    error_code: string | null
    error_message: string | null
    progress_percent: number | string | null
  }>
  inputs: unknown[]
  results?: ClinicalAIResult[]
}

const CLINICAL_MODEL_VERSION_ID = Number(
  import.meta.env.VITE_CLINICAL_MODEL_VERSION_ID ?? '2',
)

export async function createClinicalAIAnalysis(
  examinationId: number,
  input: ClinicalInputPayload,
): Promise<ClinicalAIAnalysis> {
  return request<ClinicalAIAnalysis>(
    `/api/examinations/${examinationId}/ai-analyses/`,
    {
      method: 'POST',
      body: JSON.stringify({
        analysis_type: 'CLINICAL',
        model_version_ids: [CLINICAL_MODEL_VERSION_ID],
        input_refs: [
          {
            input_type: 'CLINICAL_DATA',
            input_snapshot_json: input,
          },
        ],
      }),
    },
  )
}

export async function getClinicalAIAnalysis(
  analysisId: number,
): Promise<ClinicalAIAnalysis> {
  return request<ClinicalAIAnalysis>(
    `/api/ai-analyses/${analysisId}/`,
  )
}
