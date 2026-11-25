---
name: claim-evaluation
description: How Claude evaluates a cosmetic claim in Claims Intelligence: what the claim contains, what Claude is given, who does the judging, and how to extend the playbook or the evidence library. Use when changing the evaluation prompt, the playbook or the evidence data.
---

# Claim evaluation

**Claude does all the judging.** Verdict, 0-100 score, which studies matter, how each is used and every explanation come from Claude. The backend only gathers facts, validates the answer's shape and stores it. Do not add scoring, relevance filtering, keyword matching or verdict overrides in code.

## What Claude receives (`engine/prompt.ts`)
- **System prompt** = the fixed rules + the **evaluation playbook** (`engine/playbook.ts`). The bridge runs Claude in an empty folder, so nothing else (no CLAUDE.md, no skills) influences an evaluation.
- **User message** = compact JSON: the claim (wording, optional description, benefit chips, optional improvement, weeks, population), the formula (ingredient, percentage, role, sourced reference range when one exists) and every verified study for the formula's ingredients (relation to the formula, design, population, duration, tested vs formulated concentration, results, direction, reported effect %, limitations, quality).
- Only the wording is mandatory; missing numbers are left out and Claude reads the rest from the text.

## What Claude returns (`engine/ai-schema.ts`)
verdict, score (0-100), scoreExplanation, plain-language summary/strengths/limitations/missing evidence/next tests, scientist-level reasoning and per-study analyses, and a role (SUPPORTS / DISAGREES / BACKGROUND) for every study. The validator checks shape and that cited studies were supplied; nothing else.

## Extending the playbook
Edit `playbook.ts` (judgement rules only, never study facts), bump `PROMPT_VERSION`, and add a test in `assessment-pipeline.spec.ts` that the new text is present. Keep it short: it is sent with every evaluation.

## Extending the evidence library
Add records to `prisma/seed-data/reference-data.json` (new installs) or through the Evidence page (running installs). Rules: real source, DOI/PMID checked against PubMed, summary restates the abstract only, numbers only if stated, `effectMagnitude` only for a stated percentage, honest limitations, benefit tags from the chips (or custom). An ingredient is `VERIFIED` only when it has at least one such source. Invented proof-of-concept records are listed in docs/RESEARCH_AND_ASSUMPTIONS.md.
