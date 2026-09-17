import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";

import {
  cancelPrescription,
  createPrescriptionDraft,
  createPrescriptionItem,
  deletePrescriptionItem,
  getMedicationFavorites,
  getMedications,
  getPrescriptionDetail,
  getPrescriptions,
  runPrescriptionDurCheck,
  updatePrescriptionItem,
  updatePrescriptionNotes,
} from "../api/client";

import type {
  MedicationFavoriteSummary,
  MedicationSummary,
  PrescriptionDetail,
  PrescriptionItemSummary,
  PrescriptionSummary,
} from "../types";

interface PrescriptionPanelProps {
  patientId?: number;
  encounterId: number | null;
}

type MedicationGroup =
  | "favorites"
  | "cath"
  | "cardiology"
  | "surgery";

interface MedicationEditor {
  medicationId: number | null;
  doseValue: string;
  doseUnit: string;
  frequencyPerDay: string;
  durationDays: string;
  route: string;
  instructions: string;
}

const emptyEditor: MedicationEditor = {
  medicationId: null,
  doseValue: "",
  doseUnit: "",
  frequencyPerDay: "",
  durationDays: "",
  route: "PO",
  instructions: "",
};

const medicationGroups: Array<{
  id: MedicationGroup;
  label: string;
}> = [
  { id: "favorites", label: "즐겨찾기" },
  { id: "cath", label: "조영실·PCI" },
  { id: "cardiology", label: "순환기" },
  { id: "surgery", label: "흉부외과" },
];

const medicationKeywords: Record<
  Exclude<MedicationGroup, "favorites">,
  string[]
> = {
  cath: [
    "aspirin",
    "아스피린",
    "clopidogrel",
    "클로피도그렐",
    "ticagrelor",
    "티카그렐러",
    "atorvastatin",
    "아토르바스타틴",
    "rosuvastatin",
    "로수바스타틴",
    "nitroglycerin",
    "니트로글리세린",
  ],
  cardiology: [
    "aspirin",
    "아스피린",
    "clopidogrel",
    "클로피도그렐",
    "ticagrelor",
    "티카그렐러",
    "apixaban",
    "아픽사반",
    "rivaroxaban",
    "리바록사반",
    "edoxaban",
    "에독사반",
    "dabigatran",
    "다비가트란",
    "warfarin",
    "와파린",
    "atorvastatin",
    "아토르바스타틴",
    "rosuvastatin",
    "로수바스타틴",
    "ezetimibe",
    "에제티미브",
    "bisoprolol",
    "비소프롤롤",
    "carvedilol",
    "카르베딜롤",
    "sacubitril",
    "사쿠비트릴",
    "valsartan",
    "발사르탄",
    "spironolactone",
    "스피로노락톤",
    "dapagliflozin",
    "다파글리플로진",
    "empagliflozin",
    "엠파글리플로진",
    "furosemide",
    "푸로세미드",
    "amiodarone",
    "아미오다론",
  ],
  surgery: [
    "aspirin",
    "아스피린",
    "warfarin",
    "와파린",
    "atorvastatin",
    "아토르바스타틴",
    "rosuvastatin",
    "로수바스타틴",
    "bisoprolol",
    "비소프롤롤",
    "carvedilol",
    "카르베딜롤",
    "metoprolol",
    "메토프로롤",
    "amiodarone",
    "아미오다론",
    "furosemide",
    "푸로세미드",
  ],
};

const prescriptionStatusLabel: Record<
  PrescriptionSummary["status"],
  string
> = {
  DRAFT: "작성 중",
  SIGNED: "서명 완료",
  CANCELED: "취소",
};

function medicationSearchText(
  medication: MedicationSummary,
) {
  return [
    medication.name,
    medication.ingredient,
    medication.code,
    medication.manufacturer,
    medication.strength,
  ]
    .join(" ")
    .toLowerCase();
}

function uniqueMedications(
  medications: MedicationSummary[],
) {
  return Array.from(
    new Map(
      medications.map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  );
}

function parsePositiveNumber(
  value: string,
): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return undefined;
  }

  return parsed;
}

