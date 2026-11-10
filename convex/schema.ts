import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Kept in step with UPLOAD_FORMATS in src/pages/Collaboration.tsx.
const attachmentKind = v.union(
  v.literal("pdf"),
  v.literal("doc"),
  v.literal("slides"),
  v.literal("text"),
  v.literal("sheet"),
  v.literal("code"),
  v.literal("quote"),
  v.literal("image"),
  v.literal("archive"),
);

export default defineSchema({
  ...authTables,

  // One authenticated snapshot per Convex user. userId is written from
  // ctx.auth only — never from client input.
  userSnapshots: defineTable({
    userId: v.id("users"),
    payload: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Legacy pre-auth snapshots (local "<localUserId>:<workspaceId>" keys).
  // Kept read-only for data preservation; no function exposes them.
  snapshots: defineTable({
    key: v.string(),
    payload: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Handoff files live in Convex file storage; this table is metadata only.
  // Ownership is derived from the authenticated user, never client input.
  attachments: defineTable({
    userId: v.id("users"),
    workspaceId: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    ext: v.string(),
    kind: attachmentKind,
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_workspace_createdAt", ["userId", "workspaceId", "createdAt"])
    .index("by_storage", ["storageId"]),

  // Rate-limit ledger for invite emails. No recipient or message content.
  inviteEmails: defineTable({
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // Email OTP password reset. Only hashed identifiers and hashed OTPs are
  // stored; plaintext emails and codes never touch the database.
  passwordResetOtps: defineTable({
    emailHash: v.string(),
    userId: v.optional(v.id("users")),
    codeHash: v.string(),
    salt: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    maxAttempts: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
    ipHash: v.string(),
  })
    .index("by_emailHash_createdAt", ["emailHash", "createdAt"])
    .index("by_ipHash_createdAt", ["ipHash", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // Short-lived, single-use authorization issued only after a correct OTP.
  // The completion action consumes this server-side; a client boolean is never
  // trusted as proof of verification.
  passwordResetTokens: defineTable({
    userId: v.id("users"),
    emailHash: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_createdAt", ["createdAt"]),
});
