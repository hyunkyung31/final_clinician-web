import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { LoginView } from "./components/LoginView";
import { AppPageHeader } from "./components/AppPageHeader";
import { ChatDock } from "./components/ChatDock";
import { NotificationCenter } from "./components/NotificationCenter";
import { SessionLockOverlay } from "./components/SessionLockOverlay";
import { HomeDashboard } from "./components/HomeDashboard";
import {
  fallbackSectionForRole,
  initialActiveSection,
  landingSectionAfterLogin,
  pageHeaderCopy,
  SECTION_STORAGE_KEY,
  showChatPatientContext,
  type AppShellSection,
} from "./appShell";
import { ConsultationWorkspace } from "./components/ConsultationWorkspace";
import { ScheduleWorkspace } from "./components/ScheduleWorkspace";
import { AppointmentWorkspace } from "./components/AppointmentWorkspace";
import { ProcedureRecordWorkspace } from "./components/ProcedureRecordWorkspace";
import {
  ModuleWorkspace,
  type ModuleSection,
} from "./components/ModuleWorkspace";
import { WorkstationHub } from "./components/WorkstationHub";

import {
  ApiError,
  getDashboardAIStatus,
  getDashboardSummary,
  getImagingStudies,
  getPatientDetail,
  getPatientMemos,
  getPatientsPage,
  getPatientTimeline,
  getStaffDoctors,
  getStaffIdentity,
  hasSession,
  loginStaff,
  logoutStaff,
  reauthenticateStaff,
} from "./api/client";
import { resolveSelectedPatient } from "./api/patientSelection";

