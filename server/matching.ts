import type {
  Profile,
  Opportunity,
  Match,
  ConditionResult,
  Dimension,
} from "../src/domain.js";
import { closedLifecycles } from "../src/domain.js";

/**
 * Deterministic, explainable matching. Four separate questions are answered separately:
 *  - relevance (0–100): how closely the subject matches the declared business;
 *  - eligibility: explicit source conditions as appears_met / unmet / unknown;
 *  - financial suitability: value against preferences and declared turnover band;
 *  - delivery capacity: declared capacity against explicit staffing conditions.
 * Relevance is never eligibility, and unknown is never treated as met.
 */
export const WEIGHTS = {
  serviceTerm: 12,
  serviceCap: 30,
  cpv: 20,
  sector: 15,
  geography: 10,
  value: 10,
  credentialSubject: 5,
  credentialRequired: 5,
  role: 5,
  experience: 5,
  outsideInterest: 0.35,
  closed: 0.5,
  olderPublication: 0.85,
} as const;

const stopWords = new Set(
  "and the for with that this from into our your their are was were have has not can will its you which than any all only more such using work services service provision supply works other various general".split(
    " ",
  ),
);
/** Conservative English suffix stripping: plurals and common verb forms only. */
export function stem(t: string) {
  if (t.length > 5 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 5 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 4 && /(ss|x|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !stopWords.has(t))
      .map(stem),
  );

/**
 * Service vocabulary → Common Procurement Vocabulary (CPV) prefixes, from the official
 * CPV 2008 classification (Regulation (EC) No 213/2008). Keys match token prefixes.
 * A classification match is stronger evidence of subject fit than free-text overlap.
 */
export const CPV_LEXICON: Record<string, string[]> = {
  software: ["72", "48"],
  web: ["72"],
  website: ["72"],
  app: ["72", "48"],
  digital: ["72"],
  cybersecurity: ["72"],
  database: ["72"],
  data: ["72"],
  hosting: ["72"],
  research: ["73"],
  policy: ["73", "794"],
  consult: ["794", "713"],
  advisory: ["794"],
  management: ["794"],
  marketing: ["7934"],
  advertis: ["7934"],
  communication: ["7934", "7941"],
  "public relation": ["7941"],
  translat: ["7953"],
  interpret: ["7954"],
  legal: ["791"],
  account: ["792"],
  audit: ["792"],
  bookkeep: ["792"],
  payroll: ["792"],
  training: ["805"],
  train: ["805"],
  education: ["80"],
  cater: ["555"],
  food: ["15", "555"],
  restaurant: ["555"],
  clean: ["909"],
  construct: ["45"],
  build: ["45"],
  renovat: ["454"],
  architect: ["712"],
  engineer: ["713"],
  survey: ["7135"],
  graphic: ["7982"],
  design: ["7982", "712"],
  print: ["798"],
  event: ["7995"],
  conference: ["7995", "5512"],
  photograph: ["7996"],
  video: ["921", "7996"],
  film: ["921"],
  transport: ["60"],
  logistic: ["60", "634"],
  courier: ["641"],
  maintenance: ["50"],
  repair: ["50"],
  electric: ["4531", "31"],
  plumb: ["4533"],
  landscap: ["7731"],
  garden: ["7731"],
  security: ["7971"],
  medical: ["33", "85"],
  health: ["85", "33"],
  pharmac: ["336"],
  furniture: ["391"],
  vehicle: ["341"],
  waste: ["905"],
  environment: ["907", "905"],
  energy: ["0931", "0933", "713"],
  solar: ["0933"],
  telecom: ["642", "322"],
  insurance: ["665"],
  recruit: ["796"],
  staffing: ["796"],
  stationery: ["301"],
  office: ["301"],
  computer: ["302", "72"],
  hardware: ["302"],
  laboratory: ["38", "331"],
};
export function cpvPrefixesFor(services: string[]): string[] {
  const words = services
    .flatMap((s) => s.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean);
  const phrases = services.map((s) => s.toLowerCase());
  const out = new Set<string>();
  for (const [key, prefixes] of Object.entries(CPV_LEXICON)) {
    const hit = key.includes(" ")
      ? phrases.some((p) => p.includes(key))
      : words.some((w) => w.startsWith(key));
    if (hit) prefixes.forEach((p) => out.add(p));
  }
  return [...out];
}

// Turnover bands from the profile (EUR per year).
const bands: Record<string, [number, number]> = {
  under50k: [0, 49999],
  "50k-250k": [50000, 249999],
  "250k-1m": [250000, 999999],
  "1m-5m": [1000000, 4999999],
  over5m: [5000000, Infinity],
};
const euro = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");

export function matchOpportunity(
  p: Profile,
  o: Opportunity,
  now = new Date(),
): Match {
  const hay = tokens([o.title, o.description, ...o.tags].join(" "));
  const services = [
    ...new Set(p.services.flatMap((s) => [...tokens(s)])),
  ].filter((t) => hay.has(t));
  const serviceCpv = cpvPrefixesFor(p.services);
  const cpvHits = o.cpv.filter((code) =>
    serviceCpv.some((prefix) => code.startsWith(prefix)),
  );
  const sector = p.sectors.some(
    (s) =>
      !!s.trim() &&
      (o.sector.toLowerCase().includes(s.toLowerCase()) ||
        o.tags.some((t) => t.toLowerCase() === s.toLowerCase())),
  );
  const geo =
    p.geographies.includes(o.geography as "Malta" | "EU") ||
    (o.geography === "Malta" && p.geographies.includes("EU"));
  const inValue =
    o.value !== null && o.value >= p.minValue && o.value <= p.maxValue;
  const today = now.toISOString().slice(0, 10);
  const current = p.qualifications.filter(
    (q) =>
      (!q.expiresAt || q.expiresAt >= today) &&
      (!q.acquiredAt || q.acquiredAt <= today),
  );
  const qualified = current.some((q) =>
    [...tokens(q.name)].some((t) => hay.has(t)),
  );
  const requiredCredential = current.some((q) =>
    o.conditions.some(
      (c) =>
        c.field === "certificate" &&
        String(c.value).toLowerCase() === q.name.toLowerCase(),
    ),
  );
  const project = [...tokens(p.projects + " " + p.experience)].some((t) =>
    hay.has(t),
  );
  const W = WEIGHTS;
  let score =
    Math.min(W.serviceCap, services.length * W.serviceTerm) +
    (cpvHits.length ? W.cpv : 0) +
    (sector ? W.sector : 0) +
    (geo ? W.geography : 0) +
    (inValue ? W.value : 0) +
    (o.role.includes(p.role) ? W.role : 0) +
    (qualified ? W.credentialSubject : 0) +
    (requiredCredential ? W.credentialRequired : 0) +
    (project ? W.experience : 0);
  const outsideInterest =
    (p.interests === "tenders" && o.type !== "tender") ||
    (p.interests === "grants" && o.type === "tender");
  if (outsideInterest) score = Math.round(score * W.outsideInterest);
  // Every lot must have closed before the subject is treated as past; a single open lot keeps
  // the record actionable and undiscounted.
  const deadlinePassed = currentLifecycle(o, now) === "deadline_passed";
  const closed =
    deadlinePassed ||
    (!!o.lifecycle && closedLifecycles.includes(o.lifecycle));
  const olderPublication =
    !!o.publishedAt &&
    now.getTime() - new Date(o.publishedAt).getTime() > 90 * 86400000;
  if (closed) score = Math.round(score * W.closed);
  if (olderPublication) score = Math.round(score * W.olderPublication);
  const reasons = [
    services.length
      ? `Service overlap: ${services.join(", ")}.`
      : "No direct service overlap found.",
    cpvHits.length
      ? `Procurement classification (CPV ${cpvHits.slice(0, 3).join(", ")}) corresponds to your services.`
      : "",
    sector ? "Your sector aligns with the record." : "",
    geo ? "Within your preferred geography." : "",
    inValue
      ? "Published value is within your preferred range."
      : o.value === null
        ? "Contract or aid value is not established."
        : "Published value falls outside your preferred range.",
    qualified ? "A current profile qualification relates to this subject." : "",
    project ? "Your experience contains related subject terms." : "",
    outsideInterest ? "Outside the opportunity types you asked for." : "",
    o.lifecycle === "result_published"
      ? "A result notice has been published for this procedure."
      : o.lifecycle === "superseded"
        ? "A later notice replaces this one."
        : deadlinePassed
          ? "The published deadline has passed; check for amendments."
          : "",
    olderPublication ? "The notice was published more than 90 days ago." : "",
  ].filter(Boolean);

  const conditions: ConditionResult[] = o.conditions.map((c) => {
    let status: ConditionResult["status"] = "unknown",
      evidence =
        "Not established by the available source and profile. Check the original terms.";
    if (
      c.field === "certificate" &&
      typeof c.value === "string" &&
      c.value.trim()
    ) {
      const q = p.qualifications.find(
        (q) => q.name.toLowerCase() === String(c.value).toLowerCase(),
      );
      if (q) {
        const expired = !!q.expiresAt && q.expiresAt < today;
        const future = !!q.acquiredAt && q.acquiredAt > today;
        status = expired || future ? "unmet" : "appears_met";
        evidence = expired
          ? `Your ${q.name} expired on ${q.expiresAt}.`
          : future
            ? `Your ${q.name} begins on ${q.acquiredAt}, after today.`
            : `You declared ${q.name}; documentary verification is still required.`;
      } else
        evidence = `${c.value} is not recorded in your profile. Absence is not proof you lack it.`;
    } else if (
      c.field === "staff" &&
      p.staff !== null &&
      typeof c.value === "number" &&
      Number.isFinite(c.value) &&
      c.value >= 0
    ) {
      status = p.staff >= Number(c.value) ? "appears_met" : "unmet";
      evidence = `Your declared team: ${p.staff}; source minimum: ${c.value}.`;
    } else if (
      c.field === "turnover" &&
      p.turnover !== "unknown" &&
      typeof c.value === "number" &&
      Number.isFinite(c.value) &&
      c.value >= 0
    ) {
      const [min, max] = bands[p.turnover];
      status =
        min >= Number(c.value)
          ? "appears_met"
          : max < Number(c.value)
            ? "unmet"
            : "unknown";
      evidence = `Declared turnover band: ${p.turnover}; threshold: ${euro(Number(c.value))}.`;
    } else if (c.field === "geography") {
      evidence =
        "Your geographic preference does not prove legal establishment. Applicant location needs verification.";
    }
    return { ...c, status, evidence };
  });

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
    conditions,
    dimensions: {
      eligibility: eligibilityDimension(conditions),
      financial: financialDimension(p, o),
      capacity: capacityDimension(p, conditions),
    },
  };
}

