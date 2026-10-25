import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import type { Config } from "./config.js";
import { log, errorName } from "./log.js";

export type Mail = { to: string; subject: string; text: string; html: string; tag: string };
export type Mailer = {
  provider: Config["EMAIL_PROVIDER"];
  delivers: boolean;
  send(mail: Mail): Promise<boolean>;
};

/**
 * outbox  – local development/testing only: writes each message to OUTBOX_DIR (mode 0600).
 * smtp    – any SMTP provider via SMTP_URL (smtps://user:pass@host:465 or smtp://...:587).
 * disabled – nothing is sent; flows that depend on email report that clearly.
 */
export function createMailer(config: Config): Mailer {
  if (config.EMAIL_PROVIDER === "outbox") {
    if (config.production) throw new Error("The outbox mailer cannot run in production.");
    const dir = resolve(config.OUTBOX_DIR);
    return {
      provider: "outbox",
      delivers: true,
      async send(mail) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const name = `${Date.now()}-${mail.tag}-${randomBytes(4).toString("hex")}.json`;
        writeFileSync(
          join(dir, name),
          JSON.stringify({ from: config.EMAIL_FROM, ...mail, sentAt: new Date().toISOString() }, null, 2),
          { mode: 0o600 },
        );
        log.info("email.outbox", { tag: mail.tag });
        return true;
      },
    };
  }
  if (config.EMAIL_PROVIDER === "smtp") {
    const transport = nodemailer.createTransport(config.SMTP_URL!, {
      from: config.EMAIL_FROM,
    });
    return {
      provider: "smtp",
      delivers: true,
      async send(mail) {
        try {
          await transport.sendMail({
            to: mail.to,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            headers: { "X-Scope-Tag": mail.tag },
          });
          log.info("email.sent", { tag: mail.tag });
          return true;
        } catch (e) {
          log.error("email.failed", { tag: mail.tag, error: errorName(e) });
          return false;
        }
      },
    };
  }
  return {
    provider: "disabled",
    delivers: false,
    async send(mail) {
      log.warn("email.disabled", { tag: mail.tag });
      return false;
    },
  };
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function layout(heading: string, paragraphs: string[], action?: { label: string; url: string }) {
  const text = [heading, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : []), "", "— SCOPE · Business opportunity intelligence", "You received this because of activity on your SCOPE account."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#F6F5F0;font-family:Inter,Arial,sans-serif;color:#0B1819">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #D9DED8;border-radius:14px">
<tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:700;letter-spacing:.04em">SCOPE</td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="font-size:22px;line-height:1.25;margin:0 0 12px;font-weight:600">${escape(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#344543">${escape(p)}</p>`).join("")}
${action ? `<p style="margin:20px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#173330;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px">${escape(action.label)}</a></p><p style="font-size:12px;color:#5C6D6B;word-break:break-all">${escape(action.url)}</p>` : ""}
</td></tr><tr><td style="padding:16px 32px 28px;font-size:12px;color:#5C6D6B;border-top:1px solid #E9E8E0">You received this because of activity on your SCOPE account.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

export const templates = {
  verifyEmail(url: string, trial: boolean) {
    return {
      tag: "verify_email",
      subject: "Confirm your email for SCOPE",
      ...layout(
        "Confirm your email address",
        [
          "Confirm this address to secure your account and enable password recovery.",
          trial
            ? "Your seven-day trial starts when you confirm. No card is needed."
            : "This link expires in 24 hours.",
        ],
        { label: "Confirm email", url },
      ),
    };
  },
  resetPassword(url: string) {
    return {
      tag: "reset_password",
      subject: "Reset your SCOPE password",
      ...layout(
        "Reset your password",
        [
          "Someone asked to reset the password for this SCOPE account. The link expires in one hour and works once.",
          "If this wasn’t you, ignore this email. Your password stays the same.",
        ],
        { label: "Choose a new password", url },
      ),
    };
  },
  passwordChanged() {
    return {
      tag: "password_changed",
      subject: "Your SCOPE password was changed",
      ...layout("Your password was changed", [
        "The password for your SCOPE account was just changed and other sessions were signed out.",
        "If you did not do this, reset your password immediately and contact the operator.",
      ]),
    };
  },
  changeEmail(url: string) {
    return {
      tag: "change_email",
      subject: "Confirm your new SCOPE email address",
      ...layout(
        "Confirm your new email address",
        ["Confirm this address to use it for your SCOPE account. The link expires in 24 hours."],
        { label: "Confirm new address", url },
      ),
    };
  },
  emailChangedNotice() {
    return {
      tag: "email_changed",
      subject: "Your SCOPE email address was changed",
      ...layout("Your account email changed", [
        "The email address for your SCOPE account was changed. Messages now go to the new address.",
        "If you did not do this, contact the operator immediately.",
      ]),
    };
  },
  accountDeleted() {
    return {
      tag: "account_deleted",
      subject: "Your SCOPE account has been deleted",
      ...layout("Your account has been deleted", [
        "Your SCOPE account, business profile, saved opportunities and sessions have been deleted.",
        "Encrypted backups expire on the published retention schedule.",
      ]),
    };
  },
};
