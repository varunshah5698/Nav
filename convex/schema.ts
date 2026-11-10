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
});
