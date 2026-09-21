import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FlaskConical,
  HeartPulse,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import {
  ApiError,
  createPatientAllergy,
  createProcedureEvent,
  cancelProcedureEvent,
  correctProcedureEvent,
  finalizeProcedureRecord,
  getPatientAllergies,
  getPatientDiagnoses,
  getPatientLabObservations,
  getPatientMedicalHistories,
  getPrescriptionDetail,
  getPrescriptions,
  getProcedureEvents,
  getProcedureRecord,
  updateProcedureRecord,
} from '../api/client'
import type { LabObservation, PatientAllergySummary, PatientDetail, PatientDiagnosisSummary, PatientMedicalHistorySummary, PatientSummary, PrescriptionItemSummary } from '../types'
import { labReferenceStatus, labReferenceStatusClass, labReferenceStatusLabel } from '../labReferenceStatus'

type ProcedureTab = 'TIMELINE' | 'MATERIALS' | 'VITALS' | 'LAB' | 'REPORT'
type ProcedureCategory =
  | '입실'
  | '준비'
  | '혈관 접근'
  | '약물 투여'
  | 'CAG'
  | '소견'
  | 'PCI 시작'
  | 'Guidewire'
  | 'Balloon'
  | 'Stent'
  | '확인'
  | '합병증·Event'
  | '종료'

interface ProcedureEvent {
  id: string
  time: string
  category: ProcedureCategory
  content: string
  material: string
  dose: string
  note: string
  author: string
  linkedPrescriptionItemId?: number
  materialSource?: 'ORDER' | 'CATALOG' | 'MANUAL'
  planned?: boolean
}

interface VitalRecord {
  id: string
  time: string
  systolic: string
  diastolic: string
  heartRate: string
  spo2: string
  rhythm: string
  note: string
}

const categories: ProcedureCategory[] = [
  '입실', '준비', '혈관 접근', '약물 투여', 'CAG', '소견', 'PCI 시작',
  'Guidewire', 'Balloon', 'Stent', '확인', '합병증·Event', '종료',
]

const contentOptions: Record<ProcedureCategory, string[]> = {
  입실: ['Cath lab 입실', '환자·시술 부위 확인', 'Time-out 시행'],
  준비: ['시술 부위 prep & draping', '무균술 시행', '국소마취'],
  '혈관 접근': ['Right radial artery puncture', 'Left radial artery puncture', 'Right femoral artery puncture', 'Left femoral artery puncture'],
  '약물 투여': ['Heparin IV', 'Nitroglycerin IC', 'Sedation', '항혈소판제 투여'],
  CAG: ['Left coronary angiography', 'Right coronary angiography', 'Aortography'],
  소견: ['Significant stenosis 확인', 'TIMI flow 확인', '병변 길이 측정'],
  'PCI 시작': ['LAD wiring', 'LCX wiring', 'RCA wiring', 'LM wiring'],
  Guidewire: ['LAD wiring', 'LCX wiring', 'RCA wiring', 'LM wiring'],
  Balloon: ['Pre-dilatation', 'Post-dilatation'],
  Stent: ['DES implantation', 'BMS implantation'],
  확인: ['Final angiography', 'Residual stenosis 확인', 'TIMI 3 flow 확인', 'IVUS 검사', 'OCT 검사'],
  '합병증·Event': ['Coronary dissection', 'No-reflow', 'Arrhythmia', 'Hypotension', 'Bleeding'],
  종료: ['Catheter / sheath 제거', 'Hemostasis', '회복실 이동'],
}

const materialPlaceholders: Partial<Record<ProcedureCategory, string>> = {
  '혈관 접근': '예: 6Fr sheath (Terumo)',
  '약물 투여': '예: Heparin',
  CAG: '예: JL 3.5 catheter',
  'PCI 시작': '예: Sion Blue guidewire',
  Guidewire: '예: Sion Blue',
  Balloon: '예: Balloon',
  Stent: '예: Xience Skypoint',
}

const materialOptions: Record<ProcedureCategory, string[]> = {
  입실: [],
  준비: ['Lidocaine', 'Chlorhexidine', 'Povidone-iodine'],
  '혈관 접근': ['5Fr sheath (Terumo)', '6Fr sheath (Terumo)', '7Fr sheath (Terumo)', 'Micropuncture set'],
  '약물 투여': ['Heparin', 'Nitroglycerin', 'Verapamil', 'Midazolam', 'Fentanyl', 'Atropine', 'Adenosine', 'Protamine'],
  CAG: ['JL 3.5 catheter', 'JL 4.0 catheter', 'JR 4.0 catheter', 'Tiger catheter', 'Contrast'],
  소견: [],
  'PCI 시작': ['Sion Blue guidewire', 'Runthrough NS guidewire', 'BMW Universal II guidewire'],
  Guidewire: ['Sion Blue guidewire', 'Runthrough NS guidewire', 'BMW Universal II guidewire', 'Fielder XT guidewire'],
  Balloon: ['Semi-compliant balloon', 'Non-compliant balloon', 'Cutting balloon', 'Drug-coated balloon'],
  Stent: ['Xience Skypoint DES', 'Resolute Onyx DES', 'Synergy XD DES', 'Ultimaster Tansei DES'],
  확인: ['IVUS catheter', 'OCT catheter', 'FFR pressure wire', 'Contrast'],
  '합병증·Event': ['Pericardiocentesis set', 'Temporary pacemaker', 'Defibrillator', 'IABP'],
  종료: ['TR Band', 'Angio-Seal', 'Perclose ProGlide', 'Femostop'],
}

const quickDeviceOptions: Array<{
  label: string
  category: ProcedureCategory
  content: string
  material: string
}> = [
  { label: '6Fr Sheath', category: '혈관 접근', content: 'Right radial artery puncture', material: '6Fr sheath (Terumo)' },
  { label: 'JL 3.5', category: 'CAG', content: 'Left coronary angiography', material: 'JL 3.5 catheter' },
  { label: 'JR 4.0', category: 'CAG', content: 'Right coronary angiography', material: 'JR 4.0 catheter' },
  { label: 'Sion Blue', category: 'Guidewire', content: 'LAD wiring', material: 'Sion Blue guidewire' },
  { label: 'NC Balloon', category: 'Balloon', content: 'Post-dilatation', material: 'Non-compliant balloon' },
  { label: 'Xience DES', category: 'Stent', content: 'DES implantation', material: 'Xience Skypoint DES' },
  { label: 'IVUS', category: '확인', content: 'IVUS 검사', material: 'IVUS catheter' },
  { label: 'TR Band', category: '종료', content: 'Hemostasis', material: 'TR Band' },
]