import {
  Activity,
  BrainCircuit,
  CalendarCheck2,
  CalendarDays,
  FileText,
  House,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Moon,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardPenLine,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Sun,
  Users,
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

type ThemeMode = "light" | "dark";
type FontSizeMode = "small" | "normal" | "large" | "xlarge";
type PatientScope = "mine" | "consultation" | "recent" | "all";
const scopeApi = { mine: "ASSIGNED_TO_ME", consultation: "CONSULTATION", recent: "RECENT", all: "ALL_ACCESSIBLE" } as const;

function patientQueryKey(input: {
  patientScope: string
  page: number
  search: string
  examDateFrom: string
  examDateTo: string
  examinationStatus: string
  aiStatus: string
}) {
  return JSON.stringify(input)
}

const DEFAULT_MINE_QUERY = patientQueryKey({
  patientScope: "mine",
  page: 1,
  search: "",
  examDateFrom: "",
  examDateTo: "",
  examinationStatus: "",
  aiStatus: "",
})

const RECENT_FIRST_PAGE_QUERY = patientQueryKey({
  patientScope: "recent",
  page: 1,
  search: "",
  examDateFrom: "",
  examDateTo: "",
  examinationStatus: "",
  aiStatus: "",
})

function mergePatients(current: PatientSummary[], incoming: PatientSummary[]) {
  return Array.from(
    new Map([...current, ...incoming].map((patient) => [patient.backendId, patient])).values(),
  )
}

function mergeRecentPatients(server: PatientSummary[], pinned: PatientSummary[]) {
  const serverIds = new Set(server.map((patient) => patient.backendId))
  return [...pinned.filter((patient) => !serverIds.has(patient.backendId)), ...server]
}

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

type GlobalSection = AppShellSection;

interface NavItem {
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { icon: House, label: "홈" },
  { icon: LayoutDashboard, label: "워크스테이션" },
  { icon: CalendarDays, label: "일정" },
  { icon: CalendarCheck2, label: "예약" },
  { icon: Users, label: "환자 관리" },
  { icon: MonitorPlay, label: "검사·영상" },
  { icon: BrainCircuit, label: "AI 분석" },
  { icon: ClipboardPenLine, label: "시술기록" },
  { icon: Stethoscope, label: "협진" },
  { icon: FileText, label: "결과보고서" },
  { icon: Settings, label: "설정" },
];

// 발표 시연 기준: Clinical/XCA/CCTA AI는 각 환자의 검사·영상 workflow 안에서
// 실행/확인하므로, 별도 사이드바 'AI 분석' 페이지는 워크플로우가 중복된다.
// route/component/API(GlobalSection "AI 분석", ModuleWorkspace 렌더 분기,
// 알림 클릭 시 setActiveSection("AI 분석") 등)는 그대로 두고 사이드바
// navigation 항목만 숨긴다. 추후 AI 작업 모니터링 화면으로 재사용 가능.
const hiddenSidebarSections = new Set<GlobalSection>(["AI 분석"]);

const connectedSections = new Set<GlobalSection>([
  "홈",
  "워크스테이션",
  "일정",
  "예약",
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
  "예약",
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

function App() {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [fontSize, setFontSize] = useState<FontSizeMode>(initialFontSize);
  const [mode, setMode] = useState<"auth" | "api">(
    hasSession() ? "api" : "auth",
  );

  const [activeSection, setActiveSection] =
    useState<GlobalSection>(() => initialActiveSection(hasSession(), window.sessionStorage.getItem(SECTION_STORAGE_KEY)));

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
    if (mode === "api") {
      window.sessionStorage.setItem(SECTION_STORAGE_KEY, activeSection);
    }
  }, [activeSection, mode]);

  useEffect(() => {
    if (activeSection === "채팅") {
      setChatDockOpen(true);
      setActiveSection("홈");
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
  const [patientListError, setPatientListError] = useState("");
  const [patientScope, setPatientScope] = useState<PatientScope>("mine");
  const [patientSearchResults, setPatientSearchResults] = useState<PatientSummary[] | null>(null);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [examDateFrom, setExamDateFrom] = useState("");
  const [examDateTo, setExamDateTo] = useState("");
  const [examinationStatusFilter, setExaminationStatusFilter] = useState("");
  const [aiStatusFilter, setAiStatusFilter] = useState("");
  const [draftExamDateFrom, setDraftExamDateFrom] = useState("");
  const [draftExamDateTo, setDraftExamDateTo] = useState("");
  const [draftExaminationStatus, setDraftExaminationStatus] = useState("");
  const [draftAiStatus, setDraftAiStatus] = useState("");
  const [imagingLaunchFocus, setImagingLaunchFocus] = useState<'xca' | 'ccta3d' | 'imaging' | null>(null);

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

  const [apiLoading, setApiLoading] = useState(() => hasSession());

  const [timelineLoading, setTimelineLoading] = useState(false);

  const [apiError, setApiError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [loginError, setLoginError] = useState("");
  const [search, setSearch] = useState("");

  const [patientMemos, setPatientMemos] = useState<PatientMemo[]>([]);

  const [memosLoading, setMemosLoading] = useState(false);
  const [memoError, setMemoError] = useState("");

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

  const selectedPatient = resolveSelectedPatient(selectedId, [
    patientList,
    myPatientList,
    consultationPatientList,
    recentPatientList,
    patientSearchResults,
  ]);

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

  const workspaceLoadGeneration = useRef(0);
  const pinnedRecentRef = useRef<PatientSummary[]>([]);
  const visiblePatientQueryRef = useRef(DEFAULT_MINE_QUERY);
  visiblePatientQueryRef.current = patientQueryKey({
    patientScope,
    page: patientPage,
    search: search.trim(),
    examDateFrom,
    examDateTo,
    examinationStatus: examinationStatusFilter,
    aiStatus: aiStatusFilter,
  });

  const expireApiSession = () => {
    setMode("auth");
    pinnedRecentRef.current = [];
    setPatientList([]);
    setMyPatientList([]);
    setConsultationPatientList([]);
    setRecentPatientList([]);
    setSelectedId("");
    setDashboardSummary(null);
    setAIStatus(null);
    resetPatientData();
    setLoginError("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
  };

  const loadApiWorkspace = async () => {
    const generation = ++workspaceLoadGeneration.current;
    const stillCurrent = () => workspaceLoadGeneration.current === generation;
    setApiLoading(true);
    setApiError("");

    try {
      const mine = await getPatientsPage("", false, { patientScope: "ASSIGNED_TO_ME" });
      if (!stillCurrent()) return;

      setMyPatientList(mine.results);
      setPatientList((current) => mergePatients(current, mine.results));
      setSelectedId((current) => current || mine.results[0]?.id || "");
      if (visiblePatientQueryRef.current === DEFAULT_MINE_QUERY) {
        setPatientSearchResults(mine.results);
        setPatientCount(mine.count);
        setPatientsHasNext(mine.hasNext);
        setPatientSearchLoading(false);
      }
    } catch (error) {
      if (!stillCurrent()) return;
      if (error instanceof ApiError && error.status === 401) {
        expireApiSession();
      } else {
        setApiError(
          error instanceof Error
            ? error.message
            : "API 데이터를 불러오지 못했습니다.",
        );
      }
      setApiLoading(false);
      return;
    }

    if (!stillCurrent()) return;
    setApiLoading(false);

    const [allResult, consultationResult, recentResult, summaryResult, aiStatusResult] =
      await Promise.allSettled([
        getPatientsPage("", false, { patientScope: "ALL_ACCESSIBLE" }),
        getPatientsPage("", false, { patientScope: "CONSULTATION" }),
        getPatientsPage("", false, { patientScope: "RECENT" }),
        getDashboardSummary(),
        getDashboardAIStatus(),
      ]);
    if (!stillCurrent()) return;

    const unauthorized = [allResult, consultationResult, recentResult, summaryResult, aiStatusResult]
      .find((result) => result.status === "rejected" && result.reason instanceof ApiError && result.reason.status === 401);
    if (unauthorized) {
      expireApiSession();
      return;
    }

    if (allResult.status === "fulfilled") {
      setPatientList((current) => mergePatients(current, allResult.value.results));
      setSelectedId((current) => current || allResult.value.results[0]?.id || "");
    }
    if (consultationResult.status === "fulfilled") {
      setConsultationPatientList(consultationResult.value.results);
    }
    if (recentResult.status === "fulfilled") {
      setRecentPatientList(mergeRecentPatients(recentResult.value.results, pinnedRecentRef.current));
    }
    if (summaryResult.status === "fulfilled") setDashboardSummary(summaryResult.value);
    if (aiStatusResult.status === "fulfilled") setAIStatus(aiStatusResult.value);
  };

  useEffect(() => {
    if (mode === "api") {
      void loadApiWorkspace();
    }
    return () => {
      workspaceLoadGeneration.current += 1;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'api') return;
    const query = visiblePatientQueryRef.current;
    const defaultMine = query === DEFAULT_MINE_QUERY;
    if (defaultMine) {
      // 다른 탭·검색에서 기본 "내 담당"으로 돌아왔을 때, 그 이전 조회가 아직
      // 응답하지 않은 상태라면 그 조회의 .finally()는 active=false라 로딩 상태를
      // 되돌리지 못한다. 여기서 명시적으로 꺼서 로딩 표시가 영구히 남지 않게 한다.
      setPatientSearchLoading(false);
      return;
    }
    let active = true;
    setPatientSearchLoading(true);
    setPatientListError('');
    const timer = window.setTimeout(() => {
      void getPatientsPage(search.trim(), false, {
        patientScope: scopeApi[patientScope], page: patientPage,
        examDateFrom, examDateTo, examinationStatus: examinationStatusFilter, aiStatus: aiStatusFilter,
      }).then((data) => {
        if (!active || visiblePatientQueryRef.current !== query) return;
        setPatientSearchResults(data.results);
        setPatientCount(data.count);
        setPatientsHasNext(data.hasNext);
        setPatientList((items) => mergePatients(items, data.results));
        if (patientScope === "mine" && patientPage === 1 && !search.trim()) setMyPatientList(data.results);
        if (patientScope === "recent" && patientPage === 1 && !search.trim()) {
          setRecentPatientList(mergeRecentPatients(data.results, pinnedRecentRef.current));
        }
      }).catch((error) => { if (active && visiblePatientQueryRef.current === query) { setPatientSearchResults([]); setPatientCount(0); setPatientsHasNext(false); setPatientListError(error instanceof Error ? error.message : '환자 목록 조회 실패'); } })
        .finally(() => { if (active && visiblePatientQueryRef.current === query) setPatientSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mode, patientScope, patientPage, search, examDateFrom, examDateTo, examinationStatusFilter, aiStatusFilter]);

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
      setActiveSection(fallbackSectionForRole(activeSection, roleSections));
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
          pinnedRecentRef.current = [
            selectedPatient,
            ...pinnedRecentRef.current.filter((item) => item.backendId !== selectedPatient.backendId),
          ].slice(0, 20);
          setRecentPatientList((items) => [selectedPatient, ...items.filter((item) => item.backendId !== selectedPatient.backendId)]);
          if (visiblePatientQueryRef.current === RECENT_FIRST_PAGE_QUERY) {
            setPatientSearchResults((items) => [selectedPatient, ...(items ?? []).filter((item) => item.backendId !== selectedPatient.backendId)]);
          }
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
      setMemoError("");
      setMemosLoading(false);
      return;
    }

    let active = true;

    setPatientMemos([]);
    setMemoError("");
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
      const landing = landingSectionAfterLogin();
      window.sessionStorage.setItem(SECTION_STORAGE_KEY, landing);
      setActiveSection(landing);
      setApiLoading(true);
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

  const handleLogout = async () => {
    await logoutStaff().catch(() => undefined);

    setMode("auth");
    setApiLoading(false);
    pinnedRecentRef.current = [];
    setPatientList([]);
    setSelectedId("");
    setDashboardSummary(null);
    setAIStatus(null);
    setSearch("");
    setApiError("");
    setLoginError("");
    window.sessionStorage.removeItem(SECTION_STORAGE_KEY);
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

  const headerCopy = pageHeaderCopy(
    activeSection,
    selectedPatient ? { name: selectedPatient.name, id: selectedPatient.id } : null,
  );
  const chatPatient = showChatPatientContext(activeSection) && selectedPatient
    ? { name: selectedPatient.name, id: selectedPatient.id }
    : null;

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
      className={`app-shell ${
        chatDockOpen ? "chat-dock-open" : "chat-dock-collapsed"
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
            if (hiddenSidebarSections.has(item.label as GlobalSection)) return null;

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

      <div className="app-shell-main">
        <AppPageHeader
          title={headerCopy.title}
          subtitle={headerCopy.subtitle}
          userName={clinicianName}
          userDepartment={clinicianDepartment}
          onLogout={() => void handleLogout()}
        >
          <NotificationCenter onOpenNotification={handleOpenNotification} />
        </AppPageHeader>

        <div className={`app-shell-content ${activeSection === "워크스테이션" ? "is-workstation" : ""}`}>
      {activeSection === "홈" && (
        <HomeDashboard
          summary={dashboardSummary}
          aiStatus={aiStatus}
          patients={patientList}
          doctorId={staffDoctor?.id}
          roles={staffIdentity?.roles ?? []}
          clinicianName={clinicianDisplayName}
          loadEnabled={!apiLoading}
          onNavigate={(destination) => {
            if (destination === "채팅") {
              setChatDockOpen(true);
              return;
            }
            setActiveSection(destination);
          }}
          onOpenPatient={(patientId) => {
            const patient = resolveSelectedPatient(String(patientId), [
              patientList,
              myPatientList,
              consultationPatientList,
              recentPatientList,
              patientSearchResults,
            ]);
            if (patient) setSelectedId(patient.id);
            setActiveSection("워크스테이션");
          }}
        />
      )}

      {activeSection === "일정" && <ScheduleWorkspace />}

      {activeSection === "예약" && <AppointmentWorkspace roles={staffIdentity?.roles ?? []} doctorId={staffDoctor?.id} />}

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
          staffIdentity={staffIdentity}
          staffDoctor={staffDoctor}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          imagingLaunchFocus={imagingLaunchFocus}
          onSelectPatient={(patient) => {
            setPatientList((current) => [patient, ...current.filter((item) => item.id !== patient.id)]);
            setSelectedId(patient.id);
            resetPatientData();
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
            <summary>상세 필터{[examDateFrom, examDateTo, examinationStatusFilter, aiStatusFilter].filter(Boolean).length ? ` ● ${[examDateFrom, examDateTo, examinationStatusFilter, aiStatusFilter].filter(Boolean).length}` : ''}</summary>
            <div>
              <div className="filter-range">
                <label>검사 기간<input type="date" value={draftExamDateFrom} onChange={(event) => setDraftExamDateFrom(event.target.value)} /></label>
                <span>~</span>
                <label>종료일<input type="date" value={draftExamDateTo} onChange={(event) => setDraftExamDateTo(event.target.value)} /></label>
              </div>
              <label>검사 상태<select value={draftExaminationStatus} onChange={(event) => setDraftExaminationStatus(event.target.value)}><option value="">전체</option><option value="ORDERED">접수</option><option value="SCHEDULED">예약</option><option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option><option value="CANCELED">취소</option></select></label>
              <label>AI 상태<select value={draftAiStatus} onChange={(event) => setDraftAiStatus(event.target.value)}><option value="">전체</option><option value="QUEUED">대기</option><option value="RUNNING">진행중</option><option value="SUCCEEDED">완료</option><option value="FAILED">실패</option></select></label>
              <div className="filter-actions">
                <button onClick={() => {
                  setDraftExamDateFrom(""); setDraftExamDateTo(""); setDraftExaminationStatus(""); setDraftAiStatus("");
                  setExamDateFrom(""); setExamDateTo(""); setExaminationStatusFilter(""); setAiStatusFilter("");
                }} type="button">초기화</button>
                <button className="primary" onClick={() => {
                  setExamDateFrom(draftExamDateFrom); setExamDateTo(draftExamDateTo);
                  setExaminationStatusFilter(draftExaminationStatus); setAiStatusFilter(draftAiStatus);
                }} type="button">적용</button>
              </div>
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
          <WorkstationHub
            patient={selectedPatient}
            patientDetail={currentPatientDetail}
            patientDetailLoading={patientDetailLoading}
            patientDetailError={patientDetailError}
            imagingStudies={imagingStudies}
            studiesLoading={studiesLoading}
            studiesError={studiesError}
            selectedStudy={selectedStudy}
            onSelectStudy={(studyId) => setSelectedStudyId(studyId)}
            timelineItems={timelineItems}
            timelineLoading={timelineLoading}
            memos={patientMemos}
            memosLoading={memosLoading}
            memoError={memoError}
            onReloadMemos={async () => {
              if (selectedPatient.backendId) await reloadPatientMemos(selectedPatient.backendId)
            }}
            encounterId={currentEncounterId}
            examinationId={selectedExaminationId}
            aiStatus={aiStatus}
            staffIdentity={staffIdentity}
            staffDoctor={staffDoctor}
            onOpenReports={() => setActiveSection('결과보고서')}
            onOpenExamImaging={() => {
              setImagingLaunchFocus('imaging')
              setActiveSection('검사·영상')
            }}
            onOpenXcaDetail={() => {
              setImagingLaunchFocus('xca')
              setActiveSection('검사·영상')
            }}
            onOpenCcta3d={() => {
              setImagingLaunchFocus('ccta3d')
              setActiveSection('검사·영상')
            }}
          />
        )}
      </section>
        </div>
      </div>

      <ChatDock
        open={chatDockOpen}
        onToggle={() => setChatDockOpen((current) => !current)}
        onUnreadCountChange={setChatUnreadCount}
        patientContext={chatPatient}
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
