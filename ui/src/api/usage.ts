import { api } from "./client";

export interface TimeWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
}

export interface ProviderUsage {
  provider: string;
  plan: string;
  isMock: boolean;
  error?: string;
  windows: TimeWindow[];
}

export interface UsageResponse {
  providers: ProviderUsage[];
}

export const usageApi = {
  getAll: () => api.get<UsageResponse>("/usage"),
};
