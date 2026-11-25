# AI assessment engine

> The score is a **prototype scoring rubric requiring scientific validation**, not a calibrated probability. Output is decision support, never regulatory approval.

## Pipeline (`engine/assessment-pipeline.ts`)
1. **Load** claim + formulation + ingredients from PostgreSQL. The client sends only `claimId`.
2. **Readiness**: required claim fields present; formulation totals 100%.
3. **Retrieve** (`evidence-retrieval.ts`): non-UNVERIFIED evidence linked to any ingredient in the formula or directly to this formulation. Evidence on other endpoints is kept only if it is a finished-product study of this exact formulation (as context). Maximum 12 records; contradictory records are never dropped in favour of supporting ones.
4. **Classify** each record: `FINISHED_EXACT`, `FINISHED_OTHER` (a different formulation) or `INGREDIENT`; role `SUPPORTING`, `CONTRADICTORY` (neutral or negative) or `CONTEXT`.
5. **Score** deterministically (below).
6. **Claude** returns a structured result (below).
7. **Validate** (`ai-schema.ts`): verdict enum, required fields, every cited evidence id must exist in the package, ingredient notes may cite only ingredient evidence and formulation notes only finished-product evidence. Invalid output gets one retry with the problems fed back, then a 502. Nothing unvalidated is stored or returned.
8. **Guardrails** (`guardrails.ts`) adjust the verdict and record notes.
9. **Persist** assessment, evidence links and snapshots.

## Claude via the bridge
`providers/providers.ts` POSTs `{systemPrompt, prompt, jsonSchema, model}` to the bridge with `Authorization: Bearer <CLAUDE_BRIDGE_TOKEN>`. The bridge (`apps/claude-bridge/server.mjs`) runs `claude -p <prompt> --output-format json --json-schema <schema> --no-session-persistence --tools ""` on the host and returns the structured output. Failures map to 503 (bridge unreachable, token rejected, CLI not logged in, with the CLI's own message), 504 (timeout `CLAUDE_TIMEOUT_MS`, default 180 s), 422 (refusal), 502 (invalid or empty output).

The prompt (`engine/prompt.ts`, version `claims-assess-v2`) states the scientific rules, sends a compact evidence package, and never asks the model for a score.

## Structured response
`verdict`, `summary`, `strengths[]`, `limitations[]`, `ingredientEvidenceAnalysis[{evidenceId,note}]`, `formulationEvidenceAnalysis[]`, `contradictoryEvidence[]`, `missingEvidence[]`, `recommendedTests[]`, `evidenceReferences[]`, `reasoning`.

## Evidence Sufficiency Score (`engine/scoring.ts`, `prototype-rubric-v1`)
Score = sum(weight x value) over 8 criteria, rounded, 0-100. Weights are configurable via `SCORING_WEIGHTS` (must total 100; an invalid override falls back to the defaults).

| Criterion | Weight | Value (0-1) |
|---|---:|---|
| Methodological quality | 15 | anchor study quality (HIGH 1, MODERATE 0.7, LOW 0.4, VERY_LOW 0.2) |
| Direct relevance | 15 | anchor: exact finished 1, other formulation 0.6, ingredient 0.4 |
| Concentration similarity | 12 | formulated/tested; 1x to 2x = 1, above 2x = 0.8, unknown 0.5 (exact finished product 1) |
| Endpoint and magnitude | 15 | endpoint family match x min(1, reported effect / claimed target); unknown magnitude 0.7 |
| Duration match | 10 | study/claim; within +25% = 1; much longer 0.6; unknown 0.3 |
| Population similarity | 8 | keyword overlap with the claim population (minimum 0.2) |
| Finished-product testing | 15 | best supporting finished study: exact = quality, other formulation = 0.4 x quality |
| Consistency | 10 | supporting quality weight / (supporting + neutral/contradictory) |

The **anchor** is the best-fitting supporting study for the claim endpoint. No supporting evidence means score 0 and an INCONCLUSIVE verdict, not "false". The per-criterion breakdown is stored and shown in the report.

## Guardrails
- SUPPORTED requires exact finished-product supporting evidence, no exact contradiction, and score >= `SUPPORTED_MIN_SCORE` (60); otherwise INCONCLUSIVE.
- NOT_SUPPORTED requires contradictory evidence or a magnitude shortfall; otherwise INCONCLUSIVE.
- With only the seeded literature (none of it tested the user's own formulas), claims therefore come back INCONCLUSIVE or NOT_SUPPORTED until finished-product evidence for the formula is added and linked to the product.

## Duplicates and history
`inputHash` fingerprints claim + formulation + evidence + prompt + weights. Identical submissions return the stored assessment (`reused: true`); concurrent identical submissions share one call; `forceNew` creates another record. Old assessments are never modified.

## Limitations
Population matching is keyword-based. Effect sizes are compared only when the source stated them. The rubric weights are initial values. An evaluation takes about 1-2 minutes.
