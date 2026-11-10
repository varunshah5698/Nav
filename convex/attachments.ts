import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() || "";

export const list = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_user_workspace_createdAt", (q) =>
        q.eq("userId", userId).eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(MAX_FILES);
    return await Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        name: row.name,
        ext: row.ext,
        kind: row.kind,
        size: row.size,
        createdAt: row.createdAt,
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

    // Never trust the client-declared size: verify the stored object.
    const blob = await ctx.storage.get(args.storageId);
    if (!blob || blob.size !== args.size) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Upload verification failed");
    }

    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_user_workspace_createdAt", (q) =>
        q.eq("userId", userId).eq("workspaceId", args.workspaceId),
      )
      .take(MAX_FILES + 1);
    if (existing.length >= MAX_FILES) {
      await ctx.storage.delete(args.storageId);
      throw new Error(`A workspace can hold at most ${MAX_FILES} handoff files`);
    }
    const total = existing.reduce((sum, row) => sum + row.size, 0);
    if (total + args.size > MAX_TOTAL_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("The 60 MB workspace attachment cap has been reached");
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
    if (!row || row.userId !== userId) throw new Error("Attachment not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  },
});

export const clear = mutation({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const rows = await ctx.db
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
