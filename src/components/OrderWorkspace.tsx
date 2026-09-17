import { useState } from "react";

import { OrderPanel } from "./OrderPanel";
import { PrescriptionPanel } from "./PrescriptionPanel";

interface OrderWorkspaceProps {
  patientId?: number;
  encounterId: number | null;
}

type OrderWorkspaceTab =
  | "검사 오더"
  | "처방 오더";

export function OrderWorkspace({
  patientId,
  encounterId,
}: OrderWorkspaceProps) {
  const [activeTab, setActiveTab] =
    useState<OrderWorkspaceTab>(
      "검사 오더",
    );

  return (
    <div className="order-workspace">
      <div className="order-workspace-tabs">
        <button
          className={
            activeTab === "검사 오더"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("검사 오더")
          }
          type="button"
        >
          검사 오더
        </button>

        <button
          className={
            activeTab === "처방 오더"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("처방 오더")
          }
          type="button"
        >
          처방 오더
        </button>
      </div>

      {activeTab === "검사 오더" ? (
        <OrderPanel
          patientId={patientId}
          encounterId={encounterId}
        />
      ) : (
        <PrescriptionPanel
          patientId={patientId}
          encounterId={encounterId}
        />
      )}
    </div>
  );
}