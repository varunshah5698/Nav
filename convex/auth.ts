import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { validatePasswordRequirements } from "./passwordPolicy";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Password remains additive; Google sign-in is unchanged.
  providers: [
    Password({ validatePasswordRequirements }),
    Google,
  ],
  // Backs up the per-OTP five-attempt limit with Convex Auth's own limiter.
  signIn: { maxFailedAttempsPerHour: 5 },
});