const templateDefinitions = [
  { id: 'CAG_RADIAL', label: 'CAG - Radial', categories: ['입실', '준비', '혈관 접근', 'CAG', 'CAG', '확인', '종료'] as ProcedureCategory[] },
  { id: 'CAG_FEMORAL', label: 'CAG - Femoral', categories: ['입실', '준비', '혈관 접근', 'CAG', 'CAG', '확인', '종료'] as ProcedureCategory[] },
  { id: 'PCI_RADIAL', label: 'CAG + PCI - Radial', categories: ['입실', '준비', '혈관 접근', 'CAG', 'CAG', 'PCI 시작', 'Balloon', 'Stent', '확인', '종료'] as ProcedureCategory[] },
  { id: 'PCI_FEMORAL', label: 'CAG + PCI - Femoral', categories: ['입실', '준비', '혈관 접근', 'CAG', 'CAG', 'PCI 시작', 'Balloon', 'Stent', '확인', '종료'] as ProcedureCategory[] },
]

function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function emptyEvent(author: string): ProcedureEvent {
  return { id: createId('event'), time: nowTime(), category: '입실', content: '', material: '', dose: '', note: '', author }
}

function emptyVital(): VitalRecord {
  return { id: createId('vital'), time: nowTime(), systolic: '', diastolic: '', heartRate: '', spo2: '', rhythm: 'Sinus', note: '' }
}

function formatPatientBirth(value: string) {
  if (!value) return '생년월일 미등록'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR').format(date)
}

function formatLabDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date)
}

function flagLabel(item: LabObservation) {
  return labReferenceStatusLabel(labReferenceStatus(item))
}

function prescriptionDose(item: PrescriptionItemSummary) {
  return [item.doseValue, item.doseUnit].filter((value) => value !== undefined && value !== '').join(' ')
}

