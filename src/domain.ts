import { z } from "zod";
export const profileSchema = z
  .object({
    companyName: z.string().trim().min(2).max(120),
    services: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    sectors: z.array(z.string().trim().max(80)).max(15),
    experience: z.string().trim().max(3000),
    projects: z.string().trim().max(3000),
    qualifications: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          acquiredAt: z.string().date().nullable(),
          expiresAt: z.string().date().nullable(),
        }),
      )
      .max(20),
    staff: z.number().int().min(0).max(10000).nullable(),
    contractors: z.number().int().min(0).max(10000).nullable(),
    capacity: z.number().min(0).max(10000).nullable(),
    turnover: z.enum([
      "unknown",
      "under50k",
      "50k-250k",
      "250k-1m",
      "1m-5m",
      "over5m",
    ]),
    geographies: z.array(z.enum(["Malta", "EU"])).min(1),
    minValue: z.number().min(0).max(1e10),
    maxValue: z.number().min(0).max(1e10),
    role: z.enum(["bidder", "subcontractor", "consortium"]),
    interests: z.enum(["both", "tenders", "grants"]),
  })
  .refine((p) => p.maxValue >= p.minValue, {
    message: "Maximum value must be at least the minimum.",
    path: ["maxValue"],
  });
export type Profile = z.infer<typeof profileSchema>;
export type Condition = {
  label: string;
  field: "certificate" | "staff" | "turnover" | "geography" | "unknown";
  value?: string | number;
  sourceLocator: string;
};
export type Opportunity = {
  id: string;
  sourceId: string;
  source:
    | "TED"
    | "FONDI"
    | "SEM"
    | "Malta Enterprise"
    | "Servizz"
    | "Fictional demo";
  title: string;
  buyer: string;
  type: OpportunityType;
  description: string;
  sector: string;
  tags: string[];
  cpv: string[];
  geography: string;
  value: number | null;
  /**
   * The notice-wide closing instant, when every lot shares one. Records whose lots close at
   * different times leave this null and carry `lotDeadlines`; the deadline the customer sees
   * is resolved at read time so a stored value cannot go stale.
   */
  deadline: string | null;
  /** Every distinct lot closing instant stated by the source, ascending. */
  lotDeadlines?: string[];
  /** How many lots the source listed a deadline for, before de-duplication. */
  lotCount?: number;
  /** False when a lot entry could not be read, so closure must not be inferred. */
  deadlinesComplete?: boolean;
  /** True when a closing instant was derived from a date with no stated time. */
  deadlineApproximate?: boolean;
  publishedAt: string | null;
  fetchedAt: string;
  verifiedAt: string | null;
  sourceUrl: string;
  sourceVersion: string;
  status: "published" | "reference" | "fictional";
  conditions: Condition[];
  role: string[];
  stale?: boolean;
  /** TED procedure identity shared by a notice and its changes and results. */
  procedureId?: string | null;
  documentsUrl?: string | null;
  lifecycle?: Lifecycle;
  supersededBy?: string | null;
  reviewDueAt?: string | null;
};
export const opportunityTypes = [
  "tender",
  "grant",
  "tax_credit",
  "loan",
  "other_incentive",
] as const;
export type OpportunityType = (typeof opportunityTypes)[number];
export const typeLabels: Record<OpportunityType, string> = {
  tender: "Public tender",
  grant: "Grant",
  tax_credit: "Tax credit",
  loan: "Loan or guarantee",
  other_incentive: "Other incentive",
};
/**
 * open: a deadline is known and in the future.
 * deadline_passed: the known deadline has passed.
 * result_published: TED has published a result notice for the same procedure.
 * superseded: a later notice (e.g. a change notice) replaces this one.
 * unknown: status cannot be established from the source.
 */
export type Lifecycle =
  | "open"
  | "deadline_passed"
  | "result_published"
  | "superseded"
  | "unknown";
export const closedLifecycles: Lifecycle[] = [
  "deadline_passed",
  "result_published",
  "superseded",
];
export type ConditionResult = Condition & {
  status: "appears_met" | "unmet" | "unknown";
  evidence: string;
};
export type DimensionStatus = "positive" | "caution" | "blocker" | "unknown";
export type Dimension = {
  status: DimensionStatus;
  summary: string;
  notes: string[];
};
export type Match = {
  /** Relevance only: how closely the subject matches the profile. Never eligibility. */
  score: number;
  reasons: string[];
  conditions: ConditionResult[];
  dimensions: {
    eligibility: Dimension & { met: number; unmet: number; unknown: number };
    financial: Dimension;
    capacity: Dimension;
  };
};
export type Ranked = Opportunity & {
  match: Match;
  saved: boolean;
  freshness: string;
};
export type OpportunitySummary = Omit<
  Ranked,
  "conditions" | "match" | "role"
> & {
  match: Pick<Match, "score" | "reasons">;
};
export type Role = "user" | "editor" | "reviewer" | "admin";
export type Account = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  plan: "free" | "trial" | "solo";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialAvailable: boolean;
  analysesUsed: number;
  analysesLimit: number | null;
  savesLimit: number | null;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  trialPending: boolean;
};
export type PublicConfig = {
  billingEnabled: boolean;
  soloPriceLabel: string;
  emailDelivery: boolean;
  legal: {
    configured: boolean;
    reviewed: boolean;
    operatorName: string | null;
    operatorAddress: string | null;
    contactEmail: string | null;
  };
  incident: { title: string; message: string; severity: string } | null;
};
export const emptyProfile: Profile = {
  companyName: "",
  services: [],
  sectors: [],
  experience: "",
  projects: "",
  qualifications: [],
  staff: null,
  contractors: null,
  capacity: null,
  turnover: "unknown",
  geographies: ["Malta", "EU"],
  minValue: 5000,
  maxValue: 50000,
  role: "bidder",
  interests: "both",
};
export const researchProfile: Profile = {
  ...emptyProfile,
  companyName: "Studio Forma · fictional business",
  services: ["research", "policy analysis"],
  sectors: ["research"],
  qualifications: [
    { name: "Research methods", acquiredAt: null, expiresAt: null },
  ],
  staff: 3,
  capacity: 2,
};
export const restaurantProfile: Profile = {
  ...emptyProfile,
  companyName: "Table Eight · fictional business",
  services: ["catering", "food services"],
  sectors: ["hospitality"],
  staff: 8,
  capacity: 4,
};
