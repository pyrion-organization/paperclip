import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { sortProjectsByStoredOrder } from "../lib/project-order";
import { queryKeys } from "../lib/queryKeys";
import { reconcileOrderedIds, useOrderedIdsOverride } from "../lib/ordered-ids";

type UseProjectOrderParams = {
  projects: Project[];
  companyId: string | null | undefined;
  userId: string | null | undefined;
};

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
  const { orderedIds, applyOverride } = useOrderedIdsOverride(orderedIdsSource, persistedOrderedIds);

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
      const filtered = reconcileOrderedIds(ids, projects.map((project) => project.id));

      applyOverride(filtered);
      if (!companyId || !userId) return;

      queryClient.setQueryData(queryKey, (current: { orderedIds?: string[]; updatedAt?: Date | null } | undefined) => ({
        orderedIds: filtered,
        updatedAt: current?.updatedAt ?? null,
      }));
      mutation.mutate(filtered);
    },
    [applyOverride, companyId, mutation, projects, queryClient, queryKey, userId],
  );

  return {
    orderedProjects,
    orderedIds,
    persistOrder,
  };
}
