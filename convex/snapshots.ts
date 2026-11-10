import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Ownership comes only from the verified Convex Auth session.
// No function accepts a userId or key from the client.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const snap = await ctx.db
      .query("userSnapshots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return snap ? { userId: snap.userId, payload: snap.payload, updatedAt: snap.updatedAt } : null;
  },
});

export const save = mutation({
  args: { payload: v.string() },
  handler: async (ctx, { payload }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (payload.length > 1_000_000) throw new Error("Snapshot exceeds 1 MB limit");
    const existing = await ctx.db
      .query("userSnapshots")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { payload, updatedAt });
    } else {
      await ctx.db.insert("userSnapshots", { userId, payload, updatedAt });
    }
    return updatedAt;
  },
});