function eligibilityDimension(
  conditions: ConditionResult[],
): Match["dimensions"]["eligibility"] {
  const met = conditions.filter((c) => c.status === "appears_met").length,
    unmet = conditions.filter((c) => c.status === "unmet").length,
    unknown = conditions.filter((c) => c.status === "unknown").length;
  if (unmet)
    return {
      status: "blocker",
      summary: `${unmet} known blocker${unmet > 1 ? "s" : ""}`,
      notes: conditions
        .filter((c) => c.status === "unmet")
        .map((c) => `${c.label}: ${c.evidence}`),
      met,
      unmet,
      unknown,
    };
  if (unknown)
    return {
      status: "unknown",
      summary: `${unknown} condition${unknown > 1 ? "s" : ""} to confirm`,
      notes: [
        "No known blockers, but eligibility is not established until every mandatory condition is confirmed against the original terms.",
      ],
      met,
      unmet,
      unknown,
    };
  return {
    status: conditions.length ? "positive" : "unknown",
    summary: conditions.length
      ? "Listed conditions appear met"
      : "No conditions extracted",
    notes: [
      "Based on self-declared profile facts and the conditions extracted here. Original documents may contain further requirements.",
    ],
    met,
    unmet,
    unknown,
  };
}

function financialDimension(p: Profile, o: Opportunity): Dimension {
  if (o.type !== "tender")
    return {
      status: "unknown",
      summary: "Aid terms need confirmation",
      notes: [
        "Co-financing rates, aid ceilings, de minimis history and eligible costs are not assessed for this company.",
      ],
    };
  if (o.value === null)
    return {
      status: "unknown",
      summary: "Contract value not published",
      notes: ["The source does not state an estimated value in euro."],
    };
  const notes: string[] = [];
  let status: Dimension["status"] = "positive";
  if (o.value < p.minValue || o.value > p.maxValue) {
    status = "caution";
    notes.push(
      `Estimated value ${euro(o.value)} is outside your preferred range (${euro(p.minValue)}–${euro(p.maxValue)}).`,
    );
  } else
    notes.push(
      `Estimated value ${euro(o.value)} is within your preferred range.`,
    );
  // Directive 2014/24/EU Art. 58(3): a minimum yearly turnover requirement shall not
  // normally exceed twice the estimated contract value.
  const ceiling = o.value * 2;
  if (p.turnover === "unknown")
    notes.push(
      `Turnover band not declared. A buyer may normally require annual turnover of up to ${euro(ceiling)} (twice the value, Directive 2014/24/EU Art. 58(3)).`,
    );
  else {
    const [min, max] = bands[p.turnover];
    if (min >= ceiling)
      notes.push(
        `Your turnover band exceeds the ${euro(ceiling)} a buyer may normally require.`,
      );
    else if (max < ceiling) {
      if (status === "positive") status = "caution";
      notes.push(
        `A buyer may normally require annual turnover of up to ${euro(ceiling)}; your declared band is below that. Check the actual financial standing requirement.`,
      );
    } else
      notes.push(
        `Your turnover band may or may not reach a turnover requirement of up to ${euro(ceiling)}; check the documents.`,
      );
  }
  return {
    status,
    summary:
      status === "positive" ? "Value fits your range" : "Financial fit to check",
    notes,
  };
}

