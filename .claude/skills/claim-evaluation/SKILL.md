---
name: claim-evaluation
description: How Claude evaluates a cosmetic claim in Claims Intelligence: what the claim contains, how studies are matched to it, which scientific judgement rules apply, and how to extend the playbook or the evidence library. Use when changing the evaluation prompt, the playbook, benefit matching or the evidence data.
---

# Claim evaluation

## What Claude receives (`engine/prompt.ts`)
- **System prompt** = the fixed rules + the **evaluation playbook** (`engine/playbook.ts`). The bridge runs Claude in an empty folder, so nothing else (no CLAUDE.md, no skills) influences an evaluation.
- **User message** = compact JSON: the claim (wording, optional description, benefit chips, optional improvement, weeks, population), the formula (ingredient, percentage, role, sourced reference range when one exists) and the evidence records (relation, design, population, duration, tested vs formulated concentration, results, direction, reported effect %, limitations, quality, `endpointMatch`).
- Only the wording is mandatory; missing numbers are simply left out and Claude reads the rest from the text.

## How studies are matched to the claim (`engine/benefit-match.ts`)
Claim text (wording + description + chips) and study text (benefit tags + endpoint + title) are both reduced to concepts (hydration, wrinkle, firmness, barrier, pigmentation, soothing, acne, oil, pores, exfoliation, antioxidant) with keyword patterns; a shared concept, or an identical custom tag, is a match. Matching studies become SUPPORTING / CONTRADICTORY; the rest are kept as a few CONTEXT records (more when the claim is unrecognisable) so Claude can still judge unusual wording. Add a concept by adding a pattern, a preset chip (`apps/web/src/lib/lib.ts`) and a test.

## Extending the playbook
Edit `playbook.ts` (judgement rules only, never study facts), bump `PROMPT_VERSION`, and add a test in `benefit-match.spec.ts` that the new rule text is present. Keep it short: it is sent with every evaluation.

## Extending the evidence library
Add records to `prisma/seed-data/reference-data.json` (new installs) or through the Evidence page (running installs). Rules: real source, DOI/PMID checked against PubMed, summary restates the abstract only, numbers only if stated, `effectMagnitude` only for a stated percentage, honest limitations, benefit tags from the chips (or custom). An ingredient is `VERIFIED` only when it has at least one such source.
