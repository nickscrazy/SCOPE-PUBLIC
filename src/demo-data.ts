import type { Opportunity } from "./domain";
const base = {
  source: "Fictional demo" as const,
  sourceUrl: "/demo",
  sourceVersion: "demo-v1",
  status: "fictional" as const,
  fetchedAt: "2026-10-25T00:00:00.000Z",
  verifiedAt: null,
  publishedAt: null,
  cpv: [],
  role: ["bidder", "subcontractor", "consortium"],
  geography: "Malta",
  deadline: null,
};
export const demoOpportunities: Opportunity[] = [
  {
    ...base,
    id: "demo-research",
    sourceId: "demo-research",
    title: "Research that shapes better places",
    buyer: "Fictional regional development agency",
    type: "tender",
    description:
      "An illustrative commission for research, policy analysis and stakeholder consultation. This is a fictional example, not an open procurement.",
    sector: "research",
    tags: ["research", "policy", "analysis", "ISO 9001", "Research methods"],
    value: 35000,
    conditions: [
      {
        label: "ISO 9001 quality certification",
        field: "certificate",
        value: "ISO 9001",
        sourceLocator: "Fictional demonstration · requirement 1",
      },
      {
        label: "At least 2 permanent staff",
        field: "staff",
        value: 2,
        sourceLocator: "Fictional demonstration · requirement 2",
      },
    ],
  },
  {
    ...base,
    id: "demo-catering",
    sourceId: "demo-catering",
    title: "Local food. A wider audience.",
    buyer: "Fictional cultural institution",
    type: "tender",
    description:
      "Illustrative catering and food services for a community events programme. No actual buyer or application.",
    sector: "hospitality",
    tags: ["catering", "food", "hospitality", "services"],
    value: 22000,
    conditions: [
      {
        label: "Food handling certification",
        field: "certificate",
        value: "Food handling",
        sourceLocator: "Fictional demonstration · requirement 1",
      },
      {
        label: "At least 5 staff",
        field: "staff",
        value: 5,
        sourceLocator: "Fictional demonstration · requirement 2",
      },
    ],
  },
  {
    ...base,
    id: "demo-digital",
    sourceId: "demo-digital",
    title: "A more digital next chapter",
    buyer: "Fictional business support programme",
    type: "grant",
    description:
      "An invented investment support example. Co-financing, eligible costs and aid history must be checked; it is not a funding offer.",
    sector: "digital",
    tags: ["digital", "technology", "research"],
    value: null,
    conditions: [
      {
        label: "Co-financing and eligible expenditure",
        field: "unknown",
        sourceLocator: "Fictional demonstration · unassessed programme terms",
      },
    ],
  },
];
