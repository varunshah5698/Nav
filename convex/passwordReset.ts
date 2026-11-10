import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { validatePasswordRequirements } from "./passwordPolicy";

declare const process: { env: Record<string, string | undefined> };

const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_EMAIL_HOURLY_LIMIT = 5;
const OTP_IP_HOURLY_LIMIT = 20;
const RESET_TOKEN_TTL_MS = 10 * 60_000;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Uniform 6-digit code from a cryptographically secure source. */
function generateOtp(): string {
  const buffer = new Uint8Array(1);
  let code = "";
  while (code.length < 6) {
    crypto.getRandomValues(buffer);
    // Reject the top six values so every digit is uniform.
    if (buffer[0] < 250) code += (buffer[0] % 10).toString();
  }
  return code;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hashOtp(salt: string, code: string): Promise<string> {
  return sha256(`${salt}:${code}`);
}

function emailHtml(code: string): string {
  const digits = code
    .split("")
    .map(
      (digit) =>
        `<span style="display:inline-block;width:46px;height:56px;line-height:56px;text-align:center;border-radius:10px;background:#f6f2ec;border:1px solid #e7ddd2;color:#2b2520;font-size:26px;font-weight:800;letter-spacing:0;margin:0 3px;">${digit}</span>`,
    )
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f2ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2520;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ec;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffcf9;border:1px solid #e9e1d8;border-radius:20px;overflow:hidden;">
          <tr><td style="padding:28px 32px 18px;">
            <p style="margin:0 0 18px;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#2b2520;">ResearchGraph</p>
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b93b18;font-weight:700;">Password reset</p>
            <h1 style="margin:0 0 10px;font-size:26px;line-height:1.15;letter-spacing:-0.03em;color:#2b2520;">Your verification code</h1>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#7c7268;">Enter this six-digit code to continue resetting your ResearchGraph password.</p>
          </td></tr>
          <tr><td align="center" style="padding:4px 24px 24px;">
            <div style="display:inline-block;padding:8px 6px;border-radius:16px;background:#fbf4ec;border:1px solid #f0e4d8;"><span style="font-size:26px;font-weight:800;color:#2b2520;">${digits}</span></div>
          </td></tr>
          <tr><td style="padding:0 32px 8px;">
            <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#7c7268;">This code expires in <strong style="color:#2b2520;">5 minutes</strong>.</p>
            <p style="margin:0 0 20px;padding:12px 14px;border-radius:12px;background:#fdf0e9;border:1px solid #f3d4c4;font-size:12.5px;line-height:1.6;color:#7c3a24;"><strong>Never share this code.</strong> ResearchGraph will never ask you for it. If you did not request a password reset, you can safely ignore this email — your password has not changed.</p>
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:11px;line-height:1.6;color:#a2978c;">Sent by ResearchGraph. This is an automated message; replies are not monitored.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;
  if (!apiKey || !senderEmail || !senderName) {
    console.error("[password-reset] missing Brevo environment variables");
    return;
  }
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: "Your ResearchGraph password reset code",
        htmlContent: emailHtml(code),
        textContent: `Your ResearchGraph password reset code is ${code}. It expires in 5 minutes. Never share this code. If you did not request a reset, ignore this email.`,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Never log the recipient code or API key.
      console.error("[password-reset] Brevo rejected the message", response.status, detail.slice(0, 300));
    }
  } catch (error) {
    console.error(
      "[password-reset] Brevo request failed",
      error instanceof Error ? error.message : "network error",
    );
  }
}

export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    if (normalized.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(normalized)) {
      return { ok: true };
    }
    const meta = await ctx.meta.getRequestMetadata();
    const ipHash = await sha256(meta.ip ?? "unknown");
    const salt = randomHex(16);
    const code = generateOtp();
    const codeHash = await hashOtp(salt, code);
    const result = await ctx.runMutation(internal.passwordReset.createResetOtp, {
      email: normalized,
      emailHash: await sha256(normalized),
      codeHash,
      salt,
      ipHash,
      now: Date.now(),
    });
    if (result.shouldSend) await sendOtpEmail(normalized, code);
    // Always return the same response; callers cannot enumerate accounts.
    return { ok: true };
  },
});

export const createResetOtp = internalMutation({
  args: {
    email: v.string(),
    emailHash: v.string(),
    codeHash: v.string(),
    salt: v.string(),
    ipHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    const latest = await ctx.db
      .query("passwordResetOtps")
      .withIndex("by_emailHash_createdAt", (q) => q.eq("emailHash", args.emailHash))
      .order("desc")
      .first();
    if (latest !== null && latest.createdAt > args.now - OTP_RESEND_MS) {
      return { shouldSend: false };
    }

    const hourAgo = args.now - 60 * 60_000;
    const emailRecent = await ctx.db
      .query("passwordResetOtps")
      .withIndex("by_emailHash_createdAt", (q) =>
        q.eq("emailHash", args.emailHash).gte("createdAt", hourAgo),
      )
      .take(OTP_EMAIL_HOURLY_LIMIT + 1);
    if (emailRecent.length >= OTP_EMAIL_HOURLY_LIMIT) return { shouldSend: false };

    const ipRecent = await ctx.db
      .query("passwordResetOtps")
      .withIndex("by_ipHash_createdAt", (q) =>
        q.eq("ipHash", args.ipHash).gte("createdAt", hourAgo),
      )
      .take(OTP_IP_HOURLY_LIMIT + 1);
    if (ipRecent.length >= OTP_IP_HOURLY_LIMIT) return { shouldSend: false };

    // A new request invalidates every older code for this account.
    for (const old of emailRecent) {
      if (old.usedAt === undefined) await ctx.db.patch(old._id, { usedAt: args.now });
    }

    await ctx.db.insert("passwordResetOtps", {
      emailHash: args.emailHash,
      userId: user?._id,
      codeHash: args.codeHash,
      salt: args.salt,
      expiresAt: args.now + OTP_TTL_MS,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      createdAt: args.now,
      ipHash: args.ipHash,
    });
    return { shouldSend: user !== null };
  },
});

