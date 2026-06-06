import { unprocessable } from "../errors.js";

function isGitHubDotCom(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "github.com" || h === "www.github.com";
}

function allowedEnterpriseHosts() {
  return new Set(
    (process.env.PAPERCLIP_GITHUB_ENTERPRISE_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function assertAllowedGitHubHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (isGitHubDotCom(normalized) || allowedEnterpriseHosts().has(normalized)) return;
  throw unprocessable("GitHub source URL host is not allowed");
}

export function gitHubApiBase(hostname: string) {
  assertAllowedGitHubHostname(hostname);
  return isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
}

export function resolveRawGitHubUrl(hostname: string, owner: string, repo: string, ref: string, filePath: string) {
  assertAllowedGitHubHostname(hostname);
  const p = filePath.replace(/^\/+/, "");
  return isGitHubDotCom(hostname)
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}

export async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw unprocessable(`Could not connect to ${new URL(url).hostname} — ensure the URL points to a GitHub or GitHub Enterprise instance`);
  }
}
