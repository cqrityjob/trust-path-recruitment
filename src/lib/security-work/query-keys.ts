// Identity is part of every key. Workspace content must never be reused as
// placeholder data when identity or professional context changes.
export const securityWorkKeys = {
  all: ["security-work"] as const,
  entry: (userId: string) => ["security-work", userId, "entry"] as const,
  workspace: (userId: string, workspaceId: string) =>
    ["security-work", userId, workspaceId] as const,
  snapshot: (userId: string, workspaceId: string) =>
    ["security-work", userId, workspaceId, "snapshot"] as const,
  items: (userId: string, workspaceId: string, sourceId?: string) =>
    ["security-work", userId, workspaceId, "items", sourceId ?? "all"] as const,
  history: (userId: string, workspaceId: string, itemId: string) =>
    ["security-work", userId, workspaceId, "history", itemId] as const,
};
