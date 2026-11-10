import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

declare const process: { env: Record<string, string | undefined> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MAX_LINK_LENGTH = 500;
const HOURLY_LIMIT = 20;

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );

function inviteHtml(input: {
  inviter: string;
  workspace: string;
  role: string;
  note?: string;
  link: string;
}) {
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
            <h1 style="margin:0 0 10px;font-size:26px;line-height:1.15;letter-spacing:-0.03em;color:#2b2520;">You're invited to ${esc(input.workspace)}</h1>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#7c7268;">${esc(input.inviter)} invited you to collaborate as <strong style="color:#2b2520;">${esc(input.role)}</strong>.</p>
          </td></tr>
          ${note}
          <tr><td style="padding:0 32px 22px;">
            <a href="${esc(input.link)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#1e2222;color:#d8f85e;font-size:14px;font-weight:700;text-decoration:none;">Open ResearchGraph</a>
            <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#a2978c;word-break:break-all;">${esc(input.link)}</p>
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:11px;line-height:1.6;color:#a2978c;">You received this because a workspace owner invited this address. If this wasn't for you, ignore the message.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function inviteText(input: {
  inviter: string;
  workspace: string;
  role: string;
  note?: string;
  link: string;
}) {
  return [
    `${input.inviter} invited you to “${input.workspace}” on ResearchGraph as ${input.role}.`,
    input.note ? `\n“${input.note}”\n` : "",
    `Open the workspace: ${input.link}`,
    "",
    "If this wasn't for you, ignore the message.",
  ].join("\n");
}

export const send = action({
  args: {
    to: v.string(),
    workspaceName: v.string(),
    inviterName: v.string(),
    role: v.union(v.literal("viewer"), v.literal("editor")),
    note: v.optional(v.string()),
    link: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const to = args.to.trim().toLowerCase();
    const workspace = args.workspaceName.trim().slice(0, MAX_NAME_LENGTH);
    const inviter = args.inviterName.trim().slice(0, MAX_NAME_LENGTH) || "A researcher";
    const note = args.note?.trim().slice(0, MAX_NOTE_LENGTH) || undefined;
    const link = args.link.trim();

    if (to.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(to)) {
      throw new Error("Enter a valid email address");
    }
    if (!workspace) throw new Error("Workspace name is missing");
    if (link.length > MAX_LINK_LENGTH) throw new Error("Invite link is too long");
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      throw new Error("Invite link is invalid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invite link must be http or https");
    }

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME;
    if (!apiKey || !senderEmail || !senderName) {
      return { sent: false, configured: false as const };
    }

    const allowed = await ctx.runMutation(internal.inviteEmails.claimSend, {
      userId,
      now: Date.now(),
    });
    if (!allowed) {
      return { sent: false, configured: true as const, error: "Too many invitations this hour." };
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
          to: [{ email: to }],
          subject: `${inviter} invited you to ${workspace} on ResearchGraph`,
          htmlContent: inviteHtml({ inviter, workspace, role: args.role, note, link }),
          textContent: inviteText({ inviter, workspace, role: args.role, note, link }),
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        // Never log the recipient or message body.
        console.error("[invite-email] Brevo rejected the message", response.status, detail.slice(0, 300));
        return { sent: false, configured: true as const, error: "The email provider rejected the message." };
      }
      return { sent: true, configured: true as const };
    } catch (error) {
      console.error(
        "[invite-email] Brevo request failed",
        error instanceof Error ? error.message : "network error",
      );
      return { sent: false, configured: true as const, error: "The email provider could not be reached." };
    }
  },
});

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
