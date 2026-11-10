import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useStore } from "./store";
import { parseSharedPayload, serializeWorkspace } from "./sharedWorkspace";
import type { SharedMember, SharedPayload } from "./types";

const SAVE_DELAY = 900;
const MAX_PAYLOAD = 900_000;

/**
 * Keeps shared workspaces in step with Convex. Personal demo workspaces stay in
 * the per-user snapshot; every non-demo workspace is registered, read and
 * written through the shared model.
 */
export function useWorkspaceSync() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const remote = useQuery(api.workspaceSync.mine, isAuthenticated && me ? {} : "skip");
  const ensure = useMutation(api.workspaceSync.ensure);
  const save = useMutation(api.workspaceSync.save);
  const cloudReady = useStore((s) => s.cloudReady);
  const sessionUserId = useStore((s) => s.sessionUserId);

  const applying = useRef(false);
  const applied = useRef(new Map<string, number>());
  const ensured = useRef(new Set<string>());
  const fingerprint = useRef("");
  const hydrated = useRef(false);
  const meId = me?.id ?? null;

  const ensureOwned = useCallback(() => {
    if (!meId) return;
    const s = useStore.getState();
    if (!s.cloudReady || s.sessionUserId !== meId) return;
    for (const workspace of s.workspaces) {
      if (workspace.demo) continue;
      const role = s.memberships.find(
        (m) => m.workspaceId === workspace.id && m.userId === meId,
      )?.role;
      if (role !== "owner" || ensured.current.has(workspace.id)) continue;
      ensured.current.add(workspace.id);
      const payload = serializeWorkspace(workspace.id);
      if (payload.length > MAX_PAYLOAD) {
        console.warn("Shared workspace skipped: payload exceeds 900 KB.");
        continue;
      }
      void ensure({
        workspaceId: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.createdAt,
        payload,
      }).catch((error) => {
        ensured.current.delete(workspace.id);
        console.warn("Could not register shared workspace.", error);
      });
    }
  }, [ensure, meId]);

  useEffect(() => {
    if (!meId) return;
    fingerprint.current = "";
    applied.current.clear();
    ensured.current.clear();
    hydrated.current = false;
    const unsubscribe = useStore.subscribe((s) => {
      if (s.cloudReady && s.sessionUserId === meId) ensureOwned();
    });
    ensureOwned();
    return unsubscribe;
  }, [meId, ensureOwned]);

  useEffect(() => {
    if (!me || !remote || !cloudReady || sessionUserId !== me.id) return;
    ensureOwned();

    const nextFingerprint = [
      ...remote.workspaces.map(
        (w) => `${w.workspaceId}:${w.revision}:${w.updatedBy}:${w.name}:${w.description}`,
      ),
      ...remote.members.map(
        (m) => `${m.workspaceId}:${m.userId}:${m.role}:${m.name}:${m.email}`,
      ),
    ]
      .sort()
      .join("|");
    if (fingerprint.current === nextFingerprint) return;

    const payloads: Record<string, SharedPayload> = {};
    for (const workspace of remote.workspaces) {
      const previous = applied.current.get(workspace.workspaceId);
      const first = previous === undefined;
      if (first || workspace.updatedBy !== me.id) {
        const parsed = parseSharedPayload(workspace.payload);
        if (parsed) payloads[workspace.workspaceId] = parsed;
      }
      applied.current.set(workspace.workspaceId, workspace.revision);
    }

    const members: SharedMember[] = remote.members.map((m) => ({
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      name: m.name,
      email: m.email,
      image: m.image,
    }));

    applying.current = true;
    useStore.getState().applySharedSync({
      workspaces: remote.workspaces.map((w) => ({
        workspaceId: w.workspaceId,
        name: w.name,
        description: w.description,
        ownerId: w.ownerId,
        createdAt: w.createdAt,
      })),
      members,
      payloads,
    });
    fingerprint.current = nextFingerprint;
    hydrated.current = true;
    queueMicrotask(() => {
      applying.current = false;
    });
  }, [remote, me, cloudReady, sessionUserId, ensureOwned]);

  useEffect(() => {
    if (!me || !isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = async () => {
      if (applying.current || !hydrated.current) return;
      const s = useStore.getState();
      if (!s.cloudReady || s.sessionUserId !== me.id) return;
      for (const workspace of s.workspaces) {
        if (workspace.demo) continue;
        const role = s.memberships.find(
          (m) => m.workspaceId === workspace.id && m.userId === me.id,
        )?.role;
        if (role !== "owner" && role !== "editor") continue;
        const payload = serializeWorkspace(workspace.id);
        if (payload.length > MAX_PAYLOAD) {
          console.warn(`Shared workspace ${workspace.name} exceeds the 900 KB sync limit.`);
          continue;
        }
        try {
          await save({
            workspaceId: workspace.id,
            name: workspace.name,
            description: workspace.description,
            payload,
          });
        } catch (error) {
          console.warn("Shared workspace save failed; local data is unchanged.", error);
        }
      }
    };

    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s === prev || !s.cloudReady || s.sessionUserId !== me.id) return;
      if (applying.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), SAVE_DELAY);
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [me, isAuthenticated, save]);
}