function capacityDimension(
  p: Profile,
  conditions: ConditionResult[],
): Dimension {
  const staff = conditions.filter((c) => c.field === "staff");
  if (staff.some((c) => c.status === "unmet"))
    return {
      status: "blocker",
      summary: "Staffing requirement not met",
      notes: staff.map((c) => c.evidence),
    };
  if (staff.some((c) => c.status === "appears_met"))
    return {
      status: "positive",
      summary: "Stated staffing appears met",
      notes: staff.map((c) => c.evidence),
    };
  if (p.capacity === 0)
    return {
      status: "caution",
      summary: "No available capacity declared",
      notes: [
        "You declared no available full-time capacity. Update your profile if this has changed.",
      ],
    };
  return {
    status: "unknown",
    summary: "Not assessed",
    notes: [
      p.capacity !== null || p.staff !== null
        ? `Declared: ${p.staff ?? "unknown"} staff, ${p.contractors ?? "unknown"} contractors, ${p.capacity ?? "unknown"} FTE available. The source states no staffing requirement to compare against.`
        : "Add staff and capacity to your profile. The source states no staffing requirement to compare against.",
    ],
  };
}

/** `o.stale` is set by the caller from source health (e.g. last successful TED sync). */
export function freshness(o: Opportunity, now = new Date()): string {
  if (o.status === "fictional") return "Fictional demonstration";
  if (o.lifecycle === "superseded") return "Replaced by a later notice";
  if (o.lifecycle === "result_published")
    return "Result published · procedure closed";
  if (currentLifecycle(o, now) === "deadline_passed")
    return o.lotDeadlines && o.lotDeadlines.length > 1
      ? "Every lot deadline has passed"
      : "Submission deadline has passed";
  if (o.stale) return "Source refresh overdue · cached record";
  if (!o.verifiedAt) return "Status requires confirmation";
  if (o.type === "tender") return "Published notice · verify current documents";
  if (o.reviewDueAt && new Date(o.reviewDueAt) < now)
    return "Editorial re-verification overdue";
  if (now.getTime() - new Date(o.verifiedAt).getTime() > 7 * 86400000)
    return "Source check is over 7 days old";
  return "Reference checked · opening status unconfirmed";
}

