import { z } from "zod";
import type { Opportunity } from "../src/domain.js";
// Reviewed reference facts, not an assertion that a scheme is accepting applications.
// checked dates are frozen: re-running the seed must never make an old check look fresh.
const checked = "2026-10-25T20:09:31.000Z";
const base = {
  source: "FONDI" as const,
  buyer: "Measures and Support Division · Malta",
  type: "grant" as const,
  cpv: [],
  geography: "Malta",
  value: null,
  deadline: null,
  publishedAt: null,
  fetchedAt: checked,
  verifiedAt: checked,
  status: "reference" as const,
  role: ["bidder", "subcontractor", "consortium"],
  sourceVersion: "curated-2026-10-25-v1",
};
export const grantsCatalogue: Opportunity[] = [
  {
    ...base,
    id: "fondi-digitalise-sme",
    fetchedAt: "2026-10-25T20:11:17.348Z",
    verifiedAt: "2026-10-25T20:11:17.348Z",
    sourceId: "digitalise-your-sme",
    title: "Digitalise your SME",
    description:
      "Non-repayable grants to part-finance eligible investment in digitalising SME operations. The official overview describes digital capabilities, processes and an AI component under Call 2. Exact eligible costs, co-financing, aid limits and current application status must be checked in the guidance. This reference is not an offer or an eligibility assessment.",
    sector: "digital",
    tags: [
      "digital",
      "technology",
      "software",
      "digitalisation",
      "innovation",
      "investment",
    ],
    sourceUrl:
      "https://fondi.eu/what-funding-is-available/digitalise-your-sme/",
    conditions: [
      {
        label: "SME status and eligible investment",
        field: "unknown",
        sourceLocator:
          "Official overview / Eligible Beneficiaries + Guidance Notes V2.0",
      },
      {
        label: "Co-financing, aid history and eligible costs",
        field: "unknown",
        sourceLocator:
          "Application / Guidance Notes — individual assessment outstanding",
      },
    ],
  },
  {
    ...base,
    id: "fondi-sme-enhance",
    sourceId: "sme-enhance",
    title: "SME Enhance",
    description:
      "Non-repayable grants to part-finance eligible investment for expansion, diversification, innovation or initial investment. The official reference identifies micro, small and medium-sized enterprises as beneficiaries. Guidance and current cut-offs require review; no company-specific eligibility has been established.",
    sector: "business investment",
    tags: [
      "investment",
      "expansion",
      "innovation",
      "business",
      "manufacturing",
    ],
    sourceUrl: "https://fondi.eu/what-funding-is-available/sme-enhance/",
    conditions: [
      {
        label: "SME status and eligible investment activity",
        field: "unknown",
        sourceLocator:
          "Official overview / Eligible Beneficiaries + Guidance Notes V1.4",
      },
      {
        label: "Co-financing and aid conditions",
        field: "unknown",
        sourceLocator:
          "Application / Guidance Notes — not assessed for this company",
      },
    ],
  },
  {
    ...base,
    id: "me-micro-invest",
    sourceId: "micro-invest-2026-2030",
    source: "Malta Enterprise",
    buyer: "Malta Enterprise",
    type: "tax_credit",
    title: "Micro Invest 2026–2030 · unverified reference",
    description:
      "Tax credit reference supplied in the product brief. The brief indicates first submissions from 1 January 2027. The official page returned HTTP 403 during this build, so current terms and dates could not be independently checked. This is not a cash grant and is not presented as accepting applications.",
    sector: "business investment",
    tags: ["investment", "business", "tax", "employment"],
    sourceUrl: "https://maltaenterprise.com/node/1917",
    verifiedAt: null,
    conditions: [
      {
        label: "Current scheme rules and submission period",
        field: "unknown",
        sourceLocator:
          "Official page inaccessible (403) — independent confirmation required",
      },
      {
        label: "Tax-credit entitlement and eligible expenditure",
        field: "unknown",
        sourceLocator:
          "Official guidance not retrieved — never inferred from relevance",
      },
    ],
  },
];
const conditionSchema = z
  .object({
    label: z.string().max(250),
    field: z.enum(["certificate", "staff", "turnover", "geography", "unknown"]),
    value: z.union([z.string().max(200), z.number().finite()]).optional(),
    sourceLocator: z.string().max(500),
  })
  .superRefine((condition, ctx) => {
    if (
      (condition.field === "staff" || condition.field === "turnover") &&
      (typeof condition.value !== "number" || condition.value < 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "A numeric requirement needs an explicit non-negative threshold.",
        path: ["value"],
      });
    }
    if (
      (condition.field === "certificate" || condition.field === "geography") &&
      (typeof condition.value !== "string" || !condition.value.trim())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "This requirement needs an explicit sourced value.",
        path: ["value"],
      });
    }
  });
/** Official hosts an editor may cite for curated funding references. */
export const OFFICIAL_HOSTS = [
  "fondi.eu",
  "www.fondi.eu",
  "sem.gov.mt",
  "www.sem.gov.mt",
  "maltaenterprise.com",
  "www.maltaenterprise.com",
  "servizz.gov.mt",
  "www.servizz.gov.mt",
];
export const officialUrl = z.url().max(500).refine((s) => {
  const u = new URL(s);
  return (
    u.protocol === "https:" &&
    OFFICIAL_HOSTS.includes(u.hostname) &&
    !u.port &&
    !u.username &&
    !u.password
  );
}, "Use an approved official HTTPS source.");
export const curatedRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,100}$/),
  sourceId: z.string().min(1).max(120),
  source: z.enum(["FONDI", "SEM", "Malta Enterprise", "Servizz"]),
  title: z.string().trim().min(2).max(500),
  buyer: z.string().trim().max(250),
  type: z.enum(["grant", "tax_credit", "loan", "other_incentive"]),
  description: z.string().trim().max(10000),
  sector: z.string().trim().max(100),
  tags: z.array(z.string().trim().max(100)).max(30),
  cpv: z.array(z.string().regex(/^\d{8}$/)).max(30),
  geography: z.literal("Malta"),
  value: z.number().min(0).max(1e10).nullable(),
  deadline: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  fetchedAt: z.iso.datetime(),
  verifiedAt: z.iso.datetime().nullable(),
  sourceUrl: officialUrl,
  sourceVersion: z.string().min(1).max(120),
  status: z.literal("reference"),
  conditions: z.array(conditionSchema).min(1).max(30),
  role: z.array(z.enum(["bidder", "subcontractor", "consortium"])).max(3),
});
export const curatedImportSchema = z.array(curatedRecordSchema).min(1).max(100);
