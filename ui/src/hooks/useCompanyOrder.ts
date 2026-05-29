import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Company } from "@paperclipai/shared";
import { sidebarPreferencesApi } from "../api/sidebarPreferences";
import { queryKeys } from "../lib/queryKeys";
import { reconcileOrderedIds, useOrderedIdsOverride } from "../lib/ordered-ids";

function sortCompaniesByOrder(companies: Company[], orderedIds: string[]): Company[] {
  if (companies.length === 0) return [];
  if (orderedIds.length === 0) return companies;

  const byId = new Map(companies.map((company) => [company.id, company]));
  const sorted: Company[] = [];

  for (const id of orderedIds) {
    const company = byId.get(id);
    if (!company) continue;
    sorted.push(company);
    byId.delete(id);
  }
  for (const company of byId.values()) {
    sorted.push(company);
  }
  return sorted;
}

function buildOrderIds(companies: Company[], orderedIds: string[]) {
  return sortCompaniesByOrder(companies, orderedIds).map((company) => company.id);
}

type UseCompanyOrderParams = {
  companies: Company[];
  userId: string | null | undefined;
};

export function useCompanyOrder({ companies, userId }: UseCompanyOrderParams) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => queryKeys.sidebarPreferences.companyOrder(userId ?? "__anon__"),
    [userId],
  );

  const { data } = useQuery({
    queryKey,
    queryFn: () => sidebarPreferencesApi.getCompanyOrder(),
    enabled: Boolean(userId),
  });

  const orderedIdsSource = `${companies.map((company) => company.id).join("|")}:${data?.orderedIds?.join("|") ?? ""}`;
  const persistedOrderedIds = useMemo(
    () => buildOrderIds(companies, data?.orderedIds ?? []),
    [companies, data?.orderedIds],
  );
  const { orderedIds, applyOverride } = useOrderedIdsOverride(orderedIdsSource, persistedOrderedIds);

  const mutation = useMutation({
    mutationFn: (nextIds: string[]) => sidebarPreferencesApi.updateCompanyOrder({ orderedIds: nextIds }),
    onSuccess: (preference) => {
      queryClient.setQueryData(queryKey, preference);
    },
  });

  const orderedCompanies = useMemo(
    () => sortCompaniesByOrder(companies, orderedIds),
    [companies, orderedIds],
  );

  const persistOrder = useCallback(
    (ids: string[]) => {
      const filtered = reconcileOrderedIds(ids, companies.map((company) => company.id));

      applyOverride(filtered);
      if (!userId) return;

      queryClient.setQueryData(queryKey, (current: { orderedIds?: string[]; updatedAt?: Date | null } | undefined) => ({
        orderedIds: filtered,
        updatedAt: current?.updatedAt ?? null,
      }));
      mutation.mutate(filtered);
    },
    [applyOverride, companies, mutation, queryClient, queryKey, userId],
  );

  return {
    orderedCompanies,
    orderedIds,
    persistOrder,
  };
}
