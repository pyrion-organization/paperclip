import { useCallback, useEffect, useMemo } from "react";
import type { Agent } from "@paperclipai/shared";
import {
  AGENT_ORDER_UPDATED_EVENT,
  getAgentOrderStorageKey,
  readAgentOrder,
  sortAgentsByStoredOrder,
  writeAgentOrder,
} from "../lib/agent-order";
import { reconcileOrderedIds, useOrderedIdsOverride } from "../lib/ordered-ids";

type UseAgentOrderParams = {
  agents: Agent[];
  companyId: string | null | undefined;
  userId: string | null | undefined;
};

type AgentOrderUpdatedDetail = {
  storageKey: string;
  orderedIds: string[];
};

function buildOrderIds(agents: Agent[], orderedIds: string[]) {
  return sortAgentsByStoredOrder(agents, orderedIds).map((agent) => agent.id);
}

export function useAgentOrder({ agents, companyId, userId }: UseAgentOrderParams) {
  const storageKey = useMemo(() => {
    if (!companyId) return null;
    return getAgentOrderStorageKey(companyId, userId);
  }, [companyId, userId]);

  const orderedIdsSource = `${storageKey ?? ""}:${agents.map((agent) => agent.id).join("|")}`;
  const persistedOrderedIds = useMemo(
    () => storageKey
      ? buildOrderIds(agents, readAgentOrder(storageKey))
      : agents.map((agent) => agent.id),
    [agents, storageKey],
  );
  const { orderedIds, applyOverride } = useOrderedIdsOverride(orderedIdsSource, persistedOrderedIds);

  useEffect(() => {
    if (!storageKey) return;

    const syncFromIds = (ids: string[]) => {
      applyOverride(buildOrderIds(agents, ids));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      syncFromIds(readAgentOrder(storageKey));
    };
    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<AgentOrderUpdatedDetail>).detail;
      if (!detail || detail.storageKey !== storageKey) return;
      syncFromIds(detail.orderedIds);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(AGENT_ORDER_UPDATED_EVENT, onCustomEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AGENT_ORDER_UPDATED_EVENT, onCustomEvent);
    };
  }, [agents, applyOverride, storageKey]);

  const orderedAgents = useMemo(
    () => sortAgentsByStoredOrder(agents, orderedIds),
    [agents, orderedIds],
  );

  const persistOrder = useCallback(
    (ids: string[]) => {
      const filtered = reconcileOrderedIds(
        ids,
        sortAgentsByStoredOrder(agents, []).map((agent) => agent.id),
      );

      applyOverride(filtered);
      if (storageKey) {
        writeAgentOrder(storageKey, filtered);
      }
    },
    [agents, applyOverride, storageKey],
  );

  return {
    orderedAgents,
    orderedIds,
    persistOrder,
  };
}
