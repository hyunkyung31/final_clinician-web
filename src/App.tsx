import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { LoginView } from "./components/LoginView";
import { ChatDock } from "./components/ChatDock";
import { NotificationCenter } from "./components/NotificationCenter";
import { TodoCenter } from "./components/TodoCenter";
import { SessionLockOverlay } from "./components/SessionLockOverlay";
import { HomeDashboard } from "./components/HomeDashboard";
import { ConsultationWorkspace } from "./components/ConsultationWorkspace";
import { ScheduleWorkspace } from "./components/ScheduleWorkspace";
import { ProcedureRecordWorkspace } from "./components/ProcedureRecordWorkspace";
import { ClinicalAIAnalysisPanel } from "./components/ClinicalAIAnalysisPanel";
import {
  ModuleWorkspace,
  type ModuleSection,
} from "./components/ModuleWorkspace";

import {
  ApiError,
  createPatientMemo,
  getDashboardAIStatus,
  getDashboardRecentPatients,
  getDashboardSummary,
  getImagingStudies,
  getConsultations,
  getPatientDetail,
  getPatientMemos,
  getPatients,
  getPatientsPage,
  getPatientTimeline,
  getStaffDoctors,
  getStaffIdentity,
  hasSession,
  loginStaff,
  logoutStaff,
  reauthenticateStaff,
  updatePatientMemo,
} from "./api/client";

