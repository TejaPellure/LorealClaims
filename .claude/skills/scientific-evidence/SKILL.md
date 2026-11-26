---
name: scientific-evidence
description: Evidence provenance, ingredient vs finished-product evidence, assessment rules, assessment rules and prohibited assumptions for cosmetic claim substantiation. Use when editing the assessment engine, prompts, scoring, evidence data, or writing any scientific text in this project.
---

# Scientific evidence rules

## Provenance
- A record is `VERIFIED` only when its bibliographic data was checked against a public source (PubMed, DOI, publisher page). Summaries restate what the abstract says and nothing more. `UNVERIFIED` evidence is excluded from assessments.
- Never invent DOIs, PMIDs, results, effect sizes, regulatory limits or evidence IDs, and never present invented evidence as a real publication. If a number is not in the source, leave it `null`.
- Proof-of-concept exception: three invented "Internal clinical study" records (no DOI/PMID) and two starter products exist in `reference-data.json` so all three verdicts can be demonstrated; the app header shows a PoC tag and docs/RESEARCH_AND_ASSUMPTIONS.md lists them. Record any addition there.

## Evidence relations (computed in `evidence-retrieval.ts`)
| Relation | Meaning | May support a SUPPORTED verdict? |
|---|---|---|
| `FINISHED_EXACT` | Finished-product study of this exact formulation | Yes (required) |
| `FINISHED_OTHER` | Finished-product study of a different formulation | Context only |
| `INGREDIENT` | Ingredient or simple-vehicle study | No, never alone |

## Rules Claude must respect (stated in the prompt and playbook, applied by Claude)
1. Ingredient benefit does not equal finished-product benefit.
2. Decide which studies are about the claimed benefit; compare tested vs formulated concentration, population, duration, endpoint, design, quality and reported effect size against the claim.
3. A 12-week result does not prove a 4-week benefit; a lower tested concentration does not prove a higher formulated one works as claimed.
4. SUPPORTED needs a finished-product study of this exact formula. NOT_SUPPORTED = the claim cannot be made on this evidence: it contradicts or falls short of the claim, or no study is about the claimed benefit at all. INCONCLUSIVE = at least one study is about the claimed benefit and points the right way but is too indirect or weak to decide. A NOT_SUPPORTED verdict means "not substantiated yet", never "proven false".
5. Reference concentration ranges are context, not proof of safety or efficacy.
6. The score (0-100) is Claude's own rating of how strongly the evidence supports the claim, consistent with the verdict (the prompt asks SUPPORTED 70-100, INCONCLUSIVE 25-69, NOT_SUPPORTED 0-40). It is not a probability.
7. Output is decision support for scientific evaluators, never legal or regulatory approval.

## Who judges
Claude does, entirely. The backend labels each study's relation to the formula (a fact from the database links), validates the answer's shape and stores it. It does not score, filter by relevance, match keywords or override verdicts.
