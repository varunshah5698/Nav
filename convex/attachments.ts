import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

type Ctx = QueryCtx | MutationCtx;

// Kept in step with the client-side validation in src/pages/Collaboration.tsx.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 100;
const MAX_NAME_LENGTH = 180;

const EXT_KIND = new Map<string, "pdf" | "doc" | "slides" | "text" | "sheet" | "code" | "quote" | "image" | "archive">([
  ["pdf", "pdf"],
  ["docx", "doc"],
  ["pptx", "slides"],
  ["md", "text"],
  ["txt", "text"],
  ["csv", "sheet"],
  ["json", "code"],
  ["bib", "quote"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["svg", "image"],
  ["webp", "image"],
  ["zip", "archive"],
]);

async function sharedWorkspace(ctx: Ctx, workspaceId: string) {
  return await ctx.db
    .query("sharedWorkspaces")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .unique();
}

async function membership(ctx: Ctx, workspaceId: string, userId: Id<"users"> | null) {
  if (userId === null) return null;
  return await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();
}

export const list = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const shared = await sharedWorkspace(ctx, workspaceId);
    if (shared) {
      const member = await membership(ctx, workspaceId, userId);
      if (!member) return [];
    }
    const rows = shared
      ? await ctx.db
          .query("attachments")
          .withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", workspaceId))
          .order("desc")
          .take(MAX_FILES)
      : await ctx.db
          .query("attachments")
          .withIndex("by_user_workspace_createdAt", (q) =>
            q.eq("userId", userId).eq("workspaceId", workspaceId),
          )
          .order("desc")
          .take(MAX_FILES);

    const names = new Map<string, string>();
    if (shared) {
      for (const row of rows) {
        if (!names.has(row.userId)) {
          const user = await ctx.db.get(row.userId);
          names.set(row.userId, user?.name ?? "Researcher");
        }
      }
    }
    return await Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        name: row.name,
        ext: row.ext,
        kind: row.kind,
        size: row.size,
        createdAt: row.createdAt,
        uploaderName: shared ? names.get(row.userId) ?? "Researcher" : null,
        url: await ctx.storage.getUrl(row.storageId),
      })),
    );
  },
});

/** Short-lived pre-signed URL the browser POSTs the file bytes to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const register = mutation({
  args: {
    workspaceId: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    ext: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const name = args.name.trim().slice(0, MAX_NAME_LENGTH);
    const ext = args.ext.toLowerCase();
    const kind = EXT_KIND.get(ext);
    if (!name) {
      await ctx.storage.delete(args.storageId);
      throw new Error("File name is required");
    }
    if (!kind) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Unsupported file type");
    }
    if (!Number.isFinite(args.size) || args.size <= 0 || args.size > MAX_FILE_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("File is outside the 20 MB limit");
    }

    // Never trust the client-declared size: verify the stored object's metadata.
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size !== args.size) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Upload verification failed");
    }

    const shared = await sharedWorkspace(ctx, args.workspaceId);
    if (shared) {
      const member = await membership(ctx, args.workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "editor")) {
        await ctx.storage.delete(args.storageId);
        throw new Error("You do not have edit access to this workspace");
      }
    }

    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", args.workspaceId))
      .take(MAX_FILES + 1);
    const mine = await ctx.db
      .query("attachments")
      .withIndex("by_user_workspace_createdAt", (q) =>
        q.eq("userId", userId).eq("workspaceId", args.workspaceId),
      )
      .take(MAX_FILES + 1);
    const capped = shared ? existing : mine;
    if (capped.length >= MAX_FILES) {
      await ctx.storage.delete(args.storageId);
      throw new Error(`You can attach at most ${MAX_FILES} handoff files in a workspace`);
    }
    const total = capped.reduce((sum, row) => sum + row.size, 0);
    if (total + args.size > MAX_TOTAL_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("The 60 MB attachment cap for this workspace has been reached");
    }

    try {
      const id = await ctx.db.insert("attachments", {
        userId,
        workspaceId: args.workspaceId,
        storageId: args.storageId,
        name,
        ext,
        kind,
        size: args.size,
        createdAt: Date.now(),
      });
      return id;
    } catch (error) {
      await ctx.storage.delete(args.storageId);
      throw error;
    }
  },
});

export const remove = mutation({
  args: { id: v.id("attachments") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Attachment not found");

    const shared = await sharedWorkspace(ctx, row.workspaceId);
    if (shared) {
      const member = await membership(ctx, row.workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "editor")) {
        throw new Error("You do not have edit access to this workspace");
      }
    } else if (row.userId !== userId) {
      throw new Error("Attachment not found");
    }

    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  },
});

export const clear = mutation({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const shared = await sharedWorkspace(ctx, workspaceId);
    if (shared) {
      const member = await membership(ctx, workspaceId, userId);
      if (!member || (member.role !== "owner" && member.role !== "editor")) {
        throw new Error("You do not have edit access to this workspace");
      }
    }
    const rows = shared
      ? await ctx.db
          .query("attachments")
          .withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", workspaceId))
          .take(MAX_FILES)
      : await ctx.db
          .query("attachments")
          .withIndex("by_user_workspace_createdAt", (q) =>
            q.eq("userId", userId).eq("workspaceId", workspaceId),
          )
          .take(MAX_FILES);
    for (const row of rows) {
      await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});

/** Move the caller's personal/demo attachments into a newly shared copy. */
export const reassign = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (from === to) return 0;
    const target = await sharedWorkspace(ctx, to);
    if (!target) throw new Error("Target workspace is not shared");
    const member = await membership(ctx, to, userId);
    if (!member || (member.role !== "owner" && member.role !== "editor")) {
      throw new Error("You do not have edit access to this workspace");
    }
    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_user_workspace_createdAt", (q) =>
        q.eq("userId", userId).eq("workspaceId", from),
      )
      .take(MAX_FILES);
    if (!rows.length) return 0;
    const targetRows = await ctx.db
      .query("attachments")
      .withIndex("by_workspace_createdAt", (q) => q.eq("workspaceId", to))
      .take(MAX_FILES + 1);
    const total = targetRows.reduce((sum, row) => sum + row.size, 0) + rows.reduce((sum, row) => sum + row.size, 0);
    if (targetRows.length + rows.length > MAX_FILES || total > MAX_TOTAL_BYTES) {
      throw new Error("The target workspace does not have room for these files");
    }
    for (const row of rows) await ctx.db.patch(row._id, { workspaceId: to });
    return rows.length;
  },
});
