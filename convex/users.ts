import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Profile of the currently authenticated user, sourced from Convex Auth. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      id: user._id,
      name: user.name ?? "Researcher",
      email: user.email ?? "",
      image: user.image ?? null,
    };
  },
});
