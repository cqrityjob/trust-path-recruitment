// A per-user navigation hint only. Callers must first fetch the current RLS-filtered list.
export const workspacePreferenceKey = (userId: string) => `sw:last-workspace:${userId}`;
export function rememberedWorkspace(userId: string): string | null {
  try {
    return localStorage.getItem(workspacePreferenceKey(userId));
  } catch {
    return null;
  }
}
export function rememberWorkspace(userId: string, workspaceId: string) {
  try {
    localStorage.setItem(workspacePreferenceKey(userId), workspaceId);
  } catch {
    // Storage may be blocked. Explicit workspace selection still works.
  }
}
export function entryWorkspace(workspaces: readonly { id: string }[], remembered: string | null) {
  if (workspaces.length === 1) return workspaces[0].id;
  return workspaces.find((workspace) => workspace.id === remembered)?.id ?? null;
}
