---
name: scientific-evidence
description: Evidence provenance, ingredient vs finished-product evidence, assessment rules, scoring and prohibited assumptions for cosmetic claim substantiation. Use when editing the assessment engine, prompts, scoring, evidence data, or writing any scientific text in this project.
---

# Scientific evidence rules

## Provenance
- A record is `VERIFIED` only when its bibliographic data was checked against a public source (PubMed, DOI, publisher page). Summaries restate what the abstract says and nothing more. `UNVERIFIED` evidence is excluded from assessments.
- Never invent DOIs, PMIDs, results, effect sizes, regulatory limits or evidence IDs, and never add sample or fictitious evidence. If a number is not in the source, leave it `null`.

## Evidence relations (computed in `evidence-retrieval.ts`)
| Relation | Meaning | May support a SUPPORTED verdict? |
|---|---|---|
| `FINISHED_EXACT` | Finished-product study of this exact formulation | Yes (required) |
| `FINISHED_OTHER` | Finished-product study of a different formulation | Context only |
| `INGREDIENT` | Ingredient or simple-vehicle study | No, never alone |

## Rules Claude and the backend must respect
1. Ingredient benefit does not equal finished-product benefit.
2. Compare tested vs formulated concentration, population, duration, endpoint, design, quality and reported magnitude vs the claimed target.
3. A 12-week result does not prove a 4-week benefit; a lower tested concentration does not prove a higher formulated one works as claimed.
4. SUPPORTED needs exact finished-product evidence and score >= `SUPPORTED_MIN_SCORE`. NOT_SUPPORTED needs contradictory evidence or a magnitude shortfall. Otherwise INCONCLUSIVE. Missing evidence is never "false".
5. Reference concentration ranges are context, not proof of safety or efficacy.
6. Claude's reasoning and the deterministic score are separate outputs. The score is a prototype rubric, not a probability.
7. Output is decision support for scientific evaluators, never legal or regulatory approval.

## Scoring (`engine/scoring.ts`, `prototype-rubric-v1`)
Weights (configurable, sum 100): quality 15, direct relevance 15, concentration 12, endpoint and magnitude 15, duration 10, population 8, finished-product testing 15, consistency 10. Most criteria use the best "anchor" supporting study; finished-product testing and consistency use all relevant evidence. Unknown values score conservatively. Any rubric change bumps `RUBRIC_VERSION` and updates docs/AI_ASSESSMENT_ENGINE.md.
