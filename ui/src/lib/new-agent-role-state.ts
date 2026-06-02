export function isLoadedFirstAgentList(agents: unknown[] | undefined): boolean {
  return Array.isArray(agents) && agents.length === 0;
}