export const verifyPasswordResetOtp = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, { email, code }) => {
    const normalized = normalizeEmail(email);
    if (!/^\d{6}$/.test(code.trim()) || normalized.length > EMAIL_MAX_LENGTH) {
      return { ok: false, error: "Invalid or expired code." };
    }
    const emailHash = await sha256(normalized);
    const now = Date.now();
    const otp = await ctx.db
      .query("passwordResetOtps")
      .withIndex("by_emailHash_createdAt", (q) => q.eq("emailHash", emailHash))
      .order("desc")
      .first();
    if (otp === null || otp.usedAt !== undefined || otp.expiresAt < now) {
      return { ok: false, error: "Invalid or expired code." };
    }
    if (otp.attempts >= otp.maxAttempts) {
      return { ok: false, error: "Too many attempts. Request a new code.", locked: true };
    }

    const matches = timingSafeEqual(otp.codeHash, await hashOtp(otp.salt, code.trim()));
    if (!matches) {
      const attempts = otp.attempts + 1;
      const locked = attempts >= otp.maxAttempts;
      await ctx.db.patch(otp._id, {
        attempts,
        ...(locked ? { usedAt: now } : {}),
      });
      return {
        ok: false,
        error: locked ? "Too many attempts. Request a new code." : "Invalid or expired code.",
        locked,
      };
    }

    // Consume the code and mint a separate short-lived authorization token.
    await ctx.db.patch(otp._id, { usedAt: now });
    if (otp.userId === undefined) {
      // Unknown/unregistered email: behave exactly like a known account with
      // an unusable code, so response shape cannot enumerate accounts.
      return { ok: false, error: "Invalid or expired code." };
    }
    const token = randomHex(32);
    await ctx.db.insert("passwordResetTokens", {
      userId: otp.userId,
      emailHash,
      tokenHash: await sha256(token),
      expiresAt: now + RESET_TOKEN_TTL_MS,
      createdAt: now,
    });
    return { ok: true, token };
  },
});

export const consumeResetToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await sha256(token);
    const now = Date.now();
    const record = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (record === null || record.usedAt !== undefined || record.expiresAt < now) return null;
    const user = await ctx.db.get(record.userId);
    if (user === null || typeof user.email !== "string") return null;
    await ctx.db.patch(record._id, { usedAt: now });
    return { userId: record.userId, email: normalizeEmail(user.email) };
  },
});

export const findPasswordAccount = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
  },
});

export const markEmailVerified = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user !== null && user.emailVerificationTime === undefined) {
      await ctx.db.patch(userId, { emailVerificationTime: Date.now() });
    }
  },
});

export const completePasswordReset = action({
  args: { token: v.string(), password: v.string() },
  handler: async (ctx, { token, password }) => {
    try {
      validatePasswordRequirements(password);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Choose a stronger password.",
      };
    }

    const claim = await ctx.runMutation(internal.passwordReset.consumeResetToken, { token });
    if (claim === null) {
      return { ok: false, error: "This reset authorization is invalid or expired. Request a new code." };
    }

    try {
      const existing = await ctx.runQuery(internal.passwordReset.findPasswordAccount, {
        email: claim.email,
      });
      if (existing === null) {
        // A Google-only account can gain password credentials without creating
        // a second user: the OTP proves control of the email, so mark it
        // verified and let Convex Auth link by the unique verified email.
        await ctx.runMutation(internal.passwordReset.markEmailVerified, { userId: claim.userId });
        const created = await createAccount(ctx as never, {
          provider: "password",
          account: { id: claim.email, secret: password },
          profile: { email: claim.email },
          shouldLinkViaEmail: true,
        });
        if (created.user?._id !== claim.userId) {
          return { ok: false, error: "Could not attach this password to the existing account." };
        }
      } else {
        await modifyAccountCredentials(ctx as never, {
          provider: "password",
          account: { id: claim.email, secret: password },
        });
      }
      await invalidateSessions(ctx as never, { userId: claim.userId });
      return { ok: true };
    } catch (error) {
      console.error(
        "[password-reset] password update failed",
        error instanceof Error ? error.message : "unknown error",
      );
      return { ok: false, error: "Could not update the password. Request a new code and try again." };
    }
  },
});

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const oldOtps = await ctx.db
      .query("passwordResetOtps")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(500);
    for (const row of oldOtps) await ctx.db.delete(row._id);
    const oldTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(500);
    for (const row of oldTokens) await ctx.db.delete(row._id);
    return { otps: oldOtps.length, tokens: oldTokens.length };
  },
});
