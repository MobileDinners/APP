/**
 * Claims filter — spec §4.5.
 *
 * Every string that reaches a guest-facing page passes through here first.
 * It is deterministic and rule-based on purpose: a model that *usually* catches
 * an allergen claim is not a safety control, and this is the one place in the
 * product where a mistake can put someone in hospital.
 *
 * Two severities:
 *   block — publishing is refused. Allergen and health claims live here because
 *           a restaurant cannot verify them from a menu database, and a guest
 *           with celiac disease will believe the website.
 *   warn  — allowed, but surfaced. Origin claims and superlatives are legal
 *           exposure rather than physical risk, and are often true; the
 *           operator just has to own them deliberately.
 *
 * Nothing here is silently rewritten. Blocked spans are shown to the operator
 * with the reason, because quietly deleting a word teaches nobody anything.
 */

export type ClaimSeverity = "block" | "warn";

export type ClaimCategory =
  | "allergen"
  | "health"
  | "origin"
  | "superlative"
  | "guarantee";

export type ClaimFinding = {
  severity: ClaimSeverity;
  category: ClaimCategory;
  /** The exact text that matched, as written. */
  matched: string;
  field: string;
  reason: string;
};

type Rule = {
  pattern: RegExp;
  severity: ClaimSeverity;
  category: ClaimCategory;
  reason: string;
};

const RULES: Rule[] = [
  // ---- allergen: blocked outright -------------------------------------
  {
    pattern: /\b(gluten|nut|peanut|dairy|lactose|soy|egg|shellfish|sesame|allergen)[\s-]?free\b/gi,
    severity: "block",
    category: "allergen",
    reason:
      "An allergen claim on a website is relied on by people who get seriously ill if it is wrong, and it cannot be verified from menu data. It has to come from the kitchen, in writing.",
  },
  {
    pattern: /\b(safe for (celiacs?|coeliacs?|allergy sufferers)|celiac[\s-]?safe|hypoallergenic)\b/gi,
    severity: "block",
    category: "allergen",
    reason: "A safety guarantee about allergies cannot be made on the restaurant's behalf.",
  },
  {
    pattern: /\bno (traces? of |cross[\s-]?contamination)\b/gi,
    severity: "block",
    category: "allergen",
    reason:
      "Cross-contamination claims describe kitchen procedure, which this system has no knowledge of.",
  },

  // ---- health: blocked -------------------------------------------------
  {
    pattern: /\b(cures?|treats?|prevents?|heals?) (cancer|diabetes|disease|illness|covid)\b/gi,
    severity: "block",
    category: "health",
    reason: "Medical claims about food are unlawful in most jurisdictions.",
  },
  {
    pattern: /\b(boosts? (your )?immun\w+|detox(ifying|ify|es)?|anti[\s-]?inflammatory|weight[\s-]?loss|fat[\s-]?burning)\b/gi,
    severity: "block",
    category: "health",
    reason: "Health-benefit claims require substantiation the restaurant has not provided.",
  },
  {
    pattern: /\b(low[\s-]?(fat|calorie|carb|sodium)|fat[\s-]?free|sugar[\s-]?free|zero[\s-]?calorie|keto[\s-]?friendly|diabetic[\s-]?friendly)\b/gi,
    severity: "block",
    category: "health",
    reason:
      "Nutrient-content claims are regulated and need real per-serving analysis, not a description.",
  },

  // ---- origin and production: warn ------------------------------------
  {
    pattern: /\b(locally[\s-]?sourced|farm[\s-]?to[\s-]?table|locally[\s-]?grown|from local farms)\b/gi,
    severity: "warn",
    category: "origin",
    reason: "Sourcing claim. Fine if true, but the restaurant should be able to evidence it.",
  },
  {
    pattern: /\b(organic|grass[\s-]?fed|free[\s-]?range|wild[\s-]?caught|cage[\s-]?free|pasture[\s-]?raised|non[\s-]?gmo|sustainably (sourced|caught))\b/gi,
    severity: "warn",
    category: "origin",
    reason:
      "Certification-style wording. Several of these are legally defined terms with paperwork behind them.",
  },
  {
    pattern: /\b(halal|kosher)\b/gi,
    severity: "warn",
    category: "origin",
    reason: "Religious dietary certification is issued by a body, not asserted by a website.",
  },

  // ---- superlatives and guarantees: warn ------------------------------
  {
    pattern: /\b(best|greatest|finest|#\s?1|number one|top[\s-]?rated) (in|of) (town|the (city|world|country|state)|[A-Z][a-z]+)\b/gi,
    severity: "warn",
    category: "superlative",
    reason: "A comparative claim a competitor could challenge. Usually not worth the risk.",
  },
  {
    pattern: /\b(award[\s-]?winning|world[\s-]?famous|voted best|michelin)\b/gi,
    severity: "warn",
    category: "superlative",
    reason: "Names a distinction. Only publish it if the award actually exists and can be cited.",
  },
  {
    pattern: /\b(guarantee[ds]?|100%\s?(satisfaction|guaranteed)|money[\s-]?back)\b/gi,
    severity: "warn",
    category: "guarantee",
    reason: "A guarantee on a public page can be enforceable. Make sure it is one you will honour.",
  },
];

/** Scans one field. Returns every finding, deduplicated by matched text. */
export function scanField(field: string, text: string): ClaimFinding[] {
  if (!text) return [];
  const found: ClaimFinding[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    // Regexes are global, so reset lastIndex between fields.
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const key = `${rule.category}:${m[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        severity: rule.severity,
        category: rule.category,
        matched: m[0],
        field,
        reason: rule.reason,
      });
    }
  }
  return found;
}

export type ClaimReport = {
  findings: ClaimFinding[];
  blocked: number;
  warnings: number;
  /** Publishing is refused while this is false. */
  publishable: boolean;
};

export function scan(fields: Record<string, string>): ClaimReport {
  const findings = Object.entries(fields).flatMap(([field, text]) =>
    scanField(field, text ?? ""),
  );
  const blocked = findings.filter((f) => f.severity === "block").length;
  return {
    findings,
    blocked,
    warnings: findings.length - blocked,
    publishable: blocked === 0,
  };
}