/**
 * The deadline a customer should act on, resolved at read time.
 * With several lot deadlines it is the next one still open; once they have all passed it is
 * the last of them, so a closed record states when it actually closed.
 */
export function effectiveDeadline(
  o: Opportunity,
  now = new Date(),
): string | null {
  const lots = o.lotDeadlines;
  if (!lots?.length) return o.deadline;
  const next = lots.find((d) => new Date(d) > now);
  return next ?? lots[lots.length - 1];
}

/**
 * Lifecycle as seen at read time: a stored state plus the deadline clock.
 *
 * A record with lots is open while any lot is still open. It is only closed once every lot
 * has passed **and** every lot entry was readable — an incomplete set stays `unknown`, because
 * a lot we failed to parse could still be open. `unknown` is never reported as open.
 */
export function currentLifecycle(o: Opportunity, now = new Date()) {
  if (o.lifecycle === "superseded" || o.lifecycle === "result_published")
    return o.lifecycle;
  const lots = o.lotDeadlines;
  if (lots?.length) {
    if (lots.some((d) => new Date(d) > now)) return "open" as const;
    return o.deadlinesComplete === false
      ? ("unknown" as const)
      : ("deadline_passed" as const);
  }
  if (o.deadline) return new Date(o.deadline) < now ? "deadline_passed" : "open";
  return "unknown" as const;
}
