import type {
  Profile,
  Opportunity,
  Match,
  ConditionResult,
} from "../src/domain.js";
const stopWords = new Set([
  "and",
  "the",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "our",
  "your",
  "their",
  "are",
  "was",
  "were",
  "have",
  "has",
  "not",
  "can",
  "will",
  "its",
  "you",
  "which",
  "than",
  "any",
  "all",
  "only",
  "more",
  "such",
  "using",
  "work",
]);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !stopWords.has(t)),
  );
export function matchOpportunity(
  p: Profile,
  o: Opportunity,
  now = new Date(),
): Match {
  const hay = tokens([o.title, o.description, ...o.tags, ...o.cpv].join(" "));
  const services = [
    ...new Set(p.services.flatMap((s) => [...tokens(s)])),
  ].filter((t) => hay.has(t));
  const sector = p.sectors.some(
    (s) =>
      o.sector.toLowerCase().includes(s.toLowerCase()) ||
      o.tags.some((t) => t.toLowerCase() === s.toLowerCase()),
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
  const credentialPoints = (qualified ? 5 : 0) + (requiredCredential ? 5 : 0);
  const project = [...tokens(p.projects + " " + p.experience)].some((t) =>
    hay.has(t),
  );
  let score =
    Math.min(35, services.length * 12) +
    (sector ? 20 : 0) +
    (geo ? 15 : 0) +
    (inValue ? 10 : 0) +
    (o.role.includes(p.role) ? 5 : 0) +
    credentialPoints +
    (project ? 5 : 0);
  if (
    (p.interests === "tenders" && o.type !== "tender") ||
    (p.interests === "grants" && o.type === "tender")
  )
    score = Math.round(score * 0.35);
  const deadlinePassed = !!o.deadline && new Date(o.deadline) < now;
  const olderPublication =
    !!o.publishedAt &&
    now.getTime() - new Date(o.publishedAt).getTime() > 90 * 86400000;
  if (deadlinePassed) score = Math.round(score * 0.5);
  if (olderPublication) score = Math.round(score * 0.85);
  const reasons = [
    services.length
      ? `Service overlap: ${services.join(", ")}.`
      : "No direct service overlap found.",
    sector ? "Your sector aligns with the notice." : "",
    geo ? "Within your preferred geography." : "",
    inValue
      ? "Published value is within your preferred range."
      : o.value === null
        ? "Contract or aid value is not established."
        : "Published value falls outside your preferred range.",
    qualified ? "A current profile qualification relates to this subject." : "",
    project ? "Your experience contains related subject terms." : "",
    deadlinePassed
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
      const bands: Record<string, [number, number]> = {
        under50k: [0, 49999],
        "50k-250k": [50000, 249999],
        "250k-1m": [250000, 999999],
        "1m-5m": [1000000, 4999999],
        over5m: [5000000, Infinity],
      };
      const [min, max] = bands[p.turnover];
      status =
        min >= Number(c.value)
          ? "appears_met"
          : max < Number(c.value)
            ? "unmet"
            : "unknown";
      evidence = `Declared turnover band: ${p.turnover}; threshold: €${Number(c.value).toLocaleString("en-GB")}.`;
    } else if (c.field === "geography") {
      evidence =
        "Your geographic preference does not prove legal establishment. Applicant location needs verification.";
    }
    return { ...c, status, evidence };
  });
  return { score: Math.max(0, Math.min(100, score)), reasons, conditions };
}
export function freshness(o: Opportunity, now = new Date()): string {
  if (o.status === "fictional") return "Fictional demonstration";
  if (o.stale) return "Latest sync failed · cached record";
  if (!o.verifiedAt) return "Status requires confirmation";
  if (now.getTime() - new Date(o.verifiedAt).getTime() > 7 * 86400000)
    return "Source check is over 7 days old";
  return o.type === "tender"
    ? "Published notice · verify current documents"
    : "Reference checked · opening status unconfirmed";
}
