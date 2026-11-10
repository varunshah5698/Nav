import { useStore } from "./store";
import type { SharedPayload } from "./types";

/** Serialize exactly the data a workspace owns, never account-level exports. */
export function serializeWorkspace(workspaceId: string): string {
  const s = useStore.getState();
  const payload: SharedPayload = {
    nodes: s.nodes.filter((x) => x.workspaceId === workspaceId),
    edges: s.edges.filter((x) => x.workspaceId === workspaceId),
    sources: s.sources.filter((x) => x.workspaceId === workspaceId),
    agents: s.agents.filter((x) => x.workspaceId === workspaceId),
    experiments: s.experiments.filter((x) => x.workspaceId === workspaceId),
    memories: s.memories.filter((x) => x.workspaceId === workspaceId),
    activities: s.activities.filter((x) => x.workspaceId === workspaceId),
  };
  return JSON.stringify(payload);
}

export function parseSharedPayload(raw: string): SharedPayload | null {
  try {
    const data = JSON.parse(raw) as Partial<SharedPayload>;
    const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
    return {
      nodes: arr(data.nodes),
      edges: arr(data.edges),
      sources: arr(data.sources),
      agents: arr(data.agents),
      experiments: arr(data.experiments),
      memories: arr(data.memories),
      activities: arr(data.activities),
    };
  } catch {
    return null;
  }
}