import {
  Activity,
  BrainCircuit,
  CalendarDays,
  FileText,
  House,
  Images,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Moon,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  ClipboardPenLine,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import type {
  DashboardAIStatus,
  DashboardSummary,
  ImagingStudySummary,
  PatientDetail,
  PatientMemo,
  PatientSummary,
  RiskLevel,
  StaffDoctor,
  StaffIdentity,
  StaffNotification,
  TimelineItem,
  WorkStatus,
} from "./types";

import { OrderWorkspace } from "./components/OrderWorkspace";

type WorkspaceTab = "영상" | "AI 분석" | "정량 지표" | "이전 검사 비교";

type ReportTab = "판독·보고" | "환자 메모" | "오더" | "기록";
type ThemeMode = "light" | "dark";
type FontSizeMode = "small" | "normal" | "large" | "xlarge";
type PatientScope = "mine" | "consultation" | "recent" | "all";
const scopeApi = { mine: "ASSIGNED_TO_ME", consultation: "CONSULTATION", recent: "RECENT", all: "ALL_ACCESSIBLE" } as const;

const THEME_STORAGE_KEY = "angiocad.theme";
const FONT_SIZE_STORAGE_KEY = "angiocad.font-size";
const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function initialTheme(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function initialFontSize(): FontSizeMode {
  const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  return stored === "small" || stored === "large" || stored === "xlarge"
    ? stored
    : "normal";
}

type GlobalSection =
  | "홈"
  | "워크스테이션"
  | "일정"
  | "환자 관리"
  | "검사·영상"
  | "AI 분석"
  | "시술기록"
  | "협진"
  | "채팅"
  | "결과보고서"
  | "설정";

interface NavItem {
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { icon: House, label: "홈" },
  { icon: LayoutDashboard, label: "워크스테이션" },
  { icon: CalendarDays, label: "일정" },
  { icon: Users, label: "환자 관리" },
  { icon: MonitorPlay, label: "검사·영상" },
  { icon: BrainCircuit, label: "AI 분석" },
  { icon: ClipboardPenLine, label: "시술기록" },
  { icon: Stethoscope, label: "협진" },
  { icon: FileText, label: "결과보고서" },
  { icon: Settings, label: "설정" },
];

const connectedSections = new Set<GlobalSection>([
  "홈",
  "워크스테이션",
  "일정",
  "환자 관리",
  "검사·영상",
  "AI 분석",
  "시술기록",
  "협진",
  "채팅",
  "결과보고서",
  "설정",
]);

const nurseSections = new Set<GlobalSection>([
  "홈",
  "워크스테이션",
  "일정",
  "환자 관리",
  "검사·영상",
  "시술기록",
  "채팅",
  "설정",
]);

function getRoleSections(roles: string[]): Set<GlobalSection> {
  const normalizedRoles = roles.map((role) => role.trim().toUpperCase());

  if (
    normalizedRoles.includes("ADMIN") ||
    normalizedRoles.includes("SYSTEM_ADMIN") ||
    normalizedRoles.includes("DOCTOR")
  ) {
    return connectedSections;
  }

  if (normalizedRoles.includes("NURSE")) return nurseSections;

  return new Set<GlobalSection>(["홈", "워크스테이션", "설정"]);
}

const workspaceTabs: WorkspaceTab[] = [
  "영상",
  "AI 분석",
  "정량 지표",
  "이전 검사 비교",
];

const reportTabs: ReportTab[] = ["판독·보고", "환자 메모", "오더", "기록"];

const riskLabel: Record<RiskLevel, string> = {
  high: "고위험",
  medium: "중위험",
  normal: "정상",
};

const statusLabel: Record<WorkStatus, string> = {
  waiting: "대기",
  running: "진행중",
  complete: "완료",
  urgent: "긴급",
};

const workspaceEmptyDescription: Record<WorkspaceTab, string> = {
  영상: "환자의 영상검사를 선택하면 DICOM 영상이 표시됩니다.",
  "AI 분석": "완료된 AI 분석을 선택하거나 새 분석을 요청해주세요.",
  "정량 지표": "AI 분석이 완료되면 정량 분석 결과가 표시됩니다.",
  "이전 검사 비교": "비교할 수 있는 이전 검사가 없습니다.",
};

const reportEmptyDescription: Record<ReportTab, string> = {
  "판독·보고": "검사 및 AI 분석 결과를 선택하면 보고서를 작성할 수 있습니다.",
  "환자 메모": "이 환자에게 등록된 의료진 메모가 없습니다.",
  오더: "이 환자에게 등록된 검사 오더가 없습니다.",
  기록: "표시할 의료진 업무 기록이 없습니다.",
};

function PatientRow({
  patient,
  selected,
  onSelect,
}: {
  patient: PatientSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`patient-row ${selected ? "active" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`risk-dot ${patient.risk}`} />

      <span className="patient-row-main">
        <span className="patient-row-top">
          <strong>{patient.name}</strong>

          {patient.score !== undefined && (
            <b className={`risk-text risk-${patient.risk}`}>
              {riskLabel[patient.risk]} {patient.score}
            </b>
          )}
        </span>

        <span className="patient-row-meta">
          {patient.id} · {patient.sex}/{patient.age} · {patient.exam}
        </span>
      </span>

      <span className={`status-pill status-${patient.status}`}>
        {statusLabel[patient.status]}
      </span>
    </button>
  );
}

function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "is-compact" : ""}`}>
      <div className="empty-state-icon" aria-hidden="true">
        <Plus size={18} strokeWidth={1.8} />
      </div>

      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function formatMemoDate(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [fontSize, setFontSize] = useState<FontSizeMode>(initialFontSize);
  const [mode, setMode] = useState<"auth" | "api">(
    hasSession() ? "api" : "auth",
  );

  const [activeSection, setActiveSection] =
    useState<GlobalSection>("홈");

  const [chatDockOpen, setChatDockOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [staffIdentity, setStaffIdentity] = useState<StaffIdentity | null>(null);
  const [staffDoctor, setStaffDoctor] = useState<StaffDoctor | null>(null);
  const [worklistCollapsed, setWorklistCollapsed] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [sessionUnlocking, setSessionUnlocking] = useState(false);
  const [sessionLockError, setSessionLockError] = useState("");
  const [privacyShieldVisible, setPrivacyShieldVisible] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (activeSection === "채팅") {
      setActiveSection("워크스테이션");
      setChatDockOpen(true);
    }
  }, [activeSection]);

  useEffect(() => {
    if (mode !== "api") return;

    let idleTimer = window.setTimeout(
      () => setSessionLocked(true),
      SESSION_IDLE_TIMEOUT_MS,
    );

    const resetIdleTimer = () => {
      if (sessionLocked) return;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(
        () => setSessionLocked(true),
        SESSION_IDLE_TIMEOUT_MS,
      );
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
    ];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, resetIdleTimer, { passive: true }),
    );

    return () => {
      window.clearTimeout(idleTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, resetIdleTimer),
      );
    };
  }, [mode, sessionLocked]);

  useEffect(() => {
    if (mode !== "api") {
      setPrivacyShieldVisible(false);
      return;
    }

    const protect = () => setPrivacyShieldVisible(true);
    const reveal = () => setPrivacyShieldVisible(false);
    const handleVisibilityChange = () => {
      setPrivacyShieldVisible(document.visibilityState !== "visible");
    };

    window.addEventListener("blur", protect);
    window.addEventListener("focus", reveal);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", protect);
      window.removeEventListener("focus", reveal);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode]);

  const [patientList, setPatientList] = useState<PatientSummary[]>([]);
  const [myPatientList, setMyPatientList] = useState<PatientSummary[]>([]);
  const [consultationPatientList, setConsultationPatientList] = useState<PatientSummary[]>([]);
  const [recentPatientList, setRecentPatientList] = useState<PatientSummary[]>([]);
  const [patientPage, setPatientPage] = useState(1);
  const [patientCount, setPatientCount] = useState(0);
  const [patientsHasNext, setPatientsHasNext] = useState(false);
  const [recentRevision, setRecentRevision] = useState(0);
  const [patientListError, setPatientListError] = useState("");
  const [patientScope, setPatientScope] = useState<PatientScope>("mine");
  const [patientSearchResults, setPatientSearchResults] = useState<PatientSummary[] | null>(null);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [examDateFrom, setExamDateFrom] = useState("");
  const [examDateTo, setExamDateTo] = useState("");
  const [examinationStatusFilter, setExaminationStatusFilter] = useState("");
  const [aiStatusFilter, setAiStatusFilter] = useState("");

  const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(
    null,
  );

  const [patientDetailLoading, setPatientDetailLoading] = useState(false);

  const [patientDetailError, setPatientDetailError] = useState("");

  const [selectedId, setSelectedId] = useState("");

  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);

  const [imagingStudies, setImagingStudies] = useState<ImagingStudySummary[]>(
    [],
  );

  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null);

  const [studiesLoading, setStudiesLoading] = useState(false);
  const [studiesError, setStudiesError] = useState("");

  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummary | null>(null);

  const [aiStatus, setAIStatus] = useState<DashboardAIStatus | null>(null);

  const [apiLoading, setApiLoading] = useState(false);

  const [timelineLoading, setTimelineLoading] = useState(false);

  const [apiError, setApiError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [loginError, setLoginError] = useState("");
  const [search, setSearch] = useState("");

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("영상");

  const [activeReportTab, setActiveReportTab] =
    useState<ReportTab>("판독·보고");

  const [patientMemos, setPatientMemos] = useState<PatientMemo[]>([]);

  const [memoDraft, setMemoDraft] = useState("");
  const [memosLoading, setMemosLoading] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoError, setMemoError] = useState("");

  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);

  const [editingMemoContent, setEditingMemoContent] = useState("");

  const clinicianName =
    staffDoctor?.name ||
    staffIdentity?.name ||
    staffIdentity?.username ||
    "의료진";

  const clinicianTitle = staffDoctor?.title?.trim() || staffIdentity?.title?.trim() || "";
  const clinicianDepartment = staffDoctor?.departmentName?.trim() || staffIdentity?.departmentName?.trim() || "";
  const clinicianDisplayName = [clinicianName, clinicianTitle]
    .filter(Boolean)
    .join(" ");
  const clinicianMeta = clinicianDepartment
    ? `${clinicianDepartment} · CDSS 로그인`
    : "CDSS 로그인";
  const clinicianInitial = clinicianName.trim().slice(0, 1) || "의";

  const roleSections = useMemo(
    () => staffIdentity ? getRoleSections(staffIdentity.roles) : connectedSections,
    [staffIdentity],
  );

  const selectedPatient =
    patientList.find((patient) => patient.id === selectedId) ??
    myPatientList.find((patient) => patient.id === selectedId) ??
    consultationPatientList.find((patient) => patient.id === selectedId) ??
    recentPatientList.find((patient) => patient.id === selectedId) ??
    patientSearchResults?.find((patient) => patient.id === selectedId) ??
    patientList[0] ??
    null;

  const currentPatientDetail =
    patientDetail?.backendId === selectedPatient?.backendId
      ? patientDetail
      : null;

  const selectedStudy =
    imagingStudies.find(
      (study) => study.id === selectedStudyId,
    ) ??
    imagingStudies[0] ??
    null

  const selectedExaminationId =
    selectedStudy?.examinationId ??
    timelineItems.find(
      (item) => item.eventType === "EXAMINATION" && item.referenceId,
    )?.referenceId;

  
  const currentEncounterId =
    timelineItems.find(
      (item) =>
        item.eventType === 'ENCOUNTER' &&
        item.referenceId !== undefined,
    )?.referenceId ?? null

  const scopedPatients = useMemo(() => {
    if (patientScope === "mine") return myPatientList;
    if (patientScope === "consultation") return consultationPatientList;
    if (patientScope === "recent") return recentPatientList;
    return patientList;
  }, [consultationPatientList, myPatientList, patientList, patientScope, recentPatientList]);

  const filteredPatients = useMemo(() => {
    return patientSearchResults ?? scopedPatients;
  }, [patientSearchResults, scopedPatients]);

  const priorityPatients = useMemo(
    () =>
      filteredPatients.filter(
        (patient) => patient.risk === "high" || patient.status === "urgent",
      ),
    [filteredPatients],
  );

  const regularPatients = useMemo(
    () =>
      filteredPatients.filter(
        (patient) =>
          !priorityPatients.some(
            (priorityPatient) => priorityPatient.id === patient.id,
          ),
      ),
    [filteredPatients, priorityPatients],
  );

  const resetPatientData = () => {
    setPatientDetail(null);
    setPatientDetailError("");
    setPatientDetailLoading(false);
    setTimelineItems([]);
    setTimelineLoading(false);
    setImagingStudies([]);
    setSelectedStudyId(null);
    setStudiesLoading(false);
    setStudiesError("");
  };

  const loadApiWorkspace = async () => {
    setApiLoading(true);
    setApiError("");

    try {
      const [patientsResult, myPatientsResult, summaryResult, aiStatusResult, consultationsResult, recentPatientsResult] =
        await Promise.allSettled([
        getPatients(),
        getPatients('', true),
        getDashboardSummary(),
        getDashboardAIStatus(),
        getConsultations(),
        getDashboardRecentPatients(),
      ]);

      if (patientsResult.status === "rejected") {
        throw patientsResult.reason;
      }

      const basePatients = patientsResult.value;
      const nextMyPatients = myPatientsResult.status === "fulfilled" ? myPatientsResult.value : [];
      const consultations = consultationsResult.status === "fulfilled" ? consultationsResult.value : [];
      const recentPatients = recentPatientsResult.status === "fulfilled" ? recentPatientsResult.value : [];
      const knownPatients = Array.from(
        new Map([...basePatients, ...nextMyPatients].map((patient) => [patient.backendId, patient])).values(),
      );
      const [consultationPage, recentPage] = await Promise.allSettled([
        getPatientsPage('', false, { patientScope: 'CONSULTATION' }),
        getPatientsPage('', false, { patientScope: 'RECENT' }),
      ]);
      const nextConsultationPatients = consultationPage.status === 'fulfilled' ? consultationPage.value.results : [];
      const nextRecentPatients = recentPage.status === 'fulfilled' ? recentPage.value.results : [];
      const nextPatients = Array.from(new Map([...knownPatients, ...nextConsultationPatients, ...nextRecentPatients].map((patient) => [patient.backendId, patient])).values());
      const nextSummary =
        summaryResult.status === "fulfilled" ? summaryResult.value : null;
      const nextAIStatus =
        aiStatusResult.status === "fulfilled" ? aiStatusResult.value : null;

      setPatientList(nextPatients);
      setMyPatientList(nextMyPatients);
      setConsultationPatientList(nextConsultationPatients);
      setRecentPatientList(nextRecentPatients);
      setDashboardSummary(nextSummary);
      setAIStatus(nextAIStatus);

      setSelectedId((current) => {
        const currentPatientExists = nextPatients.some(
          (patient) => patient.id === current,
        );

        if (currentPatientExists) {
          return current;
        }

        return nextMyPatients[0]?.id ?? nextPatients[0]?.id ?? "";
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setMode("auth");
        setPatientList([]);
        setMyPatientList([]);
        setConsultationPatientList([]);
        setRecentPatientList([]);
        setSelectedId("");
        setDashboardSummary(null);
        setAIStatus(null);
        resetPatientData();

        setLoginError("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
      } else {
        setApiError(
          error instanceof Error
            ? error.message
            : "API 데이터를 불러오지 못했습니다.",
        );
      }
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "api") {
      void loadApiWorkspace();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'api') return;
    let active = true;
    setPatientSearchLoading(true);
    setPatientSearchResults([]);
    setPatientListError('');
    const timer = window.setTimeout(() => {
      void getPatientsPage(search.trim(), false, {
        patientScope: scopeApi[patientScope], page: patientPage,
        examDateFrom, examDateTo, examinationStatus: examinationStatusFilter, aiStatus: aiStatusFilter,
      }).then((data) => {
        if (!active) return;
        setPatientSearchResults(data.results);
        setPatientCount(data.count);
        setPatientsHasNext(data.hasNext);
        setPatientList((items) => Array.from(new Map([...items, ...data.results].map((patient) => [patient.id, patient])).values()));
      }).catch((error) => { if (active) { setPatientSearchResults([]); setPatientCount(0); setPatientsHasNext(false); setPatientListError(error instanceof Error ? error.message : '환자 목록 조회 실패'); } })
        .finally(() => { if (active) setPatientSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mode, patientScope, patientPage, search, examDateFrom, examDateTo, examinationStatusFilter, aiStatusFilter, recentRevision]);

  useEffect(() => { setPatientPage(1); }, [patientScope, search, examDateFrom, examDateTo, examinationStatusFilter, aiStatusFilter]);

  useEffect(() => {
    if (mode !== "api") {
      setStaffIdentity(null);
      setStaffDoctor(null);
      return;
    }

    let active = true;

    const loadCurrentStaff = async () => {
      try {
        const identity = await getStaffIdentity();

        if (!active) return;
        setStaffIdentity(identity);

        try {
          const doctors = await getStaffDoctors();

          if (active) {
            setStaffDoctor(
              doctors.find((doctor) => doctor.userId === identity.id) ?? null,
            );
          }
        } catch {
          if (active) setStaffDoctor(null);
        }
      } catch (error) {
        if (!active) return;

        setStaffIdentity(null);
        setStaffDoctor(null);

        if (error instanceof ApiError && error.status === 401) {
          setMode("auth");
          setLoginError("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        }
      }
    };

    void loadCurrentStaff();

    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (staffIdentity && !roleSections.has(activeSection)) {
      setActiveSection("워크스테이션");
    }
  }, [activeSection, roleSections, staffIdentity]);

  useEffect(() => {
    if (mode !== "api" || !selectedPatient?.backendId) {
      setTimelineItems([]);
      setTimelineLoading(false);
      return;
    }

    let active = true;

    setTimelineLoading(true);
    setTimelineItems([]);

    getPatientTimeline(selectedPatient.backendId)
      .then((items) => {
        if (active) {
          setTimelineItems(items);
        }
      })
      .catch((error) => {
        if (active) {
          setTimelineItems([]);

          setApiError(
            error instanceof Error
              ? error.message
              : "환자 타임라인을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setTimelineLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedPatient?.backendId]);

  useEffect(() => {
    if (mode !== "api" || !selectedPatient?.backendId) {
      setImagingStudies([]);
      setSelectedStudyId(null);
      setStudiesLoading(false);
      setStudiesError("");
      return;
    }

    let active = true;

    setImagingStudies([]);
    setSelectedStudyId(null);
    setStudiesLoading(true);
    setStudiesError("");

    getImagingStudies(selectedPatient.backendId)
      .then((studies) => {
        if (!active) return;

        setImagingStudies(studies);
        setSelectedStudyId(studies[0]?.id ?? null);
      })
      .catch((error) => {
        if (!active) return;

        setImagingStudies([]);
        setSelectedStudyId(null);
        setStudiesError(
          error instanceof Error
            ? error.message
            : "영상검사 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (active) setStudiesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [mode, selectedPatient?.backendId]);

  useEffect(() => {
    if (mode !== "api" || !selectedPatient?.backendId) {
      setPatientDetail(null);
      setPatientDetailError("");
      setPatientDetailLoading(false);
      return;
    }

    let active = true;

    setPatientDetail(null);
    setPatientDetailError("");
    setPatientDetailLoading(true);

    getPatientDetail(selectedPatient.backendId)
      .then((detail) => {
        if (active) {
          setPatientDetail(detail);
          setRecentRevision((value) => value + 1);
          setRecentPatientList((items) => [selectedPatient, ...items.filter((item) => item.backendId !== selectedPatient.backendId)]);
        }
      })
      .catch((error) => {
        if (active) {
          setPatientDetail(null);

          setPatientDetailError(
            error instanceof Error
              ? error.message
              : "환자 상세정보를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setPatientDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedPatient?.backendId]);

  useEffect(() => {
    if (mode !== "api" || !selectedPatient?.backendId) {
      setPatientMemos([]);
      setMemoDraft("");
      setMemoError("");
      setEditingMemoId(null);
      setEditingMemoContent("");
      setMemosLoading(false);
      return;
    }

    let active = true;

    setPatientMemos([]);
    setMemoError("");
    setEditingMemoId(null);
    setEditingMemoContent("");
    setMemosLoading(true);

    getPatientMemos(selectedPatient.backendId)
      .then((memos) => {
        if (active) {
          setPatientMemos(memos);
        }
      })
      .catch((error) => {
        if (active) {
          setPatientMemos([]);
          setMemoError(
            error instanceof Error
              ? error.message
              : "환자 메모를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setMemosLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedPatient?.backendId]);

  const handleLogin = async (username: string, password: string) => {
    setLoginLoading(true);
    setLoginError("");

    try {
      await loginStaff(username, password);
      setMode("api");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "로그인에 실패했습니다.",
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const reloadPatientMemos = async (patientId: number) => {
    const memos = await getPatientMemos(patientId);
    setPatientMemos(memos);
  };

  const handleCreateMemo = async () => {
    const patientId = selectedPatient?.backendId;
    const content = memoDraft.trim();

    if (!patientId || !content || memoSaving) {
      return;
    }

    setMemoSaving(true);
    setMemoError("");

    try {
      await createPatientMemo(patientId, content);
      await reloadPatientMemos(patientId);
      setMemoDraft("");
    } catch (error) {
      setMemoError(
        error instanceof Error ? error.message : "메모를 저장하지 못했습니다.",
      );
    } finally {
      setMemoSaving(false);
    }
  };

  const handleStartMemoEdit = (memo: PatientMemo) => {
    setEditingMemoId(memo.id);
    setEditingMemoContent(memo.content);
    setMemoError("");
  };

  const handleCancelMemoEdit = () => {
    setEditingMemoId(null);
    setEditingMemoContent("");
  };

  const handleUpdateMemo = async () => {
    const patientId = selectedPatient?.backendId;
    const content = editingMemoContent.trim();

    if (!patientId || editingMemoId === null || !content || memoSaving) {
      return;
    }

    setMemoSaving(true);
    setMemoError("");

    try {
      await updatePatientMemo(editingMemoId, content);

      await reloadPatientMemos(patientId);

      setEditingMemoId(null);
      setEditingMemoContent("");
    } catch (error) {
      setMemoError(
        error instanceof Error ? error.message : "메모를 수정하지 못했습니다.",
      );
    } finally {
      setMemoSaving(false);
    }
  };

  const handleLogout = async () => {
    await logoutStaff().catch(() => undefined);

    setMode("auth");
    setPatientList([]);
    setSelectedId("");
    setDashboardSummary(null);
    setAIStatus(null);
    setSearch("");
    setApiError("");
    setLoginError("");
    setActiveSection("홈");
    setChatDockOpen(false);
    setChatUnreadCount(0);
    setStaffIdentity(null);
    setStaffDoctor(null);
    setSessionLocked(false);
    setSessionUnlocking(false);
    setSessionLockError("");
    setPrivacyShieldVisible(false);
    resetPatientData();
  };

  const handleSessionUnlock = async (password: string) => {
    setSessionUnlocking(true);
    setSessionLockError("");

    try {
      await reauthenticateStaff(password);
      setSessionLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && !hasSession()) {
        setMode("auth");
        setLoginError("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
        setSessionLocked(false);
        return;
      }

      setSessionLockError(
        error instanceof Error ? error.message : "재인증에 실패했습니다.",
      );
    } finally {
      setSessionUnlocking(false);
    }
  };

  const handleOpenNotification = (notification: StaffNotification) => {
    const key = `${notification.type} ${notification.referenceType}`.toUpperCase();

    if (key.includes("CHAT") || key.includes("MESSAGE")) {
      setChatDockOpen(true);
      return;
    }
    if (key.includes("CONSULT") || key.includes("COLLAB")) {
      setActiveSection("협진");
      return;
    }
    if (key.includes("SCHEDULE") || key.includes("APPOINT")) {
      setActiveSection("일정");
      return;
    }
    if (key.includes("AI") || key.includes("ANALYSIS")) {
      setActiveSection("AI 분석");
      return;
    }
    if (key.includes("REPORT")) {
      setActiveSection("결과보고서");
      return;
    }
    if (key.includes("ORDER") || key.includes("EXAM") || key.includes("IMAGING")) {
      setActiveSection("검사·영상");
      return;
    }
    setActiveSection("워크스테이션");
  };

  if (mode === "auth") {
    return (
      <LoginView
        loading={loginLoading}
        error={loginError}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <main
      data-theme={theme}
      className={`app-shell chat-dock-present ${
        chatDockOpen ? "chat-dock-open" : ""
      } ${worklistCollapsed ? "worklist-collapsed" : ""}`}
    >
      <aside className="global-nav" aria-label="전역 메뉴">
        <div className="brand-mark" aria-label="AngioCAD">
          <Activity size={21} strokeWidth={1.8} />
        </div>

        <nav className="nav-items">
          {navItems.map((item) => {
            const Icon = item.icon;
            const connected = connectedSections.has(item.label as GlobalSection);
            const roleAllowed = roleSections.has(item.label as GlobalSection);

            if (!roleAllowed) return null;

            return (
              <button
                key={item.label}
                className={`nav-icon ${
                  activeSection === item.label ||
                  (item.label === "채팅" && chatDockOpen)
                    ? "active"
                    : ""
                }`}
                title={connected ? item.label : `${item.label} · 기능 연결 예정`}
                aria-label={item.label}
                onClick={() => {
                  if (item.label === "채팅") {
                    setChatDockOpen((current) => !current);
                    return;
                  }
                  if (connected) setActiveSection(item.label as GlobalSection);
                }}
                disabled={!connected}
                type="button"
              >
                <Icon
                  className="nav-icon-svg"
                  size={19}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {item.label === "채팅" && chatUnreadCount > 0 && (
                  <b className="nav-chat-badge">
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </b>
                )}
                <small>{item.label}</small>
              </button>
            );
          })}
        </nav>

        <div className="nav-footer">
          <button
            className="nav-icon nav-theme-toggle"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            type="button"
            title={theme === "light" ? "다크 테마로 변경" : "라이트 테마로 변경"}
            aria-label={theme === "light" ? "다크 테마로 변경" : "라이트 테마로 변경"}
          >
            {theme === "light" ? <Moon size={18} strokeWidth={1.8} /> : <Sun size={18} strokeWidth={1.8} />}
          </button>

          <span
            className="nav-user"
            title={`${clinicianDisplayName} · ${clinicianMeta}`}
            aria-label={`로그인 사용자 ${clinicianDisplayName}`}
          >
            {clinicianInitial}
          </span>

          <button
            className="nav-icon nav-logout"
            onClick={() => void handleLogout()}
            type="button"
            title="로그아웃"
            aria-label="로그아웃"
          >
            <LogOut
              className="nav-icon-svg"
              size={19}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        </div>
      </aside>

      <NotificationCenter onOpenNotification={handleOpenNotification} />
      <TodoCenter />

      {activeSection === "홈" && (
        <HomeDashboard
          summary={dashboardSummary}
          aiStatus={aiStatus}
          patients={patientList}
          doctorId={staffDoctor?.id}
          roles={staffIdentity?.roles ?? []}
          clinicianName={clinicianDisplayName}
          onNavigate={(destination) => {
            if (destination === "채팅") {
              setChatDockOpen(true);
              return;
            }
            setActiveSection(destination);
          }}
          onOpenPatient={(patientId) => {
            const patient = patientList.find(
              (item) => item.backendId === patientId,
            );
            if (patient) setSelectedId(patient.id);
            setActiveSection("워크스테이션");
          }}
        />
      )}

      {activeSection === "일정" && <ScheduleWorkspace />}

      {activeSection === "시술기록" && (
        <ProcedureRecordWorkspace
          patient={selectedPatient}
          patientDetail={currentPatientDetail}
          clinicianName={clinicianDisplayName}
          encounterId={currentEncounterId}
          examinationId={selectedExaminationId}
          onOpenPatient={(patientId) => {
            setSelectedId(patientId);
            setActiveSection("워크스테이션");
          }}
        />
      )}

      {activeSection === "협진" && (
        <ConsultationWorkspace
          patients={patientList}
          initialPatientId={selectedPatient?.backendId}
          currentUserId={staffIdentity?.id}
          currentDoctorId={staffDoctor?.id}
          onOpenPatient={(patientId, section) => {
            const patient = patientList.find((item) => item.backendId === patientId);
            if (!patient) return;
            setSelectedId(patient.id);
            setActiveSection(section);
          }}
        />
      )}

      {(
        activeSection === "환자 관리" ||
        activeSection === "검사·영상" ||
        activeSection === "AI 분석" ||
        activeSection === "결과보고서" ||
        activeSection === "설정"
      ) && (
        <ModuleWorkspace
          section={activeSection as ModuleSection}
          patients={patientList}
          assignedPatients={myPatientList}
          consultationPatients={consultationPatientList}
          recentPatients={recentPatientList}
          selectedPatient={selectedPatient}
          imagingStudies={imagingStudies}
          dashboardSummary={dashboardSummary}
          aiStatus={aiStatus}
          staffRoles={staffIdentity?.roles ?? []}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onSelectPatient={(patient) => {
            setPatientList((current) => [patient, ...current.filter((item) => item.id !== patient.id)]);
            setSelectedId(patient.id);
          }}
          onOpenPatient={(patientId) => {
            setSelectedId(patientId);
            setActiveSection("워크스테이션");
          }}
        />
      )}

      <aside
        className={`worklist ${worklistCollapsed ? "collapsed" : ""} ${
          activeSection !== "워크스테이션" ? "section-hidden" : ""
        }`}
      >
        <header className="worklist-header">
          <div className="section-title-row">
            {!worklistCollapsed && <h2>환자 리스트</h2>}

            <div className="worklist-header-actions">
              <button
                className="icon-button worklist-collapse-button"
                type="button"
                onClick={() => setWorklistCollapsed((collapsed) => !collapsed)}
                title={worklistCollapsed ? "환자 목록 펼치기" : "환자 목록 접기"}
                aria-label={worklistCollapsed ? "환자 목록 펼치기" : "환자 목록 접기"}
              >
                {worklistCollapsed ? (
                  <PanelLeftOpen size={17} strokeWidth={1.8} />
                ) : (
                  <PanelLeftClose size={17} strokeWidth={1.8} />
                )}
              </button>

              {!worklistCollapsed && (
                <button
                  className="icon-button"
                  type="button"
                  disabled
                  title="환자 등록 기능 연결 예정"
                >
                  <Plus size={16} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </div>

          <label className="search-box">
            <Search size={14} strokeWidth={1.8} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명 · 환자번호 검색"
            />
          </label>

          <details className="patient-detail-filters">
            <summary>상세 필터</summary>
            <div>
              <label>검사 시작일<input type="date" value={examDateFrom} onChange={(event) => setExamDateFrom(event.target.value)} /></label>
              <label>검사 종료일<input type="date" value={examDateTo} onChange={(event) => setExamDateTo(event.target.value)} /></label>
              <label>검사 상태<select value={examinationStatusFilter} onChange={(event) => setExaminationStatusFilter(event.target.value)}><option value="">전체</option><option value="ORDERED">접수</option><option value="SCHEDULED">예약</option><option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option><option value="CANCELED">취소</option></select></label>
              <label>AI 상태<select value={aiStatusFilter} onChange={(event) => setAiStatusFilter(event.target.value)}><option value="">전체</option><option value="QUEUED">대기</option><option value="RUNNING">진행중</option><option value="SUCCEEDED">완료</option><option value="FAILED">실패</option></select></label>
              <button onClick={() => { setExamDateFrom(""); setExamDateTo(""); setExaminationStatusFilter(""); setAiStatusFilter(""); }} type="button">초기화</button>
            </div>
          </details>

          <div className="patient-scope-tabs" role="tablist" aria-label="환자 목록 범위">
            <button aria-selected={patientScope === "mine"} className={patientScope === "mine" ? "active" : ""} onClick={() => setPatientScope("mine")} role="tab" type="button"><span>내 담당</span><b>{myPatientList.length}</b></button>
            <button aria-selected={patientScope === "consultation"} className={patientScope === "consultation" ? "active" : ""} onClick={() => setPatientScope("consultation")} role="tab" type="button"><span>협진</span><b>{consultationPatientList.length}</b></button>
            <button aria-selected={patientScope === "recent"} className={patientScope === "recent" ? "active" : ""} onClick={() => setPatientScope("recent")} role="tab" type="button"><span>최근 조회</span><b>{recentPatientList.length}</b></button>
            <button aria-selected={patientScope === "all"} className={patientScope === "all" ? "active" : ""} onClick={() => setPatientScope("all")} role="tab" type="button"><span>전체</span><b>{patientList.length}</b></button>
          </div>
        </header>

        {priorityPatients.length > 0 && (
          <section className="worklist-section priority-list">
            <div className="section-kicker">
              <strong>검토 우선순위</strong>
              <span>{priorityPatients.length}명</span>
            </div>

            {priorityPatients.map((patient) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                selected={patient.id === selectedPatient?.id}
                onSelect={() => setSelectedId(patient.id)}
              />
            ))}
          </section>
        )}

        <section className="worklist-section patient-list-section">
          <div className="section-kicker">
            <strong>{patientScope === "mine" ? "내 담당 환자" : patientScope === "consultation" ? "협진 환자" : patientScope === "recent" ? "최근 조회 환자" : "전체 환자"}</strong>
            <span>총 {mode === "api" ? patientCount : filteredPatients.length}명 · {patientPage}페이지</span>
          </div>

          {patientListError && <p className="api-inline-error">{patientListError}</p>}
          {patientSearchLoading && <div className="patient-search-loading"><LoaderCircle size={14} className="spin" />환자 검색 중…</div>}

          {regularPatients.map((patient) => (
            <PatientRow
              key={patient.id}
              patient={patient}
              selected={patient.id === selectedPatient?.id}
              onSelect={() => setSelectedId(patient.id)}
            />
          ))}

          {!apiLoading && !patientSearchLoading && filteredPatients.length === 0 && (
            <EmptyState
              compact
              title={
                search ? "검색 결과가 없습니다" : "조회 가능한 환자가 없습니다"
              }
              description={
                search
                  ? "환자명 또는 환자번호를 다시 확인해주세요."
                  : patientScope === "mine"
                    ? "현재 의료진에게 배정된 담당 환자가 없습니다."
                    : patientScope === "consultation"
                      ? "현재 참여 중인 협진 환자가 없습니다."
                      : patientScope === "recent"
                        ? "최근 열람한 환자가 없습니다."
                        : "접근 가능한 환자가 없습니다."
              }
            />
          )}
          <div className="api-pagination"><button type="button" disabled={patientPage === 1 || patientSearchLoading} onClick={() => setPatientPage((page) => page - 1)}>이전</button><span>{patientPage}페이지</span><button type="button" disabled={!patientsHasNext || patientSearchLoading} onClick={() => setPatientPage((page) => page + 1)}>다음</button></div>
        </section>

        <footer
          className="clinician-card"
          title={`${clinicianDisplayName} · ${clinicianMeta}`}
        >
          <span className="clinician-avatar">{clinicianInitial}</span>

          <span>
            <strong>{clinicianDisplayName}</strong>
            <small>{clinicianMeta}</small>
          </span>
        </footer>
      </aside>

      <section className={`workspace ${activeSection !== "워크스테이션" ? "section-hidden" : ""}`}>
        {apiLoading && (
          <div className="api-banner api-loading" aria-live="polite">
            환자와 대시보드 정보를 불러오는 중입니다.
          </div>
        )}

        {apiError && (
          <div className="api-banner api-error">
            <span>{apiError}</span>

            <button onClick={() => void loadApiWorkspace()} type="button">
              다시 시도
            </button>
          </div>
        )}

        {!selectedPatient && !apiLoading && (
          <div className="workspace-empty">
            <EmptyState
              title="선택할 수 있는 환자가 없습니다"
              description="환자 목록을 새로고침하거나 환자 접근 권한을 확인해주세요."
            />

            <button
              className="primary empty-action"
              onClick={() => void loadApiWorkspace()}
              type="button"
            >
              환자 목록 새로고침
            </button>
          </div>
        )}

        {selectedPatient && (
          <>
            <header className="patient-context">
              <div className="patient-name">
                <strong>
                  {currentPatientDetail?.name ?? selectedPatient.name}
                </strong>

                <span>
                  {currentPatientDetail?.sex ?? selectedPatient.sex}
                  {" / "}
                  {currentPatientDetail?.age ?? selectedPatient.age}
                </span>

                <b className={`risk-chip risk-${selectedPatient.risk}`}>
                  {riskLabel[selectedPatient.risk]}
                </b>

                <small>
                  {patientDetailLoading
                    ? "환자 상세정보를 불러오는 중…"
                    : patientDetailError
                      ? "상세정보 조회 실패"
                      : `${
                          currentPatientDetail?.medicalRecordNo ??
                          selectedPatient.id
                        } · 생년월일 ${currentPatientDetail?.birthDate ?? "-"}`}
                </small>
              </div>

              <div className="header-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled
                  title={
                    selectedStudy
                      ? "Viewer token 연결 예정"
                      : "선택된 영상검사가 없습니다"
                  }
                >
                  원본 영상
                </button>

                <button
                  className="primary"
                  type="button"
                  disabled
                  title="보고서 API 연결 예정"
                >
                  리포트 생성
                </button>
              </div>
            </header>

            <div className="clinical-strip">
              <span className="source-badge source-api">LIVE API</span>

              <span>
                환자번호{" "}
                <strong>
                  {currentPatientDetail?.medicalRecordNo ?? selectedPatient.id}
                </strong>
              </span>

              <span>
                연락처 <strong>{currentPatientDetail?.contact || "-"}</strong>
              </span>

              <span>
                영상검사 <strong>{imagingStudies.length}건</strong>
              </span>

              <span>
                AI 대기 <strong>{aiStatus?.queued ?? 0}건</strong>
              </span>

              <span>
                AI 진행 <strong>{aiStatus?.running ?? 0}건</strong>
              </span>

              <span className="recent-note">
                API 기준일 <strong>{dashboardSummary?.date ?? "-"}</strong>
              </span>
            </div>

            <div className="workspace-grid">
              <aside className="timeline-panel">
                <div className="panel-heading">
                  <h3>진료 타임라인</h3>
                  <span>{timelineItems.length}건</span>
                </div>

                <div className="compact-tabs">
                  <button className="active" type="button">
                    전체
                  </button>

                  <button type="button" disabled>
                    검사
                  </button>

                  <button type="button" disabled>
                    진료
                  </button>

                  <button type="button" disabled>
                    메모
                  </button>
                </div>

                <div className="study-list-block">
                  <div className="study-list-title">
                    <span>영상 검사</span>
                    <b>{imagingStudies.length}</b>
                  </div>

                  {studiesLoading && (
                    <div className="study-list-message">
                      <LoaderCircle
                        size={14}
                        strokeWidth={1.8}
                        className="spin"
                      />
                      검사 목록을 불러오는 중
                    </div>
                  )}

                  {!studiesLoading && studiesError && (
                    <div className="study-list-error">{studiesError}</div>
                  )}

                  {!studiesLoading &&
                    !studiesError &&
                    imagingStudies.map((study) => (
                      <button
                        key={study.id}
                        className={`study-row ${
                          selectedStudy?.id === study.id ? "active" : ""
                        }`}
                        onClick={() => {
                          setSelectedStudyId(study.id);
                          setActiveTab("영상");
                        }}
                        type="button"
                      >
                        <Images size={15} strokeWidth={1.8} />

                        <span>
                          <strong>{study.description}</strong>
                          <small>
                            {study.modality} · {study.studyDate || "날짜 없음"}
                          </small>
                        </span>

                        <b>{study.status}</b>
                      </button>
                    ))}

                  {!studiesLoading &&
                    !studiesError &&
                    imagingStudies.length === 0 && (
                      <p className="study-list-message">
                        등록된 영상검사가 없습니다.
                      </p>
                    )}
                </div>

                {timelineLoading && (
                  <div className="panel-loading">
                    타임라인을 불러오는 중입니다.
                  </div>
                )}

                {!timelineLoading && timelineItems.length > 0 && (
                  <div className="timeline">
                    {timelineItems.map((item, index) => (
                      <article
                        key={`${item.date}-${item.title}-${index}`}
                        className={`timeline-item ${
                          item.active ? "active" : ""
                        }`}
                      >
                        <time>{item.date}</time>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                )}

                {!timelineLoading && timelineItems.length === 0 && (
                  <EmptyState
                    compact
                    title="진료 이력이 없습니다"
                    description="등록된 진료·검사·보고서 이력이 없습니다."
                  />
                )}
              </aside>

              <section className="analysis-panel">
                <div className="analysis-tabs compact-tabs">
                  <div>
                    {workspaceTabs.map((tab) => (
                      <button
                        key={tab}
                        className={activeTab === tab ? "active" : ""}
                        onClick={() => setActiveTab(tab)}
                        type="button"
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {activeTab === "AI 분석" ? (
                  <ClinicalAIAnalysisPanel
                    patient={selectedPatient}
                    patientDetail={currentPatientDetail}
                    examinationId={selectedExaminationId}
                  />
                ) : activeTab === "영상" && selectedStudy ? (
                  <div className="viewer-card">
                    <div className="viewer-toolbar">
                      <span>
                        <strong>{selectedStudy.modality}</strong>
                        {selectedStudy.description}
                      </span>

                      <span>
                        {selectedStudy.seriesCount !== undefined &&
                          `Series ${selectedStudy.seriesCount}`}
                        {selectedStudy.instanceCount !== undefined &&
                          ` · ${selectedStudy.instanceCount} images`}
                      </span>
                    </div>

                    <div className="viewer-stage">
                      <Images size={30} strokeWidth={1.5} />
                      <strong>DICOM Viewer 연결 준비</strong>
                      <p>
                        검사 선택까지 연결되었습니다. 다음 단계에서 Viewer
                        token과 Series/Instance를 연결합니다.
                      </p>
                    </div>

                    <div className="viewer-footer">
                      <span>Study #{selectedStudy.id}</span>
                      <span>{selectedStudy.status}</span>
                    </div>
                  </div>
                ) : (
                  <div className="analysis-empty-card">
                    <EmptyState
                      title={
                        studiesLoading && activeTab === "영상"
                          ? "영상검사를 불러오는 중입니다"
                          : `${activeTab} 데이터가 없습니다`
                      }
                      description={workspaceEmptyDescription[activeTab]}
                    />

                    <span className="connection-label">
                      {studiesError && activeTab === "영상"
                        ? "API 연결 실패"
                        : "LIVE API"}
                    </span>
                  </div>
                )}
              </section>

              <aside className="report-panel">
                <div className="report-tabs compact-tabs">
                  {reportTabs.map((tab) => (
                    <button
                      key={tab}
                      className={activeReportTab === tab ? "active" : ""}
                      onClick={() => setActiveReportTab(tab)}
                      type="button"
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {activeReportTab === "환자 메모" ? (
                  <div className="memo-panel">
                    <div className="memo-panel-heading">
                      <div>
                        <strong>환자 메모</strong>
                        <span>{patientMemos.length}건</span>
                      </div>

                      <small>선택한 환자에게만 표시됩니다.</small>
                    </div>

                    {memoError && (
                      <div className="memo-error" role="alert">
                        {memoError}
                      </div>
                    )}

                    {memosLoading && (
                      <div className="memo-loading">
                        <LoaderCircle
                          className="spin"
                          size={16}
                          strokeWidth={1.8}
                        />
                        메모를 불러오는 중입니다.
                      </div>
                    )}

                    {!memosLoading && (
                      <div className="memo-list">
                        {patientMemos.map((memo) => (
                          <article key={memo.id} className="memo-card">
                            <div className="memo-card-header">
                              <span>
                                <strong>{memo.authorName}</strong>
                                <time>{formatMemoDate(memo.updatedAt)}</time>
                              </span>

                              {editingMemoId !== memo.id && (
                                <button
                                  onClick={() => handleStartMemoEdit(memo)}
                                  type="button"
                                  aria-label="메모 수정"
                                  title="메모 수정"
                                >
                                  <Pencil size={14} strokeWidth={1.8} />
                                </button>
                              )}
                            </div>

                            {editingMemoId === memo.id ? (
                              <div className="memo-edit">
                                <textarea
                                  value={editingMemoContent}
                                  onChange={(event) =>
                                    setEditingMemoContent(event.target.value)
                                  }
                                  maxLength={2000}
                                />

                                <div className="memo-edit-actions">
                                  <button
                                    className="secondary"
                                    onClick={handleCancelMemoEdit}
                                    disabled={memoSaving}
                                    type="button"
                                  >
                                    <X size={13} strokeWidth={1.8} />
                                    취소
                                  </button>

                                  <button
                                    className="primary"
                                    onClick={() => void handleUpdateMemo()}
                                    disabled={
                                      memoSaving || !editingMemoContent.trim()
                                    }
                                    type="button"
                                  >
                                    <Save size={13} strokeWidth={1.8} />
                                    저장
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p>{memo.content}</p>
                            )}
                          </article>
                        ))}

                        {patientMemos.length === 0 && (
                          <div className="memo-empty">
                            등록된 환자 메모가 없습니다.
                          </div>
                        )}
                      </div>
                    )}

                    <div className="memo-compose">
                      <label htmlFor="patient-memo">새 메모</label>

                      <textarea
                        id="patient-memo"
                        value={memoDraft}
                        onChange={(event) => setMemoDraft(event.target.value)}
                        placeholder="진료 시 확인할 내용을 입력하세요."
                        maxLength={2000}
                      />

                      <div className="memo-compose-footer">
                        <span>{memoDraft.length}/2000</span>

                        <button
                          className="primary"
                          onClick={() => void handleCreateMemo()}
                          disabled={memoSaving || !memoDraft.trim()}
                          type="button"
                        >
                          <Save size={14} strokeWidth={1.8} />
                          {memoSaving ? "저장 중…" : "메모 저장"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : activeReportTab === '오더' ? (
                  <OrderWorkspace
                    patientId={selectedPatient.backendId}
                    encounterId={currentEncounterId}
                  />                
                ) : (
                  <div className="report-empty-card">
                    <EmptyState
                      title={`${activeReportTab} 데이터가 없습니다`}
                      description={reportEmptyDescription[activeReportTab]}
                    />

                    <span className="connection-label">API 연결 예정</span>
                  </div>
                )}
              </aside>
            </div>

            <footer className="system-status">
              <span>
                <i /> CDSS API 연결됨
              </span>

              <span>
                <i /> AI 서버{" "}
                {aiStatus?.failed ? `실패 ${aiStatus.failed}건` : "정상"}
              </span>

              <small>API 기준일 {dashboardSummary?.date ?? "-"}</small>
            </footer>
          </>
        )}
      </section>

      <ChatDock
        open={chatDockOpen}
        onToggle={() => setChatDockOpen((current) => !current)}
        onUnreadCountChange={setChatUnreadCount}
      />

      {privacyShieldVisible && (
        <div className="privacy-shield" aria-hidden="true">
          <ShieldCheck size={28} strokeWidth={1.8} />
          <strong>의료정보 보호 중</strong>
        </div>
      )}

      {sessionLocked && (
        <SessionLockOverlay
          clinicianName={clinicianDisplayName}
          loading={sessionUnlocking}
          error={sessionLockError}
          onUnlock={handleSessionUnlock}
          onLogout={handleLogout}
        />
      )}
    </main>
  );
}

export default App;