function formatPrescriptionDate(value: string) {
  if (!value) {
    return "-";
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

export function PrescriptionPanel({
  patientId,
  encounterId,
}: PrescriptionPanelProps) {
  const [medications, setMedications] =
    useState<MedicationSummary[]>([]);

  const [favorites, setFavorites] =
    useState<MedicationFavoriteSummary[]>([]);

  const [prescriptions, setPrescriptions] =
    useState<PrescriptionSummary[]>([]);

  const [activePrescriptionId, setActivePrescriptionId] =
    useState<number | null>(null);

  const [detail, setDetail] =
    useState<PrescriptionDetail | null>(null);

  const [activeGroup, setActiveGroup] =
    useState<MedicationGroup>("cardiology");

  const [search, setSearch] = useState("");

  const [editor, setEditor] =
    useState<MedicationEditor>(emptyEditor);

  const [editingItemId, setEditingItemId] =
    useState<number | null>(null);

  const [prescriptionNotes, setPrescriptionNotes] =
    useState("");

  const [cancelReason, setCancelReason] =
    useState("");

  const [showCancelForm, setShowCancelForm] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [durLoading, setDurLoading] =
    useState(false);
  const [canceling, setCanceling] =
    useState(false);

  const [error, setError] = useState("");
  const [durMessage, setDurMessage] =
    useState("");

  const activePrescription =
    detail?.prescription ??
    prescriptions.find(
      (item) =>
        item.id === activePrescriptionId,
    ) ??
    null;

  const selectedMedication =
    medications.find(
      (item) =>
        item.id === editor.medicationId,
    ) ?? null;

  const canEdit =
    activePrescription?.status === "DRAFT";

  const visibleMedications = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    if (keyword) {
      return medications
        .filter((medication) =>
          medicationSearchText(
            medication,
          ).includes(keyword),
        )
        .slice(0, 20);
    }

    if (activeGroup === "favorites") {
      return uniqueMedications(
        favorites.map(
          (favorite) =>
            favorite.medication,
        ),
      ).slice(0, 12);
    }

    const keywords =
      medicationKeywords[activeGroup];

    return medications
      .map((medication) => {
        const text =
          medicationSearchText(
            medication,
          );

        const priority =
          keywords.findIndex(
            (keywordItem) =>
              text.includes(
                keywordItem.toLowerCase(),
              ),
          );

        return {
          medication,
          priority,
        };
      })
      .filter(
        (item) => item.priority >= 0,
      )
      .sort(
        (a, b) =>
          a.priority - b.priority,
      )
      .map((item) => item.medication)
      .slice(0, 12);
  }, [
    activeGroup,
    favorites,
    medications,
    search,
  ]);

  const loadPrescriptionDetail = async (
    prescriptionId: number,
  ) => {
    setDetailLoading(true);
    setError("");

    try {
      const nextDetail =
        await getPrescriptionDetail(
          prescriptionId,
        );

      setDetail(nextDetail);
      setActivePrescriptionId(
        prescriptionId,
      );
      setPrescriptionNotes(
        nextDetail.prescription.notes,
      );
    } catch (requestError) {
      setDetail(null);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "처방 상세정보를 불러오지 못했습니다.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshPrescriptions = async (
    selectedPatientId: number,
    preferredId?: number,
  ) => {
    const nextPrescriptions =
      await getPrescriptions(
        selectedPatientId,
      );

    setPrescriptions(nextPrescriptions);

    const selected =
      nextPrescriptions.find(
        (item) =>
          item.id === preferredId,
      ) ??
      nextPrescriptions.find(
        (item) =>
          item.status === "DRAFT",
      ) ??
      nextPrescriptions[0] ??
      null;

    if (!selected) {
      setActivePrescriptionId(null);
      setDetail(null);
      setPrescriptionNotes("");
      return;
    }

    await loadPrescriptionDetail(
      selected.id,
    );
  };

  useEffect(() => {
    if (!patientId) {
      setMedications([]);
      setFavorites([]);
      setPrescriptions([]);
      setActivePrescriptionId(null);
      setDetail(null);
      setEditor(emptyEditor);
      setError("");
      return;
    }

    let active = true;

    setLoading(true);
    setError("");
    setDurMessage("");
    setShowCancelForm(false);
    setCancelReason("");
    setEditor(emptyEditor);
    setEditingItemId(null);

    Promise.all([
      getMedications(),
      getMedicationFavorites(),
      getPrescriptions(patientId),
    ])
      .then(
        async ([
          nextMedications,
          nextFavorites,
          nextPrescriptions,
        ]) => {
          if (!active) {
            return;
          }

          setMedications(
            nextMedications,
          );
          setFavorites(nextFavorites);
          setPrescriptions(
            nextPrescriptions,
          );

          const selected =
            nextPrescriptions.find(
              (item) =>
                item.status === "DRAFT",
            ) ??
            nextPrescriptions[0] ??
            null;

          if (!selected) {
            setDetail(null);
            setActivePrescriptionId(
              null,
            );
            setPrescriptionNotes("");
            return;
          }

          const nextDetail =
            await getPrescriptionDetail(
              selected.id,
            );

          if (!active) {
            return;
          }

          setActivePrescriptionId(
            selected.id,
          );
          setDetail(nextDetail);
          setPrescriptionNotes(
            nextDetail.prescription.notes,
          );
        },
      )
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "처방 데이터를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  const resetEditor = () => {
    setEditor(emptyEditor);
    setEditingItemId(null);
  };

  const selectMedication = (
    medication: MedicationSummary,
  ) => {
    setEditor({
      ...emptyEditor,
      medicationId: medication.id,
      doseUnit:
        medication.defaultUnit || "",
    });

    setEditingItemId(null);
    setError("");
  };

  const ensureDraft = async () => {
    if (!patientId || !encounterId) {
      throw new Error(
        "처방을 생성할 환자 또는 진료 정보가 없습니다.",
      );
    }

    if (
      detail?.prescription.status ===
      "DRAFT"
    ) {
      return detail.prescription.id;
    }

    const existingDraft =
      prescriptions.find(
        (item) =>
          item.status === "DRAFT",
      );

    if (existingDraft) {
      await loadPrescriptionDetail(
        existingDraft.id,
      );

      return existingDraft.id;
    }

    const created =
      await createPrescriptionDraft(
        encounterId,
        patientId,
      );

    setPrescriptions((current) => [
      created,
      ...current,
    ]);

    setActivePrescriptionId(
      created.id,
    );

    setDetail({
      prescription: created,
      items: [],
    });

    setPrescriptionNotes("");

    return created.id;
  };

  const handleCreateDraft = async () => {
    if (!patientId || !encounterId) {
      setError(
        "처방을 생성할 진료 정보를 찾지 못했습니다.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const draftId =
        await ensureDraft();

      await loadPrescriptionDetail(
        draftId,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "처방 초안을 생성하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMedication = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!editor.medicationId) {
      setError("약품을 선택해주세요.");
      return;
    }

    const doseValue =
      parsePositiveNumber(
        editor.doseValue,
      );

    const frequencyPerDay =
      parsePositiveNumber(
        editor.frequencyPerDay,
      );

    const durationDays =
      parsePositiveNumber(
        editor.durationDays,
      );

    if (!doseValue) {
      setError(
        "1회 투여 용량을 입력해주세요.",
      );
      return;
    }

    if (!editor.doseUnit.trim()) {
      setError("투여 단위를 입력해주세요.");
      return;
    }

    if (!frequencyPerDay) {
      setError(
        "1일 투여 횟수를 입력해주세요.",
      );
      return;
    }

    if (!durationDays) {
      setError(
        "투여 기간을 입력해주세요.",
      );
      return;
    }

    if (!editor.route) {
      setError(
        "투여 경로를 선택해주세요.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const prescriptionId =
        await ensureDraft();

      const input = {
        doseValue,
        doseUnit:
          editor.doseUnit.trim(),
        frequencyPerDay,
        durationDays,
        route: editor.route,
        instructions:
          editor.instructions.trim(),
      };

      if (editingItemId !== null) {
        await updatePrescriptionItem(
          editingItemId,
          input,
        );
      } else {
        await createPrescriptionItem(
          prescriptionId,
          {
            medicationId:
              editor.medicationId,
            ...input,
          },
        );
      }

      await loadPrescriptionDetail(
        prescriptionId,
      );

      resetEditor();
      setDurMessage("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "처방 약품을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (
    item: PrescriptionItemSummary,
  ) => {
    setEditingItemId(item.id);

    setEditor({
      medicationId: item.medicationId,
      doseValue:
        item.doseValue !== undefined
          ? String(item.doseValue)
          : "",
      doseUnit: item.doseUnit,
      frequencyPerDay:
        item.frequencyPerDay !==
        undefined
          ? String(
              item.frequencyPerDay,
            )
          : "",
      durationDays:
        item.durationDays !== undefined
          ? String(item.durationDays)
          : "",
      route: item.route || "PO",
      instructions:
        item.instructions,
    });

    setError("");
  };

  const handleDeleteItem = async (
    itemId: number,
  ) => {
    if (
      !detail ||
      detail.prescription.status !==
        "DRAFT"
    ) {
      return;
    }

    const confirmed = window.confirm(
      "이 약품을 처방 초안에서 삭제할까요?",
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await deletePrescriptionItem(
        itemId,
      );

      await loadPrescriptionDetail(
        detail.prescription.id,
      );

      if (editingItemId === itemId) {
        resetEditor();
      }

      setDurMessage("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "처방 약품을 삭제하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (
      !detail ||
      detail.prescription.status !==
        "DRAFT"
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updatePrescriptionNotes(
        detail.prescription.id,
        prescriptionNotes,
      );

      await loadPrescriptionDetail(
        detail.prescription.id,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "처방 메모를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDurCheck = async () => {
    if (!detail) {
      return;
    }

    if (detail.items.length === 0) {
      setError(
        "DUR 검사 전에 처방 약품을 추가해주세요.",
      );
      return;
    }

    setDurLoading(true);
    setError("");
    setDurMessage("");

    try {
      await runPrescriptionDurCheck(
        detail.prescription.id,
      );

      setDurMessage(
        "DUR 검사가 완료되었습니다.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "DUR 검사에 실패했습니다.",
      );
    } finally {
      setDurLoading(false);
    }
  };

  const handleCancelPrescription =
    async () => {
      if (
        !patientId ||
        !detail ||
        detail.prescription.status !==
          "SIGNED"
      ) {
        return;
      }

      const reason =
        cancelReason.trim();

      if (!reason) {
        setError(
          "처방 취소 사유를 입력해주세요.",
        );
        return;
      }

      setCanceling(true);
      setError("");

      try {
        await cancelPrescription(
          detail.prescription.id,
          reason,
        );

        await refreshPrescriptions(
          patientId,
          detail.prescription.id,
        );

        setShowCancelForm(false);
        setCancelReason("");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "처방을 취소하지 못했습니다.",
        );
      } finally {
        setCanceling(false);
      }
    };

  return (
    <div className="prescription-panel">
      <div className="prescription-heading">
        <div>
          <span>
            <HeartPulse
              size={16}
              strokeWidth={1.8}
            />
            <strong>처방 오더</strong>
          </span>

          {activePrescription && (
            <b
              className={`prescription-status status-${activePrescription.status.toLowerCase()}`}
            >
              {
                prescriptionStatusLabel[
                  activePrescription.status
                ]
              }
            </b>
          )}
        </div>

        <small>
          심혈관 진료에서 자주 사용하는
          약품을 우선 표시합니다.
        </small>
      </div>

      {error && (
        <div
          className="prescription-error"
          role="alert"
        >
          <AlertTriangle
            size={14}
            strokeWidth={1.8}
          />
          {error}
        </div>
      )}

      <div className="prescription-selector">
        <label htmlFor="prescription-select">
          처방 내역
        </label>

        <div>
          <select
            id="prescription-select"
            value={
              activePrescriptionId ?? ""
            }
            onChange={(event) => {
              const nextId = Number(
                event.target.value,
              );

              if (
                Number.isFinite(nextId)
              ) {
                void loadPrescriptionDetail(
                  nextId,
                );
              }
            }}
            disabled={
              loading ||
              detailLoading ||
              prescriptions.length === 0
            }
          >
            {prescriptions.length === 0 && (
              <option value="">
                등록된 처방 없음
              </option>
            )}

            {prescriptions.map(
              (prescription) => (
                <option
                  key={prescription.id}
                  value={prescription.id}
                >
                  #
                  {prescription.id} ·{" "}
                  {
                    prescriptionStatusLabel[
                      prescription.status
                    ]
                  }{" "}
                  ·{" "}
                  {formatPrescriptionDate(
                    prescription.prescribedAt,
                  )}
                </option>
              ),
            )}
          </select>

          <button
            className="primary"
            onClick={() =>
              void handleCreateDraft()
            }
            disabled={
              saving ||
              loading ||
              !patientId ||
              !encounterId
            }
            type="button"
          >
            <Plus
              size={13}
              strokeWidth={1.8}
            />
            새 처방
          </button>
        </div>
      </div>

      <div className="medication-search">
        <Search
          size={14}
          strokeWidth={1.8}
        />

        <input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="약품명·성분명 검색"
        />

        {search && (
          <button
            onClick={() => setSearch("")}
            type="button"
            aria-label="검색어 지우기"
          >
            <X
              size={13}
              strokeWidth={1.8}
            />
          </button>
        )}
      </div>

      {!search && (
        <div className="medication-groups">
          {medicationGroups.map(
            (group) => (
              <button
                key={group.id}
                className={
                  activeGroup === group.id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setActiveGroup(group.id)
                }
                type="button"
              >
                {group.id ===
                  "favorites" && (
                  <Star
                    size={11}
                    strokeWidth={1.8}
                  />
                )}

                {group.label}
              </button>
            ),
          )}
        </div>
      )}

      {activeGroup === "cath" &&
        !search && (
          <div className="procedure-medication-note">
            <AlertTriangle
              size={13}
              strokeWidth={1.8}
            />

            <span>
              헤파린·아데노신·혈관 내
              니트로글리세린 등은 일반
              처방이 아닌
              <strong> 시술 투약</strong>
              으로 별도 연결할 예정입니다.
            </span>
          </div>
        )}

      <div className="medication-results">
        {loading ? (
          <div className="prescription-loading">
            <LoaderCircle
              className="spin"
              size={15}
              strokeWidth={1.8}
            />
            약품 목록을 불러오는 중입니다.
          </div>
        ) : (
          <>
            {visibleMedications.map(
              (medication) => {
                const isFavorite =
                  favorites.some(
                    (favorite) =>
                      favorite.medicationId ===
                      medication.id,
                  );

                return (
                  <button
                    key={medication.id}
                    className={`medication-result ${
                      editor.medicationId ===
                      medication.id
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      selectMedication(
                        medication,
                      )
                    }
                    type="button"
                  >
                    <span>
                      <strong>
                        {medication.name}
                      </strong>

                      <small>
                        {medication.ingredient ||
                          medication.code}
                        {medication.strength
                          ? ` · ${medication.strength}`
                          : ""}
                      </small>
                    </span>

                    {isFavorite && (
                      <Star
                        size={12}
                        fill="currentColor"
                        strokeWidth={1.8}
                      />
                    )}
                  </button>
                );
              },
            )}

            {visibleMedications.length ===
              0 && (
              <div className="medication-empty">
                {search
                  ? "검색된 약품이 없습니다."
                  : "이 분류에 등록된 약품이 없습니다. 전체 검색을 이용해주세요."}
              </div>
            )}
          </>
        )}
      </div>

      {selectedMedication && (
        <form
          className="medication-editor"
          onSubmit={
            handleSaveMedication
          }
        >
          <div className="medication-editor-heading">
            <span>
              <strong>
                {selectedMedication.name}
              </strong>

              <small>
                {selectedMedication.ingredient}
              </small>
            </span>

            <button
              onClick={resetEditor}
              type="button"
              aria-label="약품 입력 닫기"
            >
              <X
                size={14}
                strokeWidth={1.8}
              />
            </button>
          </div>

          <div className="medication-editor-grid">
            <label>
              1회 용량
              <input
                type="number"
                min="0"
                step="any"
                value={
                  editor.doseValue
                }
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    doseValue:
                      event.target.value,
                  })
                }
                placeholder="용량"
                required
              />
            </label>

            <label>
              단위
              <input
                value={editor.doseUnit}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    doseUnit:
                      event.target.value,
                  })
                }
                placeholder="mg"
                required
              />
            </label>

            <label>
              1일 횟수
              <input
                type="number"
                min="1"
                step="1"
                value={
                  editor.frequencyPerDay
                }
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    frequencyPerDay:
                      event.target.value,
                  })
                }
                placeholder="회"
                required
              />
            </label>

            <label>
              투여 기간
              <input
                type="number"
                min="1"
                step="1"
                value={
                  editor.durationDays
                }
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    durationDays:
                      event.target.value,
                  })
                }
                placeholder="일"
                required
              />
            </label>
          </div>

          <label>
            투여 경로
            <select
              value={editor.route}
              onChange={(event) =>
                setEditor({
                  ...editor,
                  route:
                    event.target.value,
                })
              }
            >
              <option value="PO">
                경구 · PO
              </option>
              <option value="SL">
                설하 · SL
              </option>
              <option value="IV">
                정맥 · IV
              </option>
              <option value="SC">
                피하 · SC
              </option>
              <option value="IM">
                근육 · IM
              </option>
            </select>
          </label>

          <label>
            복약 지시
            <input
              value={
                editor.instructions
              }
              onChange={(event) =>
                setEditor({
                  ...editor,
                  instructions:
                    event.target.value,
                })
              }
              placeholder="예: 아침 식후 복용"
            />
          </label>

          <div className="medication-editor-actions">
            <button
              className="secondary"
              onClick={resetEditor}
              disabled={saving}
              type="button"
            >
              취소
            </button>

            <button
              className="primary"
              disabled={saving}
              type="submit"
            >
              {saving ? (
                <LoaderCircle
                  className="spin"
                  size={13}
                  strokeWidth={1.8}
                />
              ) : editingItemId !== null ? (
                <Pencil
                  size={13}
                  strokeWidth={1.8}
                />
              ) : (
                <Plus
                  size={13}
                  strokeWidth={1.8}
                />
              )}

              {editingItemId !== null
                ? "처방 수정"
                : "처방 추가"}
            </button>
          </div>
        </form>
      )}

      <div className="prescription-draft-heading">
        <strong>처방 초안</strong>

        <span>
          {detail?.items.length ?? 0}개
        </span>
      </div>

      {detailLoading ? (
        <div className="prescription-loading">
          <LoaderCircle
            className="spin"
            size={15}
            strokeWidth={1.8}
          />
          처방을 불러오는 중입니다.
        </div>
      ) : (
        <div className="prescription-items">
          {detail?.items.map((item) => (
            <article
              className="prescription-item"
              key={item.id}
            >
              <div>
                <span>
                  <strong>
                    {item.medication?.name ??
                      `약품 #${item.medicationId}`}
                  </strong>

                  <small>
                    {item.doseValue ?? "-"}
                    {item.doseUnit} · 1일{" "}
                    {item.frequencyPerDay ??
                      "-"}
                    회 ·{" "}
                    {item.durationDays ?? "-"}
                    일
                  </small>

                  <small>
                    {item.route || "경로 미입력"}
                    {item.instructions
                      ? ` · ${item.instructions}`
                      : ""}
                  </small>
                </span>

                {canEdit && (
                  <div>
                    <button
                      onClick={() =>
                        handleStartEdit(
                          item,
                        )
                      }
                      disabled={saving}
                      type="button"
                      aria-label="처방 약품 수정"
                    >
                      <Pencil
                        size={13}
                        strokeWidth={1.8}
                      />
                    </button>

                    <button
                      className="delete"
                      onClick={() =>
                        void handleDeleteItem(
                          item.id,
                        )
                      }
                      disabled={saving}
                      type="button"
                      aria-label="처방 약품 삭제"
                    >
                      <Trash2
                        size={13}
                        strokeWidth={1.8}
                      />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}

          {(!detail ||
            detail.items.length === 0) && (
            <div className="prescription-empty">
              처방 약품을 선택해 추가해주세요.
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="prescription-notes">
          <label htmlFor="prescription-notes">
            처방 메모
          </label>

          <textarea
            id="prescription-notes"
            value={prescriptionNotes}
            onChange={(event) =>
              setPrescriptionNotes(
                event.target.value,
              )
            }
            placeholder="처방 관련 참고사항"
            disabled={!canEdit}
            maxLength={1000}
          />

          {canEdit && (
            <button
              className="secondary"
              onClick={() =>
                void handleSaveNotes()
              }
              disabled={saving}
              type="button"
            >
              메모 저장
            </button>
          )}
        </div>
      )}

      {durMessage && (
        <div className="dur-success">
          <CheckCircle2
            size={14}
            strokeWidth={1.8}
          />
          {durMessage}
        </div>
      )}

      {detail && (
        <div className="prescription-final-actions">
          <button
            className="secondary"
            onClick={() =>
              void handleDurCheck()
            }
            disabled={
              durLoading ||
              detail.items.length === 0 ||
              activePrescription?.status ===
                "CANCELED"
            }
            type="button"
          >
            {durLoading ? (
              <LoaderCircle
                className="spin"
                size={14}
                strokeWidth={1.8}
              />
            ) : (
              <ShieldCheck
                size={14}
                strokeWidth={1.8}
              />
            )}
            DUR 검사
          </button>

          {activePrescription?.status ===
            "DRAFT" && (
            <button
              className="primary"
              type="button"
              disabled
              title="서명 파일과 재인증 API 연결 후 활성화됩니다."
            >
              전자서명 예정
            </button>
          )}

          {activePrescription?.status ===
            "SIGNED" && (
            <button
              className="danger-outline"
              onClick={() =>
                setShowCancelForm(true)
              }
              type="button"
            >
              처방 취소
            </button>
          )}
        </div>
      )}

      {showCancelForm &&
        activePrescription?.status ===
          "SIGNED" && (
          <div className="prescription-cancel-form">
            <label htmlFor="prescription-cancel-reason">
              처방 취소 사유
            </label>

            <textarea
              id="prescription-cancel-reason"
              value={cancelReason}
              onChange={(event) =>
                setCancelReason(
                  event.target.value,
                )
              }
              placeholder="처방 취소 사유를 입력하세요."
              maxLength={500}
            />

            <div>
              <button
                className="secondary"
                onClick={() => {
                  setShowCancelForm(false);
                  setCancelReason("");
                }}
                disabled={canceling}
                type="button"
              >
                돌아가기
              </button>

              <button
                className="danger"
                onClick={() =>
                  void handleCancelPrescription()
                }
                disabled={
                  canceling ||
                  !cancelReason.trim()
                }
                type="button"
              >
                {canceling
                  ? "처리 중…"
                  : "취소 확정"}
              </button>
            </div>
          </div>
        )}

      {activePrescription?.status ===
        "CANCELED" && (
        <div className="prescription-cancel-result">
          <strong>취소 사유</strong>
          <p>
            {activePrescription.cancelReason ||
              "취소 사유 없음"}
          </p>
          <time>
            {formatPrescriptionDate(
              activePrescription.canceledAt,
            )}
          </time>
        </div>
      )}
    </div>
  );
}