import { z } from "zod";

// Every runtime setting is read and validated here, once. Nothing else reads process.env.
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  BASE_URL: z.url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().default("./data/scope.db"),
  MIGRATIONS_DIR: z.string().default("server/migrations"),
  TRUST_PROXY: z.string().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  EMAIL_PROVIDER: z.enum(["outbox", "smtp", "disabled"]).default("outbox"),
  EMAIL_FROM: z.string().default("SCOPE <no-reply@localhost>"),
  OUTBOX_DIR: z.string().default("./data/outbox"),
  SMTP_URL: optionalString,

  BILLING_PROVIDER: z.enum(["disabled", "stripe"]).default("disabled"),
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PRICE_SOLO: optionalString,
  STRIPE_API_BASE: z.url().default("https://api.stripe.com"),
  SOLO_PRICE_LABEL: z.string().default("€19"),

  TED_SYNC_ENABLED: bool,
  TED_SYNC_HOURS_UTC: z
    .string()
    .default("5,17")
    .transform((s) => s.split(",").map((h) => Number(h.trim())))
    .pipe(z.array(z.number().int().min(0).max(23)).min(1).max(6)),
  TED_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(5),
  TED_PAGE_SIZE: z.coerce.number().int().min(10).max(250).default(100),
  TED_STALE_HOURS: z.coerce.number().min(1).max(720).default(36),
  ALERT_WEBHOOK_URL: optionalString,

  INBOUND_EMAIL_SECRET: optionalString,

  EDITORIAL_REVIEW_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  EDITORIAL_ALLOW_SELF_APPROVAL: bool,

  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  BACKUP_ENCRYPTION_KEY: optionalString,
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
  UNVERIFIED_ACCOUNT_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  LEGAL_OPERATOR_NAME: optionalString,
  LEGAL_OPERATOR_ADDRESS: optionalString,
  LEGAL_CONTACT_EMAIL: optionalString,
  LEGAL_REVIEWED: bool,
});

export type Config = z.infer<typeof schema> & {
  production: boolean;
  secureCookies: boolean;
  billingEnabled: boolean;
  legalConfigured: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      "Invalid configuration: " +
        parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; "),
    );
  const c = parsed.data;
  const problems: string[] = [];
  const https = new URL(c.BASE_URL).protocol === "https:";
  const billingEnabled = c.BILLING_PROVIDER === "stripe";
  if (billingEnabled) {
    if (!c.STRIPE_SECRET_KEY) problems.push("STRIPE_SECRET_KEY is required");
    if (!c.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"))
      problems.push("STRIPE_WEBHOOK_SECRET must be a whsec_ signing secret");
    if (!c.STRIPE_PRICE_SOLO?.startsWith("price_"))
      problems.push("STRIPE_PRICE_SOLO must be a price_ identifier");
  }
  if (c.EMAIL_PROVIDER === "smtp" && !c.SMTP_URL)
    problems.push("SMTP_URL is required when EMAIL_PROVIDER=smtp");
  if (
    c.BACKUP_ENCRYPTION_KEY &&
    !/^[a-f0-9]{64}$/i.test(c.BACKUP_ENCRYPTION_KEY)
  )
    problems.push("BACKUP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  if (c.APP_ENV === "production") {
    if (!https) problems.push("BASE_URL must use https in production");
    if (c.EMAIL_PROVIDER !== "smtp")
      problems.push(
        "EMAIL_PROVIDER=smtp is required in production (verification and recovery depend on it)",
      );
    if (billingEnabled && c.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
      problems.push("A Stripe test key cannot be used in production");
    if (!c.BACKUP_ENCRYPTION_KEY)
      problems.push("BACKUP_ENCRYPTION_KEY is required in production");
    if (!c.TRUST_PROXY)
      problems.push(
        "TRUST_PROXY must describe the TLS reverse proxy in production (e.g. 1 or loopback)",
      );
  }
  if (billingEnabled && c.APP_ENV !== "production" && c.STRIPE_SECRET_KEY?.startsWith("sk_live_"))
    problems.push("A Stripe live key may only be used with APP_ENV=production");
  if (problems.length)
    throw new Error("Invalid configuration: " + problems.join("; "));
  return {
    ...c,
    production: c.APP_ENV === "production",
    secureCookies: https,
    billingEnabled,
    legalConfigured: !!(
      c.LEGAL_OPERATOR_NAME &&
      c.LEGAL_OPERATOR_ADDRESS &&
      c.LEGAL_CONTACT_EMAIL
    ),
  };
}

// Test helper: a valid configuration with overrides, independent of the host environment.
export function testConfig(overrides: Partial<Record<string, string>> = {}) {
  return loadConfig({
    APP_ENV: "test",
    BASE_URL: "http://localhost:3000",
    EMAIL_PROVIDER: "disabled",
    ...overrides,
  });
}
