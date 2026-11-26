# AI assessment engine

> **Claude does all the judging.** The verdict, the 0-100 evidence-strength score, which studies matter and how, and every explanation come from Claude. The backend does not score, rank by relevance, match keywords or override verdicts. It fetches facts from the database, checks that Claude's answer is well-formed, and stores it exactly as given. The score is Claude's rating, not a probability, and the output is decision support, never regulatory approval.

## Pipeline (`engine/assessment-pipeline.ts`)
1. **Load** the claim, formulation and ingredients from PostgreSQL. The client sends only `claimId`.
2. **Readiness**: the claim has its wording (the only required field) and the formulation totals 100%.
3. **Gather evidence** (`evidence-retrieval.ts`): every non-UNVERIFIED study linked to an ingredient in the formula, or directly to this formulation, up to 40 records. Each is labelled with its relation to the formula (a fact read from the links): `FINISHED_EXACT` (a finished-product study of this exact formula), `FINISHED_OTHER` (another formula) or `INGREDIENT`, plus the percentage of its ingredient in this formula. No relevance filtering: studies on every benefit are sent and Claude decides which matter.
4. **Ask Claude** (`providers/providers.ts`): the evidence package goes to the Claude bridge with the system prompt (rules + playbook).
5. **Validate the shape** (`ai-schema.ts`): verdict is one of the three values, score is 0-100, required fields are present, every study Claude cites was actually supplied, ingredient notes cite only ingredient studies and formula notes only finished-product studies. Invalid output gets one retry with the problems fed back, then a 502. Claude's verdict, score and wording are never altered.
6. **Store** the assessment, the role Claude gave each study, and immutable snapshots of the claim, formulation and evidence.

## What Claude receives
- **System prompt** (`engine/prompt.ts`, version `claims-assess-v6`): the rules (below) plus the **evaluation playbook** (`engine/playbook.ts`). The bridge runs the CLI in an empty folder with the prompt on stdin, so nothing else influences an evaluation.
- **User message**: compact JSON with the claim (wording, optional description, benefit chips, optional improvement, weeks, population), the formula (ingredient, percentage, role, sourced reference range if any) and the evidence records.

### Rules in the prompt
Ingredient evidence is not finished-product proof; a study of this exact formula is the strongest evidence; first decide which studies are about the claimed benefit; compare concentration, population, duration, endpoint, quality and effect size; never invent evidence or ids; SUPPORTED needs a finished-product study of this exact formula; NOT_SUPPORTED when the claim cannot be made on this evidence (it is contradicted, falls short, or no study is about the claimed benefit at all; never "proven false", only "not substantiated yet"); INCONCLUSIVE only when some study is about the claimed benefit and points the right way but is too weak or indirect.

### Playbook (`engine/playbook.ts`)
Reading the claim from all its parts, mapping claims to measurable endpoints (corneometry, TEWL, profilometry, sebumeter, lesion counts...), reading effect sizes ("up to X%" is a best case; a share of responders is not a percentage reduction), timeframe, dose and population caveats, an evidence-quality ladder, cosmetic versus medicinal wording, formula-level cautions, and writing for two audiences. It contains judgement rules, never study facts.

## What Claude returns (structured JSON)
`verdict` (SUPPORTED / NOT_SUPPORTED / INCONCLUSIVE), `score` (integer 0-100: how strongly the evidence supports the claim as worded; the prompt asks for SUPPORTED 70-100, INCONCLUSIVE 25-69, NOT_SUPPORTED 0-40), `scoreExplanation`, `summary`, `strengths[]`, `limitations[]`, `missingEvidence[]`, `recommendedTests[]` (plain language, for non-scientists), and for scientists `reasoning`, `ingredientEvidenceAnalysis[]`, `formulationEvidenceAnalysis[]`, `contradictoryEvidence[]` (each with an evidence id and a note), `evidenceRoles[]` (SUPPORTS / DISAGREES / BACKGROUND for every study) and `evidenceReferences[]`.

## Claude via the bridge
`POST` `{systemPrompt, prompt, jsonSchema, model}` with `Authorization: Bearer <CLAUDE_BRIDGE_TOKEN>`. The bridge (`apps/claude-bridge/server.mjs`) runs `claude -p --output-format json --json-schema <schema> --no-session-persistence --tools ""` on the host. Failures map to 503 (bridge unreachable, token rejected, CLI not logged in, with the CLI's own message), 504 (timeout `CLAUDE_TIMEOUT_MS`, default 180 s), 422 (refusal) and 502 (invalid or empty output).

## Duplicates and history
`inputHash` fingerprints claim + formulation + evidence + prompt version. Identical submissions return the stored assessment (`reused: true`); concurrent identical submissions share one call; `forceNew` creates another record. Old assessments are never modified.

## Limitations
Because Claude is the only judge, the same claim can score a few points differently between runs, and the scientific rules (such as "SUPPORTED needs a study of this exact formula") are enforced by the prompt rather than by code. An evaluation takes about 1-2 minutes.
