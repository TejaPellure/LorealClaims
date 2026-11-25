# AI assessment engine

> Prototype. The score is a **prototype scoring rubric requiring scientific validation**, not a calibrated probability. The AI assists evaluators and never approves a claim.

## Pipeline (`engine/assessment-pipeline.ts`)
1. **Load** claim + formulation + ingredients from PostgreSQL (the client sends only `claimId`).
2. **Readiness**: claim status must be assessable; required fields present; formulation totals 100%.
3. **Retrieve** (`evidence-retrieval.ts`): non-UNVERIFIED evidence linked to any formulation ingredient or directly to this formulation version. Evidence for other endpoints is kept only if it is a finished-product study of this exact version (as context). Max 12 records; contradictory records are never dropped in favour of supporting ones.
4. **Classify** each record: `FINISHED_EXACT`, `FINISHED_OTHER` (different formulation) or `INGREDIENT`; role `SUPPORTING`, `CONTRADICTORY` (neutral/negative) or `CONTEXT`.
5. **Score** deterministically (below).
6. **Provider** returns a structured result (mock rules or Claude).
7. **Validate** (`ai-schema.ts`): enum verdict, required fields, every evidence id must exist in the package, ingredient notes may cite only ingredient evidence and formulation notes only finished-product evidence. Invalid output gets one retry with the problems fed back, then a 502; nothing unvalidated is stored or returned.
8. **Guardrails** (`guardrails.ts`) adjust the verdict and record notes.
9. **Persist** assessment, evidence links and snapshots, set the claim to `ASSESSED`.

## Providers (`ASSESSMENT_PROVIDER`)
- `mock` (default): applies the same rules in plain code, produces schema-valid output, deterministic, labelled `MOCK` / `mock-rules-v1` everywhere in the UI.
- `claude`: POSTs `{systemPrompt, prompt, jsonSchema, model}` to the Claude bridge with `Authorization: Bearer <CLAUDE_BRIDGE_TOKEN>`. The bridge runs `claude -p <prompt> --output-format json --json-schema <schema> --no-session-persistence --tools ""` and returns structured output. Errors map to 503 (unreachable/unauthorised), 504 (timeout `CLAUDE_TIMEOUT_MS`), 422 (refusal), 502 (invalid/empty).

The prompt (`engine/prompt.ts`, version `claims-assess-v1`) states the scientific rules, includes only a compact evidence package, and does not ask the model for a score.

## Structured response
`verdict`, `summary`, `strengths[]`, `limitations[]`, `ingredientEvidenceAnalysis[{evidenceId,note}]`, `formulationEvidenceAnalysis[]`, `contradictoryEvidence[]`, `missingEvidence[]`, `recommendedTests[]`, `evidenceReferences[]`, `reasoning`.

## Evidence Sufficiency Score (`engine/scoring.ts`, `prototype-rubric-v1`)
Score = sum(weight x value) over 8 criteria, rounded, 0-100. Weights are configurable via `SCORING_WEIGHTS` (must total 100; invalid overrides fall back to defaults).

| Criterion | Weight | Value (0-1) |
|---|---:|---|
| Methodological quality | 15 | anchor study quality (HIGH 1, MODERATE 0.7, LOW 0.4, VERY_LOW 0.2) |
| Direct relevance | 15 | anchor: exact finished 1, other formulation 0.6, ingredient 0.4 |
| Concentration similarity | 12 | formulated/tested; >=1 up to 2x = 1, >2x = 0.8, unknown 0.5 (exact finished product 1) |
| Endpoint + magnitude | 15 | endpoint family match x min(1, reported effect / claimed target); unknown magnitude 0.7 |
| Duration match | 10 | study/claim; within +25% = 1; much longer 0.6; unknown 0.3 |
| Population similarity | 8 | keyword overlap with claim population (min 0.2) |
| Finished-product testing | 15 | best supporting finished study: exact = quality, other formulation = 0.4 x quality |
| Consistency | 10 | supporting quality weight / (supporting + neutral/contradictory) |

The **anchor** is the best-fitting supporting study for the claim endpoint. No supporting evidence means score 0 and an INCONCLUSIVE verdict, not "false". The full per-criterion breakdown is stored and shown in the report.

## Guardrails
- SUPPORTED requires exact finished-product supporting evidence, no exact contradiction, and score >= `SUPPORTED_MIN_SCORE` (60); otherwise INCONCLUSIVE.
- NOT_SUPPORTED requires contradictory evidence or a magnitude shortfall; otherwise INCONCLUSIVE.

## Duplicates and history
`inputHash` fingerprints claim + formulation + evidence + provider + prompt + weights. Identical submissions return the stored assessment (`reused: true`); concurrent identical submissions share one in-flight run; `forceNew` creates another record. Old assessments are never modified except by the human review.

## Human review
Stored separately: `reviewDecision`, `reviewComments`, `reviewedBy`, `reviewedAt`. Approving moves the claim to `APPROVED_BY_EVALUATOR`. This is an internal workflow state, not legal approval.

## Limitations
Population matching is keyword-based. Effect sizes are only compared when the source stated them. The rubric weights are initial values. Mock output is rule text, not scientific analysis.