export function ProcedureRecordWorkspace({
  patient,
  patientDetail,
  clinicianName,
  encounterId,
  examinationId,
  onOpenPatient,
}: {
  patient: PatientSummary | null
  patientDetail: PatientDetail | null
  clinicianName: string
  encounterId: number | null
  examinationId?: number
  onOpenPatient: (patientId: string) => void
}) {
  const [activeTab, setActiveTab] = useState<ProcedureTab>('TIMELINE')
  const [procedureType, setProcedureType] = useState('CAG + PCI')
  const [accessSite, setAccessSite] = useState('Right radial artery')
  const [events, setEvents] = useState<ProcedureEvent[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)
  const [eventDraft, setEventDraft] = useState<ProcedureEvent>(() => emptyEvent(clinicianName))
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false)
  const [vitals, setVitals] = useState<VitalRecord[]>([])
  const [vitalDraft, setVitalDraft] = useState<VitalRecord>(emptyVital)
  const [vitalAdding, setVitalAdding] = useState(false)
  const [memo, setMemo] = useState('')
  const [labs, setLabs] = useState<LabObservation[]>([])
  const [labLoading, setLabLoading] = useState(false)
  const [labError, setLabError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const [allergies, setAllergies] = useState<PatientAllergySummary[]>([])
  const [allergyLoading, setAllergyLoading] = useState(false)
  const [allergyError, setAllergyError] = useState('')
  const [allergyDraft, setAllergyDraft] = useState('')
  const [allergyEditing, setAllergyEditing] = useState(false)
  const [allergySaving, setAllergySaving] = useState(false)
  const [diagnoses, setDiagnoses] = useState<PatientDiagnosisSummary[]>([])
  const [medicalHistories, setMedicalHistories] = useState<PatientMedicalHistorySummary[]>([])
  const [clinicalInfoError, setClinicalInfoError] = useState('')
  const [orderedMedications, setOrderedMedications] = useState<PrescriptionItemSummary[]>([])
  const [prescriptionLoading, setPrescriptionLoading] = useState(false)
  const [prescriptionError, setPrescriptionError] = useState('')
  const [procedureSaving, setProcedureSaving] = useState(false)
  const [recordStatus, setRecordStatus] = useState('DRAFT')
  const [materialMenuFlip, setMaterialMenuFlip] = useState(false)
  const materialPickerRef = useRef<HTMLSpanElement>(null)
  const recordLocked = recordStatus === 'FINAL'

  useEffect(() => {
    setEvents([])
    setVitals([])
    setMemo('')
    setAllergyDraft('')
    setAllergyEditing(false)
    setEditingId(null)
    setInsertIndex(null)
    setMaterialPickerOpen(false)
    setSaveNotice('')
  }, [patient?.backendId])

  useEffect(() => {
    if (!patient?.backendId) {
      setAllergies([])
      setDiagnoses([])
      setMedicalHistories([])
      setAllergyError('')
      setClinicalInfoError('')
      return
    }
    let active = true
    setAllergyLoading(true)
    setAllergyError('')
    setClinicalInfoError('')
    void getPatientAllergies(patient.backendId)
      .then((items) => { if (active) setAllergies(items) })
      .catch((error) => { if (active) { setAllergies([]); setAllergyError(error instanceof Error ? error.message : '알레르기 정보를 불러오지 못했습니다.') } })
      .finally(() => { if (active) setAllergyLoading(false) })
    void Promise.allSettled([getPatientDiagnoses(patient.backendId), getPatientMedicalHistories(patient.backendId)])
      .then(([diagnosisResult, historyResult]) => {
        if (!active) return
        setDiagnoses(diagnosisResult.status === 'fulfilled' ? diagnosisResult.value : [])
        setMedicalHistories(historyResult.status === 'fulfilled' ? historyResult.value : [])
        if (diagnosisResult.status === 'rejected' || historyResult.status === 'rejected') {
          setClinicalInfoError('진단명 또는 기저질환 정보를 일부 불러오지 못했습니다.')
        }
      })
    return () => { active = false }
  }, [patient?.backendId])

  const activeAllergies = allergies.filter((item) => item.status === 'ACTIVE' && !item.isNoKnownAllergy)
  const noKnownAllergyConfirmed = allergies.some((item) => item.status === 'ACTIVE' && item.isNoKnownAllergy)
  const allergySummaryText = allergyLoading
    ? '조회 중…'
    : activeAllergies.length
      ? activeAllergies.map((item) => item.allergenName || item.allergenType || '기록됨').join(', ')
      : noKnownAllergyConfirmed ? '알레르기 없음' : '미입력'
  const activeMedicalHistories = medicalHistories.filter((item) => item.status === 'ACTIVE')
  const diagnosisSummaryText = diagnoses.length ? diagnoses.map((item) => item.name || item.code).join(', ') : '등록된 진단 없음'
  const medicalHistorySummaryText = activeMedicalHistories.length ? activeMedicalHistories.map((item) => item.conditionName).join(', ') : '등록된 기저질환 없음'

  const submitAllergy = async (input: { isNoKnownAllergy?: boolean; allergenName?: string }) => {
    if (!patient?.backendId) {
      setSaveNotice('알레르기를 저장할 환자가 선택되지 않았습니다.')
      return
    }
    setAllergySaving(true)
    try {
      const created = await createPatientAllergy(patient.backendId, input.isNoKnownAllergy
        ? { isNoKnownAllergy: true }
        : { allergenType: 'OTHER', allergenName: input.allergenName })
      setAllergies((current) => [created, ...current.map((item) => (item.status === 'ACTIVE' ? { ...item, status: 'INACTIVE' } : item))])
      setAllergyDraft('')
      setAllergyEditing(false)
      setSaveNotice('알레르기 정보를 저장했습니다.')
    } catch (requestError) {
      setSaveNotice(requestError instanceof Error ? requestError.message : '알레르기 정보를 저장하지 못했습니다.')
    } finally {
      setAllergySaving(false)
    }
  }

  useEffect(() => {
    if (!examinationId) return
    let active = true
    void Promise.allSettled([getProcedureRecord(examinationId), getProcedureEvents(examinationId)])
      .then(([recordResult, eventResult]) => {
        if (!active) return
        if (recordResult.status === 'fulfilled') {
          const record = recordResult.value
          if (record.procedureName) setProcedureType(record.procedureName)
          if (record.accessSite) setAccessSite(record.accessSite)
          setMemo(record.specialNotes)
          setRecordStatus(record.status)
        }
        if (eventResult.status === 'fulfilled') {
          setEvents(eventResult.value.map((item) => {
            const eventDate = new Date(item.eventAt)
            const category = categories.includes(item.eventCategory as ProcedureCategory)
              ? item.eventCategory as ProcedureCategory
              : '소견'
            return {
              id: String(item.id),
              time: Number.isNaN(eventDate.getTime()) ? '' : eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              category,
              content: item.eventText || item.eventCode,
              material: item.medicationOrDevice,
              dose: item.actualDoseOrSpec,
              note: item.note,
              author: item.createdByName,
              linkedPrescriptionItemId: item.prescriptionItemId,
              materialSource: item.prescriptionItemId ? 'ORDER' : item.medicationOrDevice ? 'MANUAL' : undefined,
              planned: false,
            }
          }))
        }
      })
    return () => { active = false }
  }, [examinationId])

  useEffect(() => {
    if (!patient?.backendId) {
      setOrderedMedications([])
      setPrescriptionError('')
      return
    }

    let active = true
    setOrderedMedications([])
    setPrescriptionLoading(true)
    setPrescriptionError('')

    void getPrescriptions(patient.backendId)
      .then(async (prescriptions) => {
        const available = prescriptions.filter((item) => item.status !== 'CANCELED')
        const relevant = encounterId
          ? available.filter((item) => item.encounterId === encounterId)
          : available.slice(0, 1)
        const details = await Promise.all(relevant.map((item) => getPrescriptionDetail(item.id)))
        if (active) setOrderedMedications(details.flatMap((detail) => detail.items).filter((item) => item.status !== 'CANCELED'))
      })
      .catch((error) => {
        if (!active) return
        setOrderedMedications([])
        setPrescriptionError(error instanceof Error ? error.message : '처방 오더를 불러오지 못했습니다.')
      })
      .finally(() => { if (active) setPrescriptionLoading(false) })

    return () => { active = false }
  }, [encounterId, patient?.backendId])

  useLayoutEffect(() => {
    if (!materialPickerOpen || !materialPickerRef.current) {
      setMaterialMenuFlip(false)
      return
    }
    const rect = materialPickerRef.current.getBoundingClientRect()
    setMaterialMenuFlip(window.innerHeight - rect.bottom < 280)
  }, [materialPickerOpen, editingId, insertIndex])

  useEffect(() => {
    if (!patient?.backendId) {
      setLabs([])
      return
    }
    let active = true
    setLabLoading(true)
    setLabError('')
    void getPatientLabObservations(patient.backendId)
      .then((items) => { if (active) setLabs(items) })
      .catch((error) => { if (active) setLabError(error instanceof Error ? error.message : '최근 검사 결과를 불러오지 못했습니다.') })
      .finally(() => { if (active) setLabLoading(false) })
    return () => { active = false }
  }, [patient?.backendId])

  const recentLabs = useMemo(() => [...labs]
    .sort((a, b) => `${b.measuredAt}-${b.id}`.localeCompare(`${a.measuredAt}-${a.id}`))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.code === item.code) === index)
    .slice(0, 7), [labs])

  const medications = events.filter((event) => event.category === '약물 투여' && event.material)
  const devices = events.filter((event) => ['혈관 접근', 'CAG', 'PCI 시작', 'Guidewire', 'Balloon', 'Stent'].includes(event.category) && event.material)
  const procedureMedicationOptions = useMemo(() => {
    const ordered = orderedMedications
      .map((item) => item.medication?.name)
      .filter((name): name is string => Boolean(name))
    return Array.from(new Set([...ordered, ...materialOptions['약물 투여']]))
  }, [orderedMedications])

  const beginAdd = (index: number) => {
    if (recordLocked) return
    setEventDraft(emptyEvent(clinicianName))
    setInsertIndex(index)
    setEditingId(null)
    setMaterialPickerOpen(false)
  }

  const beginEdit = (event: ProcedureEvent) => {
    if (recordLocked) return
    setEventDraft({ ...event, time: event.time || nowTime(), planned: false })
    setEditingId(event.id)
    setInsertIndex(null)
    setMaterialPickerOpen(false)
  }

  const selectMedication = (medicationName: string) => {
    const linkedOrder = orderedMedications.find((item) => item.medication?.name === medicationName)
    setEventDraft((current) => ({
      ...current,
      category: '약물 투여',
      content: `${medicationName} 투여`,
      material: medicationName,
      dose: linkedOrder ? prescriptionDose(linkedOrder) : '',
      linkedPrescriptionItemId: linkedOrder?.id,
      materialSource: linkedOrder ? 'ORDER' : 'CATALOG',
    }))
    setMaterialPickerOpen(false)
  }

  const selectDevice = (device: (typeof quickDeviceOptions)[number]) => {
    setEventDraft((current) => ({
      ...current,
      category: device.category,
      content: device.content,
      material: device.material,
      dose: '',
      linkedPrescriptionItemId: undefined,
      materialSource: 'CATALOG',
    }))
    setMaterialPickerOpen(false)
  }

  const cancelEventEdit = () => {
    setEditingId(null)
    setInsertIndex(null)
    setMaterialPickerOpen(false)
  }

  const saveEvent = async () => {
    if (recordLocked) return
    if (!eventDraft.time || !eventDraft.category || !eventDraft.content.trim()) return
    let saved = { ...eventDraft, content: eventDraft.content.trim(), planned: false, author: clinicianName }
    if (editingId && /^\d+$/.test(editingId) && examinationId) {
      try {
        const [hour = '00', minute = '00'] = saved.time.split(':')
        const eventAt = new Date()
        eventAt.setHours(Number(hour), Number(minute), 0, 0)
        const corrected = await correctProcedureEvent(Number(editingId), {
          correction_reason: '의료진 화면에서 시술 이벤트 수정',
          event_category: saved.category,
          event_text: saved.content,
          medication_or_device: saved.material,
          actual_dose_or_spec: saved.dose,
          note: saved.note,
          event_at: eventAt.toISOString(),
          prescription_item_id: saved.linkedPrescriptionItemId ?? null,
        })
        saved = { ...saved, id: String(corrected.id), author: corrected.createdByName || clinicianName }
      } catch (requestError) {
        setSaveNotice(requestError instanceof Error ? requestError.message : '시술 이벤트를 정정하지 못했습니다.')
        return
      }
    }
    if (editingId) {
      setEvents((current) => current.map((event) => event.id === editingId ? saved : event))
    } else {
      setEvents((current) => {
        const next = [...current]
        next.splice(insertIndex ?? current.length, 0, saved)
        return next
      })
    }
    setEditingId(null)
    setInsertIndex(null)
    setSaveNotice('저장되지 않은 로컬 변경사항이 있습니다.')
  }

  const updateMaterial = (value: string) => {
    const linkedOrder = orderedMedications.find((item) => item.medication?.name.trim().toLowerCase() === value.trim().toLowerCase())
    setEventDraft((current) => ({
      ...current,
      material: value,
      linkedPrescriptionItemId: linkedOrder?.id,
      materialSource: linkedOrder
        ? 'ORDER'
        : materialOptions[current.category].some((option) => option.toLowerCase() === value.trim().toLowerCase())
          ? 'CATALOG'
          : value.trim() ? 'MANUAL' : undefined,
      dose: linkedOrder && !current.dose ? prescriptionDose(linkedOrder) : current.dose,
    }))
  }

  const deleteEvent = async (event: ProcedureEvent) => {
    if (recordLocked) return
    if (!window.confirm('이 시술기록을 삭제하시겠습니까?')) return
    if (/^\d+$/.test(event.id)) {
      try {
        await cancelProcedureEvent(Number(event.id), '의료진 화면에서 시술 이벤트 취소')
      } catch (requestError) {
        setSaveNotice(requestError instanceof Error ? requestError.message : '시술 이벤트를 취소하지 못했습니다.')
        return
      }
    }
    setEvents((current) => current.filter((item) => item.id !== event.id))
    setSaveNotice(/^\d+$/.test(event.id) ? '시술 이벤트를 취소했습니다.' : '저장되지 않은 로컬 변경사항이 있습니다.')
  }

  const loadTemplate = (templateId: string) => {
    if (recordLocked) {
      setSaveNotice('확정된 시술기록은 템플릿으로 바꿀 수 없습니다.')
      return
    }
    const template = templateDefinitions.find((item) => item.id === templateId)
    if (!template) return
    if (events.length && !window.confirm('현재 작성 중인 기록을 템플릿으로 교체할까요?')) return
    const radial = template.id.endsWith('RADIAL')
    const nextEvents = template.categories.map((category, index) => {
      const occurrence = template.categories.slice(0, index + 1).filter((item) => item === category).length
      let content = contentOptions[category][0] ?? ''
      if (category === '혈관 접근') content = radial ? 'Right radial artery puncture' : 'Right femoral artery puncture'
      if (category === 'CAG') content = occurrence === 1 ? 'Left coronary angiography' : 'Right coronary angiography'
      return { ...emptyEvent('템플릿'), id: createId('template'), time: '', category, content, author: '템플릿', planned: true }
    })
    setProcedureType(template.id.startsWith('PCI') ? 'CAG + PCI' : 'CAG')
    setAccessSite(radial ? 'Right radial artery' : 'Right femoral artery')
    setEvents(nextEvents)
    setSaveNotice('템플릿 순서만 불러왔습니다. 실제 시간과 시행 내용을 확인해주세요.')
  }

  const addVital = (event: FormEvent) => {
    event.preventDefault()
    if (!vitalDraft.time || !vitalDraft.systolic || !vitalDraft.diastolic) return
    setVitals((current) => [...current, vitalDraft])
    setVitalDraft(emptyVital())
    setVitalAdding(false)
    setSaveNotice('저장되지 않은 로컬 변경사항이 있습니다.')
  }

  const saveProcedureToServer = async (finalize: boolean) => {
    if (!examinationId || procedureSaving) {
      if (!examinationId) setSaveNotice('연결할 검사 ID가 없습니다. 검사 실행 기록을 먼저 선택해주세요.')
      return
    }
    if (recordLocked) {
      setSaveNotice('이미 확정된 시술기록입니다.')
      return
    }
    setProcedureSaving(true)
    setSaveNotice('')
    try {
      let record
      try {
        record = await updateProcedureRecord(examinationId, {
          procedureName: procedureType,
          accessSite,
          specialNotes: memo,
        })
      } catch (requestError) {
        if (finalize && requestError instanceof ApiError && requestError.status === 409) {
          const existing = await getProcedureRecord(examinationId)
          if (existing.status === 'FINAL') {
            setRecordStatus('FINAL')
            setSaveNotice('이미 확정된 시술기록입니다.')
            return
          }
        }
        throw requestError
      }
      const savedEvents = [...events]
      for (let index = 0; index < savedEvents.length; index += 1) {
        const item = savedEvents[index]
        if (/^\d+$/.test(item.id) || !item.content.trim()) continue
        const time = item.time || nowTime()
        const [hour = '00', minute = '00'] = time.split(':')
        const eventAt = new Date()
        eventAt.setHours(Number(hour), Number(minute), 0, 0)
        const saved = await createProcedureEvent(examinationId, {
          eventCode: item.category.replace(/\s+/g, '_').toUpperCase(),
          eventCategory: item.category,
          eventText: item.content,
          medicationOrDevice: item.material,
          actualDoseOrSpec: item.dose,
          note: item.note,
          eventAt: eventAt.toISOString(),
          prescriptionItemId: item.linkedPrescriptionItemId,
          procedureRecordId: record.id,
        })
        savedEvents[index] = {
          ...item,
          id: String(saved.id),
          time,
          planned: false,
          author: saved.createdByName || clinicianName,
        }
      }
      setEvents(savedEvents)
      if (finalize) {
        const finalized = await finalizeProcedureRecord(examinationId)
        setRecordStatus(finalized.status || 'FINAL')
        setSaveNotice('시술기록을 최종 확정했습니다.')
      } else {
        setRecordStatus(record.status || 'DRAFT')
        setSaveNotice('시술기록 임시저장을 완료했습니다.')
      }
    } catch (requestError) {
      setSaveNotice(requestError instanceof Error ? requestError.message : '시술기록을 저장하지 못했습니다.')
    } finally {
      setProcedureSaving(false)
    }
  }

  const renderEventEditor = () => (
    <div className="procedure-timeline-row editing">
      <span className="procedure-node"><i /></span>
      <ProcedureTimeEditor value={eventDraft.time} onChange={(time) => setEventDraft((current) => ({ ...current, time }))} />
      <select aria-label="기록 구분" value={eventDraft.category} onChange={(event) => setEventDraft((current) => ({ ...current, category: event.target.value as ProcedureCategory, content: '', material: '', linkedPrescriptionItemId: undefined, materialSource: undefined }))}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
      <span className="procedure-combobox"><input aria-label="시술 또는 처치 내용" list="procedure-content-options" value={eventDraft.content} onChange={(event) => setEventDraft((current) => ({ ...current, content: event.target.value }))} placeholder="선택 또는 직접 입력" /><ChevronDown size={13} aria-hidden="true" /><datalist id="procedure-content-options">{contentOptions[eventDraft.category].map((option) => <option key={option} value={option} />)}</datalist></span>
      <span className="procedure-combobox procedure-material-picker" ref={materialPickerRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMaterialPickerOpen(false) }}>
        <input aria-label="사용 약물 또는 기구" value={eventDraft.material} onChange={(event) => updateMaterial(event.target.value)} onFocus={() => setMaterialPickerOpen(true)} placeholder={materialPlaceholders[eventDraft.category] ?? '선택 또는 직접 입력'} />
        <button aria-label="약물 및 기구 선택 목록" aria-expanded={materialPickerOpen} onClick={() => setMaterialPickerOpen((current) => !current)} type="button"><ChevronDown size={13} aria-hidden="true" /></button>
        {materialPickerOpen && (
          <div className={`procedure-material-menu${materialMenuFlip ? ' flip-up' : ''}`}>
            <section><header><strong>약물</strong><small>처방 약물 및 시술실 기본 약물</small></header><div>{procedureMedicationOptions.map((medication) => { const ordered = orderedMedications.some((item) => item.medication?.name === medication); return <button className={ordered ? 'ordered' : ''} key={medication} onClick={() => selectMedication(medication)} type="button"><span>{medication}</span>{ordered && <small>처방</small>}</button> })}</div></section>
            <section><header><strong>기구</strong><small>카테터·와이어·벌룬·스텐트·지혈기구</small></header><div>{quickDeviceOptions.map((device) => <button key={`${device.category}-${device.material}`} onClick={() => selectDevice(device)} title={device.material} type="button"><span>{device.label}</span><small>{device.category}</small></button>)}</div></section>
            <footer>목록에 없는 항목은 입력란에 직접 작성할 수 있습니다.</footer>
          </div>
        )}
      </span>
      <input aria-label="용량 또는 규격" value={eventDraft.dose} onChange={(event) => setEventDraft((current) => ({ ...current, dose: event.target.value }))} placeholder="용량 / 규격" />
      <input aria-label="비고" value={eventDraft.note} onChange={(event) => setEventDraft((current) => ({ ...current, note: event.target.value }))} placeholder="비고" />
      <span className="procedure-row-author">{clinicianName}</span>
      <span className="procedure-row-actions"><button className="save" onClick={() => void saveEvent()} disabled={!eventDraft.time || !eventDraft.content.trim()} title="기록 저장" type="button"><Check size={15} /></button><button onClick={cancelEventEdit} title="입력 취소" type="button"><X size={15} /></button></span>
    </div>
  )

  const tabLabels: Array<{ id: ProcedureTab; label: string }> = [
    { id: 'TIMELINE', label: '시술 타임라인' },
    { id: 'MATERIALS', label: '사용 약물/기구' },
    { id: 'VITALS', label: '환자 상태' },
    { id: 'LAB', label: '검사 결과' },
    { id: 'REPORT', label: '보고서' },
  ]

  return (
    <section className="feature-page procedure-page">
      <header className="procedure-global-header">
        <div className="procedure-breadcrumb"><span>시술기록</span><ChevronRight size={14} /><span>CAG / PCI</span><ChevronRight size={14} /><strong>{recordLocked ? '시술기록' : '시술기록 작성'}</strong></div>
        <div><span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</span><b>{clinicianName}</b><button disabled={procedureSaving || !examinationId || recordLocked} type="button" onClick={() => void saveProcedureToServer(false)}>임시저장</button><button className="feature-primary" disabled={procedureSaving || !examinationId || recordLocked} type="button" onClick={() => void saveProcedureToServer(true)}><Save size={14} />{procedureSaving ? '저장 중…' : recordLocked ? '확정됨' : '최종 확정'}</button></div>
      </header>

      <section className="feature-card procedure-patient-banner">
        <div className="procedure-patient-name"><strong>{patient?.name ?? '환자 미선택'}</strong><span>{patientDetail?.medicalRecordNo || patient?.id || '-'}</span></div>
        <div><b>{patient?.age ?? '-'}세</b><span>{patient?.sex ?? '-'} · {formatPatientBirth(patientDetail?.birthDate ?? '')}</span><small>진단명: {diagnosisSummaryText} · 예정 {patient?.exam || '-'}</small></div>
        <div className={`procedure-alert ${activeAllergies.length ? 'recorded' : ''}`}>
          {allergyEditing ? (
            <form onSubmit={(event) => { event.preventDefault(); if (allergyDraft.trim()) void submitAllergy({ allergenName: allergyDraft.trim() }) }}>
              <input autoFocus aria-label="알레르기 직접 입력" value={allergyDraft} onChange={(event) => setAllergyDraft(event.target.value)} placeholder="예: 조영제(Iodine) 발진" disabled={allergySaving} />
              <button className="none" disabled={allergySaving} onClick={() => void submitAllergy({ isNoKnownAllergy: true })} type="button">없음</button>
              <button className="save" disabled={allergySaving || !allergyDraft.trim()} title="알레르기 저장" type="submit"><Check size={13} /></button>
              <button disabled={allergySaving} onClick={() => { setAllergyDraft(''); setAllergyEditing(false) }} title="입력 취소" type="button"><X size={13} /></button>
            </form>
          ) : (
            <><AlertTriangle size={14} /><span>{allergyError || (activeAllergies.length ? `Allergy: ${allergySummaryText}` : allergySummaryText === '알레르기 없음' ? '알레르기 없음' : '알레르기 미입력')}</span><button onClick={() => { setAllergyDraft(''); setAllergyEditing(true) }} type="button">{activeAllergies.length || noKnownAllergyConfirmed ? '수정' : '입력'}</button></>
          )}
        </div>
        <label>시술명<select disabled={recordLocked} value={procedureType} onChange={(event) => setProcedureType(event.target.value)}><option>CAG</option><option>PCI</option><option>CAG + PCI</option></select></label>
        <div><span>담당 의료진</span><strong>{clinicianName}</strong></div>
        <div><span>시술 상태</span><strong>{recordLocked ? '확정' : '작성 중'}</strong></div>
        <label>접근부위<select disabled={recordLocked} value={accessSite} onChange={(event) => setAccessSite(event.target.value)}><option>Right radial artery</option><option>Left radial artery</option><option>Right femoral artery</option><option>Left femoral artery</option></select></label>
      </section>

      <nav className="procedure-tabs">
        {tabLabels.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>)}
      </nav>

      <div className="procedure-layout">
        <main className="procedure-main-column">
          {activeTab === 'TIMELINE' && (
            <section className="feature-card procedure-timeline-card">
              <header><div><h2>시술 타임라인</h2><p>시술 중 발생한 내용을 시간순으로 직접 기록합니다.</p></div><span className="procedure-draft-badge">{recordLocked ? '확정됨' : '로컬 초안'}</span></header>
              <div className="procedure-timeline-table">
                <div className="procedure-timeline-head"><span /><span>시간</span><span>구분</span><span>시술/처치 내용</span><span>사용 약물/기구</span><span>용량/규격</span><span>비고</span><span>작성자</span><span /></div>
                {events.map((event, index) => (
                  <div key={event.id} className="procedure-row-wrap">
                    {!recordLocked && <button className="procedure-insert-button" onClick={() => beginAdd(index)} title="이 위치에 기록 추가" type="button"><Plus size={14} /></button>}
                    {insertIndex === index && renderEventEditor()}
                    {editingId === event.id ? renderEventEditor() : (
                      <div className={`procedure-timeline-row ${event.planned ? 'planned' : ''}`}>
                        <span className="procedure-node"><i /></span><button className={`procedure-time-display ${event.time ? '' : 'empty'}`} onClick={() => beginEdit(event)} title={event.time ? '시간 수정' : '현재 시간으로 기록'} type="button">{event.time || '미기록'}</button><b>{event.category}</b><span>{event.content || '-'}</span><span className="procedure-material-cell">{event.material || '-'}{event.linkedPrescriptionItemId && <small>처방 연동</small>}</span><span>{event.dose || '-'}</span><span>{event.note || '-'}</span><span className="procedure-row-author">{event.author}</span><span className="procedure-row-actions">{!recordLocked && <><button onClick={() => beginEdit(event)} title="수정" type="button"><Pencil size={14} /></button><button className="delete" onClick={() => deleteEvent(event)} title="삭제" type="button"><Trash2 size={14} /></button></>}</span>
                      </div>
                    )}
                  </div>
                ))}
                {insertIndex === events.length && renderEventEditor()}
                {!recordLocked && <button className="procedure-add-record" onClick={() => beginAdd(events.length)} type="button"><Plus size={16} />새로운 기록 추가 <small>현재 시간 {nowTime()}</small></button>}
              </div>
            </section>
          )}

          {activeTab === 'MATERIALS' && (
            <section className="feature-card procedure-summary-card"><header><div><h2>사용 약물 / 기구</h2><p>처방 오더와 실제 시술 사용 기록을 구분해 표시합니다.</p></div><span className="procedure-order-count">처방 오더 {orderedMedications.length}건</span></header><div className="procedure-order-reference"><h3>현재 진료 처방 오더</h3>{prescriptionLoading ? <p>처방 오더를 불러오는 중…</p> : prescriptionError ? <p className="error">{prescriptionError}</p> : orderedMedications.length ? orderedMedications.map((item) => <div key={item.id}><strong>{item.medication?.name ?? `약품 #${item.medicationId}`}</strong><span>{prescriptionDose(item) || '-'}</span><small>{item.route || '경로 미지정'}</small></div>) : <p>현재 진료 건에 연결된 처방 오더가 없습니다.</p>}</div><div className="procedure-material-grid"><section><h3>실제 사용 약물</h3>{medications.map((item) => <div key={item.id}><strong>{item.material}{item.linkedPrescriptionItemId && <small className="linked">처방 연동</small>}</strong><span>{item.dose || '-'}</span><small>{item.time}</small></div>)}{!medications.length && <p>타임라인에 기록된 약물이 없습니다.</p>}</section><section><h3>실제 사용 기구</h3>{devices.map((item) => <div key={item.id}><strong>{item.material}</strong><span>{item.dose || '-'}</span><small>{item.category}</small></div>)}{!devices.length && <p>타임라인에 기록된 기구가 없습니다.</p>}</section></div></section>
          )}

          {activeTab === 'VITALS' && (
            <section className="feature-card procedure-summary-card"><header><div><h2>환자 상태</h2><p>장비 실시간 연동이 아닌 의료진 직접 입력 기록입니다.</p></div><button className="procedure-outline-button" onClick={() => setVitalAdding(true)} type="button"><Plus size={14} />추가</button></header><VitalTable vitals={vitals} onDelete={(id) => setVitals((current) => current.filter((item) => item.id !== id))} /></section>
          )}

          {activeTab === 'LAB' && (
            <section className="feature-card procedure-summary-card"><header><div><h2>최근 검사 결과</h2><p>환자 혈액검사 API의 최신 결과를 표시합니다.</p></div></header><LabTable labs={recentLabs} loading={labLoading} error={labError} /></section>
          )}

          {activeTab === 'REPORT' && (
            <section className="feature-card procedure-summary-card"><header><div><h2>시술기록 요약</h2><p>기록된 타임라인을 기반으로 보고서 초안을 구성합니다.</p></div><span className="procedure-draft-badge">{recordStatus}</span></header><div className="procedure-report-preview"><h3>{procedureType} Procedure Note</h3><p><b>Patient</b>{patient?.name ?? '-'} ({patient?.id ?? '-'})</p><p><b>Access</b>{accessSite}</p><p><b>Operator</b>{clinicianName}</p><h4>Procedure timeline</h4>{events.filter((item) => !item.planned).map((item) => <p key={item.id}><time>{item.time}</time><strong>{item.category}</strong><span>{item.content}{item.material ? ` · ${item.material}` : ''}{item.dose ? ` ${item.dose}` : ''}</span></p>)}{!events.some((item) => !item.planned) && <em>확정된 시술기록이 없습니다.</em>}<h4>Memo</h4><p>{memo || '특이사항 없음'}</p></div></section>
          )}

          <section className="feature-card procedure-template-card"><header><div><h2>자주 사용하는 시술 템플릿</h2><p>기본 순서만 불러오며 실제 수행시간과 세부 내용은 확정하지 않습니다.</p></div></header><div>{templateDefinitions.map((template) => <button key={template.id} onClick={() => loadTemplate(template.id)} type="button">{template.label}</button>)}</div></section>
          {saveNotice && <div className="procedure-save-notice"><Activity size={14} />{saveNotice}</div>}
        </main>

        <aside className="procedure-side-column">
          <section className="feature-card procedure-info-card"><header><h2>환자 주요 정보</h2>{patient && <button onClick={() => onOpenPatient(patient.id)} type="button">환자 열기</button>}</header>{clinicalInfoError && <p className="api-inline-error">{clinicalInfoError}</p>}<dl><div><dt>등록번호</dt><dd>{patientDetail?.medicalRecordNo || patient?.id || '-'}</dd></div><div><dt>이름</dt><dd>{patient?.name ?? '-'}</dd></div><div><dt>성별/나이</dt><dd>{patient ? `${patient.sex} / ${patient.age}세` : '-'}</dd></div><div><dt>진단명</dt><dd>{diagnosisSummaryText}</dd></div><div><dt>예정 검사</dt><dd>{patient?.exam || '-'}</dd></div><div><dt>기저질환</dt><dd>{medicalHistorySummaryText}</dd></div><div className={`allergy ${activeAllergies.length ? 'recorded' : ''}`}><dt>알레르기</dt><dd><AlertTriangle size={13} /><span>{allergyLoading ? '조회 중…' : allergySummaryText}</span><button onClick={() => { setAllergyDraft(''); setAllergyEditing(true) }} type="button">{activeAllergies.length || noKnownAllergyConfirmed ? '수정' : '직접 입력'}</button></dd></div></dl></section>

          <section className="feature-card procedure-vital-card"><header><div><HeartPulse size={16} /><h2>환자 상태</h2></div><button onClick={() => setVitalAdding((current) => !current)} type="button"><Plus size={14} />추가</button></header><VitalTable compact vitals={vitals.slice(-4)} onDelete={(id) => setVitals((current) => current.filter((item) => item.id !== id))} />{vitalAdding && <form className="vital-inline-form" onSubmit={addVital}><input type="time" value={vitalDraft.time} onChange={(event) => setVitalDraft((current) => ({ ...current, time: event.target.value }))} /><span><input inputMode="numeric" placeholder="SBP" value={vitalDraft.systolic} onChange={(event) => setVitalDraft((current) => ({ ...current, systolic: event.target.value }))} />/<input inputMode="numeric" placeholder="DBP" value={vitalDraft.diastolic} onChange={(event) => setVitalDraft((current) => ({ ...current, diastolic: event.target.value }))} /></span><input inputMode="numeric" placeholder="HR" value={vitalDraft.heartRate} onChange={(event) => setVitalDraft((current) => ({ ...current, heartRate: event.target.value }))} /><input inputMode="numeric" placeholder="SpO₂" value={vitalDraft.spo2} onChange={(event) => setVitalDraft((current) => ({ ...current, spo2: event.target.value }))} /><select value={vitalDraft.rhythm} onChange={(event) => setVitalDraft((current) => ({ ...current, rhythm: event.target.value }))}><option>Sinus</option><option>AF</option><option>VT</option><option>VF</option><option>기타</option></select><span><button className="save" type="submit"><Check size={14} /></button><button onClick={() => setVitalAdding(false)} type="button"><X size={14} /></button></span></form>}</section>

          <section className="feature-card procedure-lab-card"><header><div><FlaskConical size={16} /><h2>최근 검사 결과</h2></div><span>{recentLabs.length}건</span></header><LabTable compact labs={recentLabs} loading={labLoading} error={labError} /></section>

          <section className="feature-card procedure-memo-card"><header><h2>특이사항 / 메모</h2></header><textarea disabled={recordLocked} value={memo} onChange={(event) => { setMemo(event.target.value); setSaveNotice('저장되지 않은 로컬 변경사항이 있습니다.') }} placeholder="특이사항을 입력하세요." /></section>
        </aside>
      </div>
    </section>
  )
}

function ProcedureTimeEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const initial = value || nowTime()
  const [open, setOpen] = useState(false)
  const [hour, setHour] = useState(initial.split(':')[0] ?? '')
  const [minute, setMinute] = useState(initial.split(':')[1] ?? '')

  useEffect(() => {
    const next = value || nowTime()
    const [nextHour, nextMinute] = next.split(':')
    setHour(nextHour ?? '')
    setMinute(nextMinute ?? '')
  }, [value])

  const normalizePart = (part: string, max: number) => {
    const parsed = Number(part)
    return String(Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0).padStart(2, '0')
  }

  const commit = () => {
    const next = `${normalizePart(hour, 23)}:${normalizePart(minute, 59)}`
    setHour(next.slice(0, 2))
    setMinute(next.slice(3, 5))
    onChange(next)
    setOpen(false)
  }

  const openEditor = () => {
    const next = value || nowTime()
    if (!value) onChange(next)
    const [nextHour, nextMinute] = next.split(':')
    setHour(nextHour)
    setMinute(nextMinute)
    setOpen(true)
  }

  const useCurrentTime = () => {
    const next = nowTime()
    const [nextHour, nextMinute] = next.split(':')
    setHour(nextHour)
    setMinute(nextMinute)
    onChange(next)
  }

  const adjust = (target: 'hour' | 'minute', amount: number) => {
    if (target === 'hour') setHour(String((Number(hour || 0) + amount + 24) % 24).padStart(2, '0'))
    else setMinute(String((Number(minute || 0) + amount + 60) % 60).padStart(2, '0'))
  }

  return (
    <span className="procedure-time-editor" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && open) commit() }}>
      <button className="procedure-time-trigger" onClick={openEditor} type="button"><span>{value || nowTime()}</span><Clock3 size={12} /></button>
      {open && (
        <span className="procedure-time-popover">
          <strong>시간 수정</strong>
          <span className="procedure-time-fields">
            <input aria-label="시" inputMode="numeric" maxLength={2} onChange={(event) => setHour(event.target.value.replace(/\D/g, '').slice(0, 2))} onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); adjust('hour', 1) } if (event.key === 'ArrowDown') { event.preventDefault(); adjust('hour', -1) } }} value={hour} />
            <b>:</b>
            <input aria-label="분" inputMode="numeric" maxLength={2} onChange={(event) => setMinute(event.target.value.replace(/\D/g, '').slice(0, 2))} onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); adjust('minute', 1) } if (event.key === 'ArrowDown') { event.preventDefault(); adjust('minute', -1) } }} value={minute} />
          </span>
          <span className="procedure-time-actions"><button onClick={useCurrentTime} type="button">현재 시간</button><button className="confirm" onClick={commit} type="button">확인</button></span>
        </span>
      )}
    </span>
  )
}

