import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent } from "@paperclipai/shared";
import {
  AGENT_ORDER_UPDATED_EVENT,
  getAgentOrderStorageKey,
  readAgentOrder,
  sortAgentsByStoredOrder,
  writeAgentOrder,
} from "../lib/agent-order";

type UseAgentOrderParams = {
  agents: Agent[];
  companyId: string | null | undefined;
  userId: string | null | undefined;
};

type AgentOrderUpdatedDetail = {
  storageKey: string;
  orderedIds: string[];
};

function areEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

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
  const [orderedIdsOverride, setOrderedIdsOverride] = useState<{
    source: string;
    value: string[];
  } | null>(null);
  const orderedIds =
    orderedIdsOverride?.source === orderedIdsSource
      ? orderedIdsOverride.value
      : persistedOrderedIds;

  useEffect(() => {
    if (!storageKey) return;

    const syncFromIds = (ids: string[]) => {
      const nextIds = buildOrderIds(agents, ids);
      setOrderedIdsOverride((current) =>
        current?.source === orderedIdsSource && areEqual(current.value, nextIds)
          ? current
          : { source: orderedIdsSource, value: nextIds },
      );
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
  }, [agents, orderedIdsSource, storageKey]);

  const orderedAgents = useMemo(
    () => sortAgentsByStoredOrder(agents, orderedIds),
    [agents, orderedIds],
  );

  const persistOrder = useCallback(
    (ids: string[]) => {
      const idSet = new Set(agents.map((agent) => agent.id));
      const filtered = ids.filter((id) => idSet.has(id));
      const filteredSet = new Set(filtered);
      for (const agent of sortAgentsByStoredOrder(agents, [])) {
        if (filteredSet.has(agent.id)) continue;
        filtered.push(agent.id);
        filteredSet.add(agent.id);
      }

      setOrderedIdsOverride((current) =>
        current?.source === orderedIdsSource && areEqual(current.value, filtered)
          ? current
          : { source: orderedIdsSource, value: filtered },
      );
      if (storageKey) {
        writeAgentOrder(storageKey, filtered);
      }
    },
    [agents, orderedIdsSource, storageKey],
  );

  return {
    orderedAgents,
    orderedIds,
    persistOrder,
  };
}
