import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

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
