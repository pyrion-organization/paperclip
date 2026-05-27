import { api } from "./client";

type CurrentBoardAccessRole = "owner" | "admin" | "operator" | "viewer" | "member" | null;

export type CurrentBoardAccess = {
  user: { id: string; email: string | null; name: string | null; image: string | null } | null;
  userId: string;
  isInstanceAdmin: boolean;
  companyIds: string[];
  memberships?: Array<{
    companyId: string;
    membershipRole: CurrentBoardAccessRole;
    status: "pending" | "active" | "suspended" | "archived";
  }>;
  source: string;
  keyId: string | null;
};

export const currentBoardAccessApi = {
  getCurrentBoardAccess: () => api.get<CurrentBoardAccess>("/cli-auth/me"),
};
