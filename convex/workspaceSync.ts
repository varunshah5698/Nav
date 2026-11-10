import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

const MAX_PAYLOAD = 900_000;
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_WORKSPACES = 50;
const MAX_MEMBERS = 100;

async function membership(ctx: QueryCtx | MutationCtx, workspaceId: string, userId: Id<"users"> | null) {
  if (userId === null) return null;
  return await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();
}

/** Every workspace the signed-in user can access, plus their rosters. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { workspaces: [], members: [] };

    const myMemberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_WORKSPACES);

    const workspaces = [];
    const members = [];
    const userCache = new Map<string, { name: string; email: string; image: string | null }>();

    for (const myMembership of myMemberships) {
      const workspace = await ctx.db
        .query("sharedWorkspaces")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", myMembership.workspaceId))
        .unique();
      if (!workspace) continue;
      workspaces.push({
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        description: workspace.description,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt,
        payload: workspace.payload,
        revision: workspace.revision,
        updatedAt: workspace.updatedAt,
        updatedBy: workspace.updatedBy,
      });

      const roster = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace.workspaceId))
        .take(MAX_MEMBERS);
      for (const row of roster) {
        let profile = userCache.get(row.userId);
        if (!profile) {
          const user = await ctx.db.get(row.userId);
          profile = {
            name: user?.name ?? "Researcher",
            email: user?.email ?? "",
            image: user?.image ?? null,
          };
          userCache.set(row.userId, profile);
        }
        members.push({
          workspaceId: row.workspaceId,
          userId: row.userId,
          role: row.role,
          joinedAt: row.joinedAt,
          name: profile.name,
          email: profile.email,
          image: profile.image,
        });
      }
    }

    return { workspaces, members };
  },
});

/**
 * Idempotent registration for an owner-created workspace. Existing rows are
 * never overwritten or granted access by this mutation.
 */
export const ensure = mutation({
  args: {
    workspaceId: v.string(),
    name: v.string(),
    description: v.string(),
    createdAt: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (!args.workspaceId || args.workspaceId.length > 100) throw new Error("Invalid workspace id");
    if (args.payload.length > MAX_PAYLOAD) throw new Error("Workspace data is too large to share");

    const existing = await ctx.db
      .query("sharedWorkspaces")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
    if (existing) return { created: false, workspaceId: existing.workspaceId };

    await ctx.db.insert("sharedWorkspaces", {
      workspaceId: args.workspaceId,
      ownerId: userId,
      name: args.name.trim().slice(0, MAX_NAME) || "Untitled workspace",
      description: args.description.trim().slice(0, MAX_DESCRIPTION),
      createdAt: args.createdAt,
      payload: args.payload,
      revision: 1,
      updatedAt: Date.now(),
      updatedBy: userId,
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    });
    return { created: true, workspaceId: args.workspaceId };
  },
});

export const save = mutation({
  args: {
    workspaceId: v.string(),
    name: v.string(),
    description: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (args.payload.length > MAX_PAYLOAD) throw new Error("Workspace data is too large to save");

    const row = await membership(ctx, args.workspaceId, userId);
    if (!row || (row.role !== "owner" && row.role !== "editor")) {
      throw new Error("You do not have edit access to this workspace");
    }
    const workspace = await ctx.db
      .query("sharedWorkspaces")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
    if (!workspace) throw new Error("This workspace has not been shared yet");

    const revision = workspace.revision + 1;
    await ctx.db.patch(workspace._id, {
      name: args.name.trim().slice(0, MAX_NAME) || workspace.name,
      description: args.description.trim().slice(0, MAX_DESCRIPTION),
      payload: args.payload,
      revision,
      updatedAt: Date.now(),
      updatedBy: userId,
    });
    return { revision };
  },
});

/** Owner-only destructive removal. No UI surface; used for administration. */
export const remove = mutation({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const mine = await membership(ctx, workspaceId, userId);
    if (!mine || mine.role !== "owner") throw new Error("Only the owner can delete this workspace");
    const workspace = await ctx.db
      .query("sharedWorkspaces")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    if (!workspace) return { removed: false };

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(MAX_MEMBERS);
    for (const member of members) await ctx.db.delete(member._id);

    const invites = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(200);
    for (const invite of invites) await ctx.db.delete(invite._id);

    const files = await ctx.db
      .query("attachments")
      .withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", workspaceId))
      .take(200);
    for (const file of files) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }

    await ctx.db.delete(workspace._id);
    return { removed: true };
  },
});

export const setRole = mutation({
  args: {
    workspaceId: v.string(),
    userId: v.id("users"),
    role: v.union(v.literal("editor"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const me = await getAuthUserId(ctx);
    if (me === null) throw new Error("Not authenticated");
    const mineMembership = await membership(ctx, args.workspaceId, me);
    if (!mineMembership || mineMembership.role !== "owner") {
      throw new Error("Only the workspace owner can change roles");
    }
    const target = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .unique();
    if (!target) throw new Error("That person is not a member");
    if (target.role === "owner") throw new Error("The owner's role cannot be changed");
    await ctx.db.patch(target._id, { role: args.role });
    return { ok: true, role: args.role };
  },
});

