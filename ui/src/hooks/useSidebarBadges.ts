import { useQuery } from "@tanstack/react-query";
import type { SidebarBadges } from "@paperclipai/shared";

import { ApiError } from "../api/client";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { queryKeys } from "../lib/queryKeys";

const emptySidebarBadges: SidebarBadges = {
  inbox: 0,
  approvals: 0,
  failedRuns: 0,
  joinRequests: 0,
};

export function useSidebarBadges(companyId: string | null | undefined): SidebarBadges {
  const { data } = useQuery({
    queryKey: companyId ? queryKeys.sidebarBadges(companyId) : ["sidebar-badges", "__disabled__"] as const,
    queryFn: async () => {
      try {
        return await sidebarBadgesApi.get(companyId!);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return emptySidebarBadges;
        }
        throw error;
      }
    },
    enabled: Boolean(companyId),
    retry: false,
    refetchInterval: 15_000,
  });

  return data ?? emptySidebarBadges;
}
