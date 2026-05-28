import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Company } from "@paperclipai/shared";
import { sidebarPreferencesApi } from "../api/sidebarPreferences";
import { queryKeys } from "../lib/queryKeys";

function areEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

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
  const [orderedIdsOverride, setOrderedIdsOverride] = useState<{
    source: string;
    value: string[];
  } | null>(null);
  const orderedIds =
    orderedIdsOverride?.source === orderedIdsSource
      ? orderedIdsOverride.value
      : persistedOrderedIds;

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
      const idSet = new Set(companies.map((company) => company.id));
      const filtered = ids.filter((id) => idSet.has(id));
      const filteredSet = new Set(filtered);
      for (const company of companies) {
        if (filteredSet.has(company.id)) continue;
        filtered.push(company.id);
        filteredSet.add(company.id);
      }

      setOrderedIdsOverride((current) =>
        current?.source === orderedIdsSource && areEqual(current.value, filtered)
          ? current
          : { source: orderedIdsSource, value: filtered },
      );
      if (!userId) return;

      queryClient.setQueryData(queryKey, (current: { orderedIds?: string[]; updatedAt?: Date | null } | undefined) => ({
        orderedIds: filtered,
        updatedAt: current?.updatedAt ?? null,
      }));
      mutation.mutate(filtered);
    },
    [companies, mutation, orderedIdsSource, queryClient, queryKey, userId],
  );

  return {
    orderedCompanies,
    orderedIds,
    persistOrder,
  };
}
