import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

declare const process: { env: Record<string, string | undefined> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NOTE = 500;
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_PENDING = 100;

interface InviteSendResult {
  sent: boolean;
  configured: boolean;
  link: string;
  workspaceName: string;
  error?: string;
}

interface PendingInvite {
  token: string;
  inviteId: Id<"workspaceInvites">;
  workspaceName: string;
  inviterName: string;
}

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const data = new Uint8Array(32);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function inviteHtml(input: { inviter: string; workspace: string; role: string; note?: string; link: string }) {
  const note = input.note
    ? `<tr><td style="padding:0 32px 18px;"><div style="padding:14px 16px;border-radius:12px;background:#fbf4ec;border:1px solid #f0e4d8;font-size:13px;line-height:1.6;color:#5e5246;">“${esc(input.note)}”</div></td></tr>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f2ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2520;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ec;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffcf9;border:1px solid #e9e1d8;border-radius:20px;overflow:hidden;">
          <tr><td style="padding:28px 32px 16px;">
            <p style="margin:0 0 18px;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#2b2520;">ResearchGraph</p>
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b93b18;font-weight:700;">Workspace invitation</p>
            <h1 style="margin:0 0 10px;font-size:26px;line-height:1.15;letter-spacing:-0.03em;color:#2b2520;">Join ${esc(input.workspace)}</h1>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#7c7268;">${esc(input.inviter)} invited you to collaborate as <strong style="color:#2b2520;">${esc(input.role)}</strong>. Accept the invitation to join the workspace.</p>
          </td></tr>
          ${note}
          <tr><td style="padding:0 32px 22px;">
            <a href="${esc(input.link)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#1e2222;color:#d8f85e;font-size:14px;font-weight:700;text-decoration:none;">Accept invitation</a>
            <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#a2978c;word-break:break-all;">${esc(input.link)}</p>
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:11px;line-height:1.6;color:#a2978c;">This invitation expires in 7 days. If it wasn't for you, ignore the message.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function inviteText(input: { inviter: string; workspace: string; role: string; note?: string; link: string }) {
  return [
    `${input.inviter} invited you to collaborate on “${input.workspace}” as ${input.role}.`,
    input.note ? `\n“${input.note}”\n` : "",
    `Accept the invitation: ${input.link}`,
    "",
    "This invitation expires in 7 days. If it wasn't for you, ignore the message.",
  ].join("\n");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export const createAndSend = action({
  args: {
    workspaceId: v.string(),
    to: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    note: v.optional(v.string()),
    origin: v.string(),
  },
  handler: async (ctx, args): Promise<InviteSendResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const email = normalizeEmail(args.to);
    if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
    const now = Date.now();
    const pending: PendingInvite = await ctx.runMutation(internal.workspaceInvites.createPending, {
      workspaceId: args.workspaceId,
      email,
      role: args.role,
      invitedBy: userId,
      now,
    });

    const configuredBase = process.env.SITE_URL?.trim();
    let origin = args.origin.trim();
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      origin = parsed.origin;
    } catch {
      throw new Error("Invalid app origin");
    }
    // A localhost SITE_URL is a dev leftover; fall back to the real app origin.
    const usableConfigured = configuredBase && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configuredBase);
    const base = (usableConfigured ? configuredBase : origin).replace(/\/+$/, "");
    const link: string = `${base}/invite/${pending.token}`;

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME;
    if (!apiKey || !senderEmail || !senderName) {
      return {
        sent: false,
        configured: false as const,
        link,
        workspaceName: pending.workspaceName,
      };
    }

    const allowed = await ctx.runMutation(internal.inviteEmails.claimSend, { userId, now });
    if (!allowed) {
      return {
        sent: false,
        configured: true as const,
        link,
        workspaceName: pending.workspaceName,
        error: "Too many invitations this hour.",
      };
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
          subject: `${pending.inviterName} invited you to ${pending.workspaceName} on ResearchGraph`,
          htmlContent: inviteHtml({
            inviter: pending.inviterName,
            workspace: pending.workspaceName,
            role: args.role,
            note: args.note?.trim().slice(0, MAX_NOTE) || undefined,
            link,
          }),
          textContent: inviteText({
            inviter: pending.inviterName,
            workspace: pending.workspaceName,
            role: args.role,
            note: args.note?.trim().slice(0, MAX_NOTE) || undefined,
            link,
          }),
        }),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
        console.error("[invite-email] Brevo rejected the message", response.status, detail.slice(0, 300));
        return {
          sent: false,
          configured: true as const,
          link,
          workspaceName: pending.workspaceName,
          error: "The email provider rejected the message.",
        };
      }
      return { sent: true, configured: true as const, link, workspaceName: pending.workspaceName };
    } catch (error) {
      console.error(
        "[invite-email] Brevo request failed",
        error instanceof Error ? error.message : "network error",
      );
      return {
        sent: false,
        configured: true as const,
        link,
        workspaceName: pending.workspaceName,
        error: "The email provider could not be reached.",
      };
    }
  },
});

/** Creates the single-use token before the action tries to deliver it. */
export const createPending = internalMutation({
  args: {
    workspaceId: v.string(),
    email: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    invitedBy: v.id("users"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("sharedWorkspaces")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .unique();
    if (!workspace) throw new Error("This workspace has not been shared yet");

    const owner = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.invitedBy),
      )
      .unique();
    if (!owner || owner.role !== "owner") throw new Error("Only the workspace owner can invite");

    const invitedUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    if (invitedUser) {
      const already = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("userId", invitedUser._id),
        )
        .unique();
      if (already) throw new Error("That person is already in the workspace");
    }

    const existing = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(MAX_PENDING);
    const duplicate = existing.find(
      (row) =>
        row.email === args.email &&
        row.acceptedAt === undefined &&
        row.revokedAt === undefined &&
        row.expiresAt > args.now,
    );
    if (duplicate) throw new Error("An invitation is already pending for that email");

    const token = randomToken();
    const inviteId = await ctx.db.insert("workspaceInvites", {
      workspaceId: args.workspaceId,
      email: args.email,
      role: args.role,
      tokenHash: await sha256(token),
      invitedBy: args.invitedBy,
      createdAt: args.now,
      expiresAt: args.now + INVITE_TTL_MS,
    });
    const inviter = await ctx.db.get(args.invitedBy);
    return {
      token,
      inviteId,
      workspaceName: workspace.name,
      inviterName: inviter?.name ?? "A researcher",
    };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to accept this invitation");
    const tokenHash = await sha256(token);
    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite || invite.revokedAt !== undefined) throw new Error("This invitation is not valid");
    if (invite.acceptedAt !== undefined) throw new Error("This invitation has already been used");
    if (invite.expiresAt < Date.now()) throw new Error("This invitation has expired");

    const user = await ctx.db.get(userId);
    if (!user?.email || normalizeEmail(user.email) !== invite.email) {
      throw new Error("This invitation was sent to a different email address");
    }
    const workspace = await ctx.db
      .query("sharedWorkspaces")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", invite.workspaceId))
      .unique();
    if (!workspace) throw new Error("This workspace no longer exists");

    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("userId", userId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("workspaceMembers", {
        workspaceId: invite.workspaceId,
        userId,
        role: invite.role,
        joinedAt: Date.now(),
      });
    }
    await ctx.db.patch(invite._id, { acceptedAt: Date.now() });
    return { workspaceId: workspace.workspaceId, workspaceName: workspace.name };
  },
});

export const list = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const mine = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", userId),
      )
      .unique();
    if (!mine || mine.role !== "owner") return [];
    const invites = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(MAX_PENDING);
    const now = Date.now();
    return invites
      .filter(
        (row) =>
          row.acceptedAt === undefined &&
          row.revokedAt === undefined &&
          row.expiresAt > now,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        id: row._id,
        workspaceId: row.workspaceId,
        email: row.email,
        role: row.role,
        status: "pending" as const,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      }));
  },
});

export const revoke = mutation({
  args: { id: v.id("workspaceInvites") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const invite = await ctx.db.get(id);
    if (!invite) throw new Error("Invitation not found");
    const mine = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("userId", userId),
      )
      .unique();
    if (!mine || mine.role !== "owner") throw new Error("Only the workspace owner can revoke invites");
    await ctx.db.patch(invite._id, { revokedAt: Date.now() });
    return { ok: true };
  },
});

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60_000;
    const old = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(500);
    let removed = 0;
    for (const row of old) {
      if (row.createdAt < cutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return removed;
  },
});
