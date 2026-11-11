import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { validatePasswordRequirements } from "./passwordPolicy";

declare const process: { env: Record<string, string | undefined> };

// The same deployment serves local dev, Vercel and Render. Redirects must be
// allowed per origin instead of relying on one SITE_URL.
const BASE_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://researchgraph-steel.vercel.app",
  "https://nav-y35d.onrender.com",
  "https://site-942642bb18134977bde5709248101d00.freebuff.page",
];

function allowedOrigins() {
  const extra = (process.env.AUTH_REDIRECT_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([...BASE_ORIGINS, ...extra]);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Password remains additive; Google sign-in is unchanged.
  providers: [
    Password({ validatePasswordRequirements }),
    Google,
  ],
  // Backs up the per-OTP five-attempt limit with Convex Auth's own limiter.
  signIn: { maxFailedAttempsPerHour: 5 },
  callbacks: {
    // Called after the OAuth provider redirects back. Relative paths use
    // SITE_URL; absolute browser origins must be on the allowlist.
    async redirect({ redirectTo }) {
      const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return `${site}${redirectTo}`;
      }
      let target: URL;
      try {
        target = new URL(redirectTo);
      } catch {
        throw new Error("Invalid redirect target.");
      }
      if (!allowedOrigins().has(target.origin)) {
        throw new Error("Redirect origin is not allowed.");
      }
      return target.toString();
    },
  },
});
