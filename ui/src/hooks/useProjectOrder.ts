import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { sortProjectsByStoredOrder } from "../lib/project-order";
import { queryKeys } from "../lib/queryKeys";

type UseProjectOrderParams = {
  projects: Project[];
  companyId: string | null | undefined;
  userId: string | null | undefined;
};

function areEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildOrderIds(projects: Project[], orderedIds: string[]) {
  return sortProjectsByStoredOrder(projects, orderedIds).map((project) => project.id);
}

export function useProjectOrder({ projects, companyId, userId }: UseProjectOrderParams) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => queryKeys.sidebarPreferences.projectOrder(companyId ?? "__none__", userId ?? "__anon__"),
    [companyId, userId],
  );

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const { sidebarPreferencesApi } = await import("../api/sidebarPreferences");
      return sidebarPreferencesApi.getProjectOrder(companyId!);
    },
    enabled: Boolean(companyId && userId),
  });

  const orderedIdsSource = `${projects.map((project) => project.id).join("|")}:${data?.orderedIds?.join("|") ?? ""}`;
  const persistedOrderedIds = useMemo(
    () => buildOrderIds(projects, data?.orderedIds ?? []),
    [data?.orderedIds, projects],
  );
  const [orderedIdsOverride, setOrderedIdsOverride] = useState<{
    source: string;
    value: string[];
  } | null>(null);
  const orderedIds =
    orderedIdsOverride?.source === orderedIdsSource
      ? orderedIdsOverride.value
      : persistedOrderedIds;

  const mutation = useMutation({
    mutationFn: async (nextIds: string[]) => {
      const { sidebarPreferencesApi } = await import("../api/sidebarPreferences");
      return sidebarPreferencesApi.updateProjectOrder(companyId!, { orderedIds: nextIds });
    },
    onSuccess: (preference) => {
      queryClient.setQueryData(queryKey, preference);
    },
  });

  const orderedProjects = useMemo(
    () => sortProjectsByStoredOrder(projects, orderedIds),
    [projects, orderedIds],
  );

  const persistOrder = useCallback(
    (ids: string[]) => {
      const idSet = new Set(projects.map((project) => project.id));
      const filtered = ids.filter((id) => idSet.has(id));
      const filteredSet = new Set(filtered);
      for (const project of projects) {
        if (filteredSet.has(project.id)) continue;
        filtered.push(project.id);
        filteredSet.add(project.id);
      }

      setOrderedIdsOverride((current) =>
        current?.source === orderedIdsSource && areEqual(current.value, filtered)
          ? current
          : { source: orderedIdsSource, value: filtered },
      );
      if (!companyId || !userId) return;

      queryClient.setQueryData(queryKey, (current: { orderedIds?: string[]; updatedAt?: Date | null } | undefined) => ({
        orderedIds: filtered,
        updatedAt: current?.updatedAt ?? null,
      }));
      mutation.mutate(filtered);
    },
    [companyId, mutation, orderedIdsSource, projects, queryClient, queryKey, userId],
  );

  return {
    orderedProjects,
    orderedIds,
    persistOrder,
  };
}
