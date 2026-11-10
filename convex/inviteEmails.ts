import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const HOURLY_LIMIT = 20;

/** Per-user email quota. No recipient or message content is stored. */
export const claimSend = internalMutation({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, { userId, now }) => {
    const hourAgo = now - 60 * 60_000;
    const recent = await ctx.db
      .query("inviteEmails")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId).gte("createdAt", hourAgo))
      .take(HOURLY_LIMIT + 1);
    if (recent.length >= HOURLY_LIMIT) return false;
    await ctx.db.insert("inviteEmails", { userId, createdAt: now });
    return true;
  },
});

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 48 * 60 * 60_000;
    const old = await ctx.db
      .query("inviteEmails")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(500);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});
