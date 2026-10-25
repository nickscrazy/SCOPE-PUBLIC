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
  source: "TED" | "FONDI" | "SEM" | "Malta Enterprise" | "Fictional demo";
  title: string;
  buyer: string;
  type: "tender" | "grant" | "tax_credit";
  description: string;
  sector: string;
  tags: string[];
  cpv: string[];
  geography: string;
  value: number | null;
  deadline: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  verifiedAt: string | null;
  sourceUrl: string;
  sourceVersion: string;
  status: "published" | "reference" | "fictional";
  conditions: Condition[];
  role: string[];
  stale?: boolean;
};
export type ConditionResult = Condition & {
  status: "appears_met" | "unmet" | "unknown";
  evidence: string;
};
export type Match = {
  score: number;
  reasons: string[];
  conditions: ConditionResult[];
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
export type Account = {
  id: string;
  email: string;
  plan: "free" | "trial";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialAvailable: boolean;
  analysesUsed: number;
  analysesLimit: number | null;
  savesLimit: number | null;
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
