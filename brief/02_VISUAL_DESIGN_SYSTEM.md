# SCOPE Visual Design & Content System

Creative direction: **editorial Swiss precision meets high-end European fintech**, with one restrained sculptural visual language. Premium, credible, uncluttered and clearly designed by a human. **Avoid generic AI SaaS aesthetics**: no violet/blue blurry gradient blobs, no emoji hero, no default-looking Tailwind cards, no decorative glassmorphism everywhere, no random stock photos, no fake analytics and no giant paragraph walls. Make it confident and beautiful on desktop AND mobile.

## 1. Brand signature
Working brand: `SCOPE` (trademark and domain availability unverified; keep replaceable). Descriptive descriptor: `Business opportunity intelligence`. Tagline: `The right opportunities. Within your reach.` Alternative headline for hero: **`Opportunities. Matched to your ambition.`** Supporting: "Public tenders and funding programmes, filtered through the capabilities of your actual business. Less searching. Better decisions."

Voice: concise, specific, understated, respectful of small-business owners. Never make eligibility guarantees, fake return estimates or suggest official affiliation. UK English, euros, European date conventions. Mention "Malta + EU" accurately and make actual source coverage discoverable. Distinguish tender contract opportunities from conditional grants/tax credits.

## 2. Aesthetic tokens (starting point, refine carefully)
- `--ink:#0B1819` deep green-black, not pure black
- `--forest:#173330` dark secondary
- `--paper:#F6F5F0` warm off-white
- `--cream:#E9E8E0` subtle surface
- `--signal:#C9F878` muted chartreuse accent: use sparingly for CTA, match highlights and selection
- `--aqua:#6CC8B5` secondary data tone, use sparingly
- `--muted:#70817F`, `--line:#D9DED8`
- Follow WCAG AA for text and controls; accent on light background requires dark label.
- Large responsive editorial display type (e.g. Manrope or Instrument Sans if obtainable legally via package, fallback system), restrained companion sans for body (e.g. Inter). Typography should be polished without relying on externally loaded fonts; prefer CSS fallbacks. Never bundle proprietary font binaries.
- 12-column desktop grid; main content max width 1180–1280px; 8px spacing scale; generously spaced sections; consistent 14–18px radii (not everything rounded). Thin rule dividers, precise alignment, elegant hover states.

## 3. Public website composition
NAV: monogram/wordmark left; Product / How it works / Pricing / Explore demo; right-side Log in and high-contrast `Try 7 days free`. Sticky transparent-to-opaque on scroll; accessible mobile menu.
HERO: warm light or dark ink surface, 2-column on desktop; compelling asymmetric heading and small eyebrow "MADE FOR BUSINESSES THAT BUILD". Hero copy max two short sentences; two CTAs. Right side: carefully designed *animated opportunity object*: a restrained stack of tender/grant cards suspended/orbiting subtly, joined by thin connecting lines, with real concepts (profile / match / evidence). Depth through CSS transforms or lightweight Three.js if performance warrants. No meaningless revolving 3D globe. Hero must remain gorgeous as static image/CSS when animations disabled.
TRUST STRIP: no invented customers. Use factual product attributes: "Source-linked", "Built around your business", "Tenders + funding", "Transparent matching" rather than brand badges.
PRODUCT REVEAL: large elegant embedded UI mock-up using real application components / sample data, caption "Illustrative product preview"; no fabricated live opportunities.
THREE STEPS: `Describe your business` / `See your matches` / `Know what to do next` using coherent linework and restrained motion.
FEATURE SPOTLIGHT: one dark full-bleed section showing evidence/provenance, eligibility gap indicators and matching logic. Balanced whitespace.
PRICING: three crisp cards (Free €0, Solo €19/mo, Team €59/mo) labelled "Launch pricing under evaluation" until real payment support; plans must match entitlement logic. Highlight Solo not with gaudy gradient but subtle border/contrast. Free/Trial CTA functional; paid CTA labelled `Request paid access` if payments unavailable.
FAQ: short factual answers incl. "Are you affiliated with Maltese government? No", "Does this guarantee I qualify? No", "Which sources are covered?" with exact source coverage.
FOOTER: no phantom awards, links to source/coverage/privacy, small understated wordmark.

## 4. SaaS visual design
Use a calmer, highly legible **product** variant of the marketing system. Left sidebar (desktop) and compact mobile navigation. Primary layout: opportunities list and a right-hand inspector on desktop, stacked detail flow on mobile. Cards have realistic metadata hierarchy: title, institution, category, deadline, scope, indicative fit, available evidence status, saved state. Fit chip must be labelled `Relevance` not `Eligibility score`.
Opportunity detail should use a split `Why this fits` / `What remains unverified` model with requirement status and citations. Use native controls, ample focus states, clear loading/empty/error states. Data provenance view must show source name, original external link, published date if known, last fetched/verified, and freshness warning.
Onboarding: 4–5 lightweight steps with progress indicator, editable later. Allow skip of unknown financial/credential fields (resulting eligibility = unknown, not false). Include sample inputs in non-production demo only.

## 5. Motion and polish requirements
- Subtle 3D hero object: low-motion parallax/orbit and floating document corners, not a resource-intensive cinematic sequence; target smooth 60fps on capable hardware and minimal CPU when idle. Progressive enhancement, no blocker if WebGL unavailable. Prefer CSS/Framer Motion only if worth dependency; be intentional.
- 150–250ms purposeful microtransitions; respects `prefers-reduced-motion`, reduced-data and touch interactions. Disable 3D in low-power / narrow layouts if needed.
- Responsive: test 360px, 768px, 1024px and 1440px at minimum. No sideways scrolling, broken overlap or tiny tap targets.
- Accessibility: semantic landmarks, keyboard nav, visible focus, contrast, form labels, errors in text, no inaccessible animated-only explanations.

## 6. Non-negotiable design anti-patterns
No fake quotes/testimonials, fake logos, made-up market metrics or money-savings percentages. No cluttered dashboard on hero. No random icon on every line. No oversaturated colors; no purple gradient haze. Don't imitate or reproduce a competitor page. Don't add animations if they cause layout shifts, regressions, inaccessible content or mobile performance issues. A visual component must clarify the product's value or be removed.

## 7. Design acceptance
The homepage should be credible to a Maltese SME owner on first view: recognisable product purpose in five seconds, visible differentiator, confident visual system, clear and functional exploration/try CTA. The application should look consistent with it rather than like a separately generated admin template. Save screenshot artifacts if environment permits real headless capture; do not claim visual review unless screenshots or rendered checks were actually inspected.
