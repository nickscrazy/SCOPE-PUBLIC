import request from "supertest";
import type { Mail, Mailer } from "../server/email";

/** In-memory mailer for tests: records every message so flows can follow real links. */
export function captureMailer(): Mailer & { sent: Mail[]; last: (tag?: string) => Mail | undefined } {
  const sent: Mail[] = [];
  return {
    provider: "outbox",
    delivers: true,
    sent,
    last: (tag) => [...sent].reverse().find((m) => !tag || m.tag === tag),
    async send(mail) {
      sent.push(mail);
      return true;
    },
  };
}
export function tokenFrom(mail: Mail | undefined): string {
  const m = mail?.text.match(/token=([a-f0-9]{64})/);
  if (!m) throw new Error("No token link in message");
  return m[1];
}
export function cookieOf(r: { headers: Record<string, unknown> }): string {
  return (r.headers["set-cookie"] as string[])[0].split(";")[0];
}
type App = Parameters<typeof request>[0];
/** Registers an account and, unless `verify` is false, confirms its email through the emailed link. */
export async function registerAccount(
  app: App,
  mailer: ReturnType<typeof captureMailer>,
  email: string,
  password: string,
  { startTrial = true, verify = true } = {},
) {
  const r = await request(app).post("/api/auth/register").send({ email, password, startTrial });
  if (r.status !== 201) return { response: r, cookie: "" };
  const cookie = cookieOf(r);
  if (verify) {
    const mail = [...mailer.sent].reverse().find((m) => m.to === email.toLowerCase() && m.tag === "verify_email");
    const v = await request(app).post("/api/auth/verify-email").send({ token: tokenFrom(mail) });
    if (v.status !== 200) throw new Error("verification failed: " + JSON.stringify(v.body));
  }
  return { response: r, cookie };
}
