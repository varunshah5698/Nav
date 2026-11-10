import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useStore } from "./store";

// Convex caps one document at 1 MiB; leave headroom.
const MAX_BYTES = 900_000;

function serialize() {
  const s = useStore.getState();
  return JSON.stringify({
    workspaces: s.workspaces,
    memberships: s.memberships,
    activeWs: s.activeWs,
    nodes: s.nodes,
    edges: s.edges,
    sources: s.sources,
    agents: s.agents,
    experiments: s.experiments,
    memories: s.memories,
    activities: s.activities,
    invites: s.invites,
    exports: s.exports,
    searchLogs: s.searchLogs,
  });
}

let flushNow: (() => Promise<void>) | null = null;
/** Push pending edits immediately (await before sign-out). */
export async function flushCloud() {
  await flushNow?.();
}

/**
 * Binds the local store to the Convex-authenticated user.
 * - never runs before Convex Auth resolves
 * - wipes cached account data on sign-out
 * - loads only snapshots whose server-side userId matches the session
 */
export function useCloudSync() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const remote = useQuery(api.snapshots.get, isAuthenticated ? {} : "skip");
  const save = useMutation(api.snapshots.save);
  const ownerRef = useRef<string | null>(null);
  const hydratedRef = useRef<string | null>(null);

  // Signed out: drop cached data so a shared browser can't show it again.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    ownerRef.current = null;
    hydratedRef.current = null;
    useStore.getState().clearSession();
  }, [isLoading, isAuthenticated]);

  // Identity resolved: reset the store to this account only.
  useEffect(() => {
    if (!me || ownerRef.current === me.id) return;
    ownerRef.current = me.id;
    hydratedRef.current = null;
    useStore.getState().startSession({
      id: me.id,
      name: me.name,
      email: me.email,
      image: me.image,
      createdAt: new Date().toISOString(),
    });
  }, [me]);

  // Hydrate after the authenticated snapshot query settles.
  useEffect(() => {
    if (!me || remote === undefined || hydratedRef.current === me.id) return;
    // Defensive: never apply a snapshot the server says belongs to someone else.
    if (remote && remote.userId !== me.id) return;
    hydratedRef.current = me.id;
    if (remote) useStore.getState().loadSnapshot(remote.payload);
    else useStore.getState().seedFor(me.id);
  }, [me, remote]);

  // Debounced pushes, only while authenticated and hydrated.
  useEffect(() => {
    if (!me || !isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = async () => {
      if (hydratedRef.current !== me.id) return;
      const payload = serialize();
      if (payload.length > MAX_BYTES) {
        console.warn(`Convex sync skipped: snapshot is ${payload.length} bytes (> ${MAX_BYTES}).`);
        return;
      }
      try {
        await save({ payload });
      } catch (err) {
        console.warn("Convex save failed; local data is unchanged.", err);
      }
    };
    flushNow = flush;

    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s === prev || !s.cloudReady || s.sessionUserId !== me.id) return;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 800);
    });

    // The first seed can land in the same commit as this effect; persist it
    // even if no later mutation triggers the subscription.
    const current = useStore.getState();
    if (current.cloudReady && current.sessionUserId === me.id) {
      timer = setTimeout(() => void flush(), 300);
    }

    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    const flushBound = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushBound);

    return () => {
      flushNow = null;
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushBound);
    };
  }, [me, isAuthenticated, save]);
}
