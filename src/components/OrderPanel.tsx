import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  cancelExaminationOrder,
  createExaminationOrder,
  getExaminationOrders,
  getExaminationTypes,
  getOrderExaminations,
  scheduleExaminationOrder,
  updateExaminationOrder,
} from "../api/client";

import type {
  ExaminationOrderSummary,
  ExaminationExecutionSummary,
  ExaminationTypeSummary,
} from "../types";

import {
  Ban,
  CalendarPlus,
  ClipboardPlus,
  History,
  LoaderCircle,
  Send,
  X,
} from "lucide-react";

interface OrderPanelProps {
  patientId?: number;
  encounterId: number | null;
}

const statusLabel: Record<
  ExaminationOrderSummary["status"],
  string
> = {
  ORDERED: "접수",
  SCHEDULED: "예약",
  COMPLETED: "완료",
  CANCELED: "취소",
};

function formatOrderDate(value: string) {
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

export function OrderPanel({
  patientId,
  encounterId,
}: OrderPanelProps) {
  const [examinationTypes, setExaminationTypes] =
    useState<ExaminationTypeSummary[]>([]);

  const [orders, setOrders] =
    useState<ExaminationOrderSummary[]>([]);

  const [selectedTypeId, setSelectedTypeId] =
    useState("");

  const [clinicalNote, setClinicalNote] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [cancelTargetId, setCancelTargetId] =
    useState<number | null>(null);

  const [cancelReason, setCancelReason] =
    useState("");

  const [canceling, setCanceling] =
    useState(false);

  const [scheduleTargetId, setScheduleTargetId] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [updating, setUpdating] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editPriority, setEditPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [editNote, setEditNote] = useState("");
  const [executionsByOrder, setExecutionsByOrder] = useState<Record<number, ExaminationExecutionSummary[]>>({});
  const [executionOpenId, setExecutionOpenId] = useState<number | null>(null);

  const loadOrderData = async (
    selectedPatientId: number,
  ) => {
    const [types, nextOrders] =
      await Promise.all([
        getExaminationTypes(),
        getExaminationOrders(selectedPatientId),
      ]);

    setExaminationTypes(types);
    setOrders(nextOrders);

    setSelectedTypeId((current) => {
      const currentExists = types.some(
        (item) =>
          String(item.id) === current,
      );

      if (currentExists) {
        return current;
      }

      return types[0]
        ? String(types[0].id)
        : "";
    });
  };

  useEffect(() => {
    setCancelTargetId(null);
    setCancelReason("");
    setCanceling(false);
    setScheduleTargetId(null);
    setScheduledAt("");
    setScheduleLocation("");
    setExecutionsByOrder({});
    setExecutionOpenId(null);
    setEditTargetId(null);
    setEditPriority('NORMAL');
    setEditNote("");
    setClinicalNote("");
    setError("");

    if (!patientId) {
      setOrders([]);
      setExaminationTypes([]);
      setSelectedTypeId("");
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);

    Promise.all([
      getExaminationTypes(),
      getExaminationOrders(patientId),
    ])
      .then(([types, nextOrders]) => {
        if (!active) {
          return;
        }

        setExaminationTypes(types);
        setOrders(nextOrders);

        setSelectedTypeId(
          types[0]
            ? String(types[0].id)
            : "",
        );
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setExaminationTypes([]);
        setOrders([]);

        setError(
          requestError instanceof Error
            ? requestError.message
            : "검사 오더를 불러오지 못했습니다.",
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

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!patientId) {
      setError("환자 정보가 없습니다.");
      return;
    }

    if (!encounterId) {
      setError(
        "검사 오더를 등록할 진료 정보를 찾지 못했습니다.",
      );
      return;
    }

    const examinationTypeId =
      Number(selectedTypeId);

    if (
      !Number.isFinite(examinationTypeId) ||
      examinationTypeId <= 0
    ) {
      setError("검사 종류를 선택해주세요.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await createExaminationOrder(
        encounterId,
        examinationTypeId,
        clinicalNote,
      );

      await loadOrderData(patientId);

      setClinicalNote("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "검사 오더를 등록하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCancel = (
    orderId: number,
  ) => {
    setCancelTargetId(orderId);
    setCancelReason("");
    setError("");
  };

  const handleCloseCancel = () => {
    if (canceling) {
      return;
    }

    setCancelTargetId(null);
    setCancelReason("");
    setError("");
  };

  const handleCancelOrder = async () => {
    if (
      !patientId ||
      cancelTargetId === null ||
      canceling
    ) {
      return;
    }

    const reason = cancelReason.trim();

    if (!reason) {
      setError(
        "오더 취소 사유를 입력해주세요.",
      );
      return;
    }

    setCanceling(true);
    setError("");

    try {
      await cancelExaminationOrder(
        cancelTargetId,
        reason,
      );

      await loadOrderData(patientId);

      setCancelTargetId(null);
      setCancelReason("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "검사 오더를 취소하지 못했습니다.",
      );
    } finally {
      setCanceling(false);
    }
  };

  const getType = (typeId: number) =>
    examinationTypes.find(
      (item) => item.id === typeId,
    );

  const handleScheduleOrder = async () => {
    if (!patientId || !scheduleTargetId || !scheduledAt || !scheduleLocation.trim()) return;
    setUpdating(true);
    setError("");
    try {
      await scheduleExaminationOrder(scheduleTargetId, new Date(scheduledAt).toISOString(), scheduleLocation);
      await loadOrderData(patientId);
      setScheduleTargetId(null);
      setScheduledAt("");
      setScheduleLocation("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검사 일정을 등록하지 못했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  const openEditOrder = (order: ExaminationOrderSummary) => {
    setEditTargetId(order.id);
    setEditPriority(order.priority);
    setEditNote(order.clinicalNote);
  };

  const handleEditOrder = async () => {
    if (!patientId || !editTargetId) return;
    setUpdating(true);
    setError("");
    try {
      await updateExaminationOrder(editTargetId, { priority: editPriority, clinicalNote: editNote });
      await loadOrderData(patientId);
      setEditTargetId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검사 오더를 수정하지 못했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  const toggleExecutions = async (orderId: number) => {
    if (executionOpenId === orderId) {
      setExecutionOpenId(null);
      return;
    }
    setExecutionOpenId(orderId);
    if (executionsByOrder[orderId]) return;
    try {
      const items = await getOrderExaminations(orderId);
      setExecutionsByOrder((current) => ({ ...current, [orderId]: items }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검사 수행 이력을 불러오지 못했습니다.");
    }
  };

  return (
    <div className="order-panel">
      <div className="order-panel-heading">
        <div>
          <strong>검사 오더</strong>
          <span>{orders.length}건</span>
        </div>

        <small>
          선택한 환자의 검사 요청을 조회하고
          등록합니다.
        </small>
      </div>

      {error && (
        <div
          className="order-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <form
        className="order-form"
        onSubmit={handleSubmit}
      >
        <label htmlFor="examination-type">
          검사 종류
        </label>

        <select
          id="examination-type"
          value={selectedTypeId}
          onChange={(event) =>
            setSelectedTypeId(
              event.target.value,
            )
          }
          disabled={
            loading ||
            saving ||
            canceling ||
            examinationTypes.length === 0
          }
          required
        >
          {examinationTypes.length === 0 && (
            <option value="">
              선택 가능한 검사가 없습니다
            </option>
          )}

          {examinationTypes.map((item) => (
            <option
              key={item.id}
              value={item.id}
            >
              {item.name}
              {item.modality
                ? ` · ${item.modality}`
                : ""}
            </option>
          ))}
        </select>

        <label htmlFor="order-note">
          참고사항 <span>선택</span>
        </label>

        <textarea
          id="order-note"
          value={clinicalNote}
          onChange={(event) =>
            setClinicalNote(
              event.target.value,
            )
          }
          placeholder="검사실에 전달할 내용이 있을 때만 입력하세요."
          maxLength={1000}
          disabled={saving || canceling}
        />

        {!encounterId && !loading && (
          <p className="order-encounter-warning">
            현재 환자의 진료 ID를 찾지 못해
            오더 등록이 비활성화되었습니다.
          </p>
        )}

        <div className="order-form-footer">
          <span>
            {clinicalNote.length}/1000
          </span>

          <button
            className="primary"
            disabled={
              saving ||
              loading ||
              canceling ||
              !encounterId ||
              !selectedTypeId
            }
            type="submit"
          >
            {saving ? (
              <LoaderCircle
                className="spin"
                size={14}
                strokeWidth={1.8}
              />
            ) : (
              <Send
                size={14}
                strokeWidth={1.8}
              />
            )}

            {saving
              ? "등록 중…"
              : "오더 등록"}
          </button>
        </div>
      </form>

      <div className="order-list-heading">
        <strong>등록된 오더</strong>
      </div>

      {loading ? (
        <div className="order-loading">
          <LoaderCircle
            className="spin"
            size={16}
            strokeWidth={1.8}
          />
          검사 오더를 불러오는 중입니다.
        </div>
      ) : (
        <div className="order-list">
          {orders.map((order) => {
            const examinationType =
              getType(
                order.examinationTypeId,
              );

            const canCancel =
              order.status === "ORDERED" ||
              order.status === "SCHEDULED";

            const isCancelingThisOrder =
              cancelTargetId === order.id;

            return (
              <article
                className={`order-card ${
                  order.status === "CANCELED"
                    ? "is-canceled"
                    : ""
                }`}
                key={order.id}
              >
                <div className="order-card-header">
                  <ClipboardPlus
                    size={16}
                    strokeWidth={1.8}
                  />

                  <span>
                    <strong>
                      {examinationType?.name ??
                        `검사 #${order.examinationTypeId}`}
                    </strong>

                    <small>
                      {examinationType?.modality ||
                        examinationType?.category ||
                        "검사"}
                    </small>
                  </span>

                  <b
                    className={`order-status status-${order.status.toLowerCase()}`}
                  >
                    {statusLabel[order.status]}
                  </b>
                </div>

                <div className="order-card-meta">
                  <span>
                    오더일{" "}
                    {formatOrderDate(
                      order.orderedAt,
                    )}
                  </span>

                  {order.scheduledAt && (
                    <span>
                      예약일{" "}
                      {formatOrderDate(
                        order.scheduledAt,
                      )}
                    </span>
                  )}
                </div>

                {order.clinicalNote && (
                  <p>{order.clinicalNote}</p>
                )}

                {order.status ===
                  "CANCELED" && (
                  <div className="order-cancel-result">
                    <strong>취소 사유</strong>

                    <p>
                      {order.cancelReason ||
                        "취소 사유가 기록되지 않았습니다."}
                    </p>

                    {order.canceledAt && (
                      <time>
                        {formatOrderDate(
                          order.canceledAt,
                        )}
                      </time>
                    )}
                  </div>
                )}

                {canCancel &&
                  !isCancelingThisOrder && (
                    <div className="order-card-actions">
                      <button className="secondary" onClick={() => void toggleExecutions(order.id)} type="button"><History size={13} /> 수행 이력</button>
                      <button
                        className="secondary"
                        onClick={() => openEditOrder(order)}
                        disabled={canceling || saving || updating}
                        type="button"
                      >
                        오더 수정
                      </button>
                      {order.status === "ORDERED" && (
                        <button
                          className="secondary"
                          onClick={() => setScheduleTargetId(order.id)}
                          disabled={canceling || saving || updating}
                          type="button"
                        >
                          <CalendarPlus size={13} /> 일정 등록
                        </button>
                      )}
                      <button
                        className="order-cancel-trigger"
                        onClick={() =>
                          handleOpenCancel(
                            order.id,
                          )
                        }
                        disabled={
                          canceling || saving
                        }
                        type="button"
                      >
                        <Ban
                          size={13}
                          strokeWidth={1.8}
                        />
                        오더 취소
                      </button>
                    </div>
                  )}

                {executionOpenId === order.id && (
                  <div className="order-execution-list">
                    {(executionsByOrder[order.id] ?? []).map((execution) => <span key={execution.id}><b>#{execution.id}</b>{execution.performedAt ? formatOrderDate(execution.performedAt) : '수행일 미등록'} · {execution.location || '-'} · {execution.status}</span>)}
                    {executionsByOrder[order.id]?.length === 0 && <span>등록된 검사 수행 이력이 없습니다.</span>}
                    {!executionsByOrder[order.id] && <span>수행 이력을 불러오는 중…</span>}
                  </div>
                )}

                {editTargetId === order.id && (
                  <div className="order-edit-form">
                    <label>우선순위<select value={editPriority} onChange={(event) => setEditPriority(event.target.value as 'NORMAL' | 'URGENT')}><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label>
                    <label>참고사항<textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} maxLength={1000} /></label>
                    <div><button className="secondary" onClick={() => setEditTargetId(null)} disabled={updating} type="button">닫기</button><button className="primary" onClick={() => void handleEditOrder()} disabled={updating} type="button">{updating ? '저장 중…' : '수정 저장'}</button></div>
                  </div>
                )}
                {!canCancel && (
                  <div className="order-card-actions"><button className="secondary" onClick={() => void toggleExecutions(order.id)} type="button"><History size={13} /> 수행 이력</button></div>
                )}

                {order.status === "ORDERED" && scheduleTargetId === order.id && (
                  <div className="order-schedule-form">
                    <label>검사 일시<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
                    <label>검사 장소<input value={scheduleLocation} onChange={(event) => setScheduleLocation(event.target.value)} placeholder="예: 영상의학과 CT실" /></label>
                    <div>
                      <button className="secondary" onClick={() => setScheduleTargetId(null)} disabled={updating} type="button">닫기</button>
                      <button className="primary" onClick={() => void handleScheduleOrder()} disabled={updating || !scheduledAt || !scheduleLocation.trim()} type="button">{updating ? "등록 중…" : "일정 저장"}</button>
                    </div>
                  </div>
                )}

                {canCancel &&
                  isCancelingThisOrder && (
                    <div className="order-cancel-form">
                      <label
                        htmlFor={`cancel-reason-${order.id}`}
                      >
                        취소 사유
                      </label>

                      <textarea
                        id={`cancel-reason-${order.id}`}
                        value={cancelReason}
                        onChange={(event) =>
                          setCancelReason(
                            event.target.value,
                          )
                        }
                        placeholder="오입력, 중복 오더 등 취소 사유를 입력하세요."
                        maxLength={500}
                        disabled={canceling}
                        autoFocus
                      />

                      <span className="order-cancel-counter">
                        {cancelReason.length}/500
                      </span>

                      <div>
                        <button
                          className="secondary"
                          onClick={
                            handleCloseCancel
                          }
                          disabled={canceling}
                          type="button"
                        >
                          <X
                            size={13}
                            strokeWidth={1.8}
                          />
                          돌아가기
                        </button>

                        <button
                          className="danger"
                          onClick={() =>
                            void handleCancelOrder()
                          }
                          disabled={
                            canceling ||
                            !cancelReason.trim()
                          }
                          type="button"
                        >
                          {canceling ? (
                            <LoaderCircle
                              className="spin"
                              size={13}
                              strokeWidth={1.8}
                            />
                          ) : (
                            <Ban
                              size={13}
                              strokeWidth={1.8}
                            />
                          )}

                          {canceling
                            ? "취소 처리 중…"
                            : "취소 확정"}
                        </button>
                      </div>
                    </div>
                  )}
              </article>
            );
          })}

          {orders.length === 0 && (
            <div className="order-empty">
              등록된 검사 오더가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
