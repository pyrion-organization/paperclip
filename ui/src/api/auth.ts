import {
  currentUserProfileSchema,
  type CurrentUserProfile,
  type UpdateCurrentUserProfile,
} from "@paperclipai/shared/validators/access";
import { authSessionApi } from "./auth-session";

type AuthErrorBody =
  | {
    code?: string;
    message?: string;
    error?: string | { code?: string; message?: string };
  }
  | null;

export class AuthApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(message: string, status: number, body: unknown, code: string | null = null) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function extractAuthError(payload: AuthErrorBody, status: number) {
  const nested =
    payload?.error && typeof payload.error === "object"
      ? payload.error
      : null;
  const code =
    typeof nested?.code === "string"
      ? nested.code
      : typeof payload?.code === "string"
        ? payload.code
        : null;
  const message =
    typeof nested?.message === "string" && nested.message.trim().length > 0
      ? nested.message
      : typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : typeof payload?.error === "string" && payload.error.trim().length > 0
          ? payload.error
          : `Request failed: ${status}`;

  return new AuthApiError(message, status, payload, code);
}

async function authPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw extractAuthError(payload as AuthErrorBody, res.status);
  }
  return payload;
}

async function authPatch<T>(path: string, body: Record<string, unknown>, parse: (value: unknown) => T): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw extractAuthError(payload as AuthErrorBody, res.status);
  }
  return parse(payload);
}

export const authApi = {
  ...authSessionApi,

  signInEmail: async (input: { email: string; password: string }) => {
    await authPost("/sign-in/email", input);
  },

  signUpEmail: async (input: { name: string; email: string; password: string }) => {
    await authPost("/sign-up/email", input);
  },

  getProfile: async (): Promise<CurrentUserProfile> => {
    const res = await fetch("/api/auth/profile", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((payload as { error?: string } | null)?.error ?? `Failed to load profile (${res.status})`);
    }
    return currentUserProfileSchema.parse(payload);
  },

  updateProfile: async (input: UpdateCurrentUserProfile): Promise<CurrentUserProfile> =>
    authPatch("/profile", input, (payload) => currentUserProfileSchema.parse(payload)),

  signOut: async () => {
    await authPost("/sign-out", {});
  },
};