function VitalTable({ vitals, compact = false, onDelete }: { vitals: VitalRecord[]; compact?: boolean; onDelete: (id: string) => void }) {
  return <div className={`procedure-vital-table ${compact ? 'compact' : ''}`}><div className="procedure-vital-head"><span>시간</span><span>BP</span><span>HR</span><span>SpO₂</span><span>Rhythm</span><span /></div>{vitals.map((vital) => <div className="procedure-vital-row" key={vital.id}><time>{vital.time}</time><span>{vital.systolic}/{vital.diastolic}</span><span>{vital.heartRate || '-'}</span><span>{vital.spo2 || '-'}</span><span>{vital.rhythm}</span><button onClick={() => onDelete(vital.id)} title="삭제" type="button"><Trash2 size={12} /></button></div>)}{!vitals.length && <div className="procedure-mini-empty">입력된 환자 상태가 없습니다.</div>}</div>
}

function LabTable({ labs, compact = false, loading, error }: { labs: LabObservation[]; compact?: boolean; loading: boolean; error: string }) {
  if (loading) return <div className="procedure-mini-empty">검사 결과를 불러오는 중…</div>
  if (error) return <div className="procedure-mini-empty error">{error}</div>
  return <div className={`procedure-lab-table ${compact ? 'compact' : ''}`}><div className="procedure-lab-head"><span>항목</span><span>결과</span><span>단위</span><span>검사일</span></div>{labs.map((lab) => <div className="procedure-lab-row" key={lab.id}><strong>{lab.name}</strong><b className={labReferenceStatusClass(labReferenceStatus(lab))}>{(lab.value ?? lab.textValue) || '-'}<small>{flagLabel(lab)}</small></b><span>{lab.unit || '-'}</span><time>{formatLabDate(lab.measuredAt)}</time></div>)}{!labs.length && <div className="procedure-mini-empty">등록된 혈액검사 결과가 없습니다.</div>}</div>
}
