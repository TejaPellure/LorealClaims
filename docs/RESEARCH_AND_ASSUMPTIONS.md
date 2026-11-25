# Research and assumptions

## Method
Bibliographic records were looked up through PubMed E-utilities on 2026-11-25. Only DOI/PMID values returned by PubMed were used, and each summary restates only what the abstract says (no numbers beyond the abstract). Anything that could not be verified is labelled `DEMO` or left `null`.

## Verified publications used (6)
| PMID | Reference | Used for |
|---|---|---|
| 16029679 (doi 10.1111/j.1524-4725.2005.31732) | Bissett et al., *Dermatol Surg* 2005: 5% niacinamide vs vehicle, 12 weeks, n=50, split-face | Niacinamide ingredient evidence (wrinkles, elasticity) |
| 22052267 | Pavicic et al., *J Drugs Dermatol* 2011: 0.1% hyaluronan creams of different molecular weights, 60 days, n=76 | Hyaluronate ingredient evidence (hydration, wrinkles) |
| 16209160 | Draelos et al., *Cutis* 2005: niacinamide-containing moisturizer, rosacea, 4 weeks, n=50 | Finished product of a *different* formulation |
| 24688623 | Jegasothy et al., *J Clin Aesthet Dermatol* 2014: nano-hyaluronic acid range, 8 weeks, n=33 | Finished product, different formulation, "up to" results flagged as best-case |
| 22507050 (doi 10.1016/j.clindermatol.2011.08.018) | Draelos, *Clin Dermatol* 2012: review of skin barrier repair creams | Ceramide/HA background (qualitative) |
| 37276158 (doi 10.36849/JDD.7142) | Draelos et al., *J Drugs Dermatol* 2023: ceramide routine during acne treatment, TEWL, 12 weeks | Ceramide finished product (acne population) |

Quality ratings (HIGH/MODERATE/LOW) are a curator's preliminary appraisal, not a formal risk-of-bias assessment.

## Demo (fictitious) records (7)
Marked `DEMO`, no DOI/PMID, titles prefixed `[DEMO]`. They exist to show: a finished-product study that supports a claim (hydration serum), conflicting and weak finished-product evidence (ceramide cream), a null short-duration ingredient study (niacinamide at 2%, 4 weeks), plus glycerin, squalane and a phenoxyethanol safety study. Their numbers are invented for demonstration.

## Ingredients
11 ingredients chosen to be sufficient to build realistic serums and a barrier cream: purified water, glycerin, niacinamide, sodium hyaluronate, panthenol, ceramide NP, cholesterol, squalane, tocopherol, phenoxyethanol, xanthan gum. Only niacinamide and sodium hyaluronate (PubMed-backed) and phenoxyethanol (EU Regulation 1223/2009 Annex V, max 1.0% as preservative) are marked `VERIFIED`; the rest are `UNVERIFIED` general descriptions. Reference concentration ranges are included only where a source supports them (phenoxyethanol). No safety or efficacy range is implied.

## Formulations
Public INCI lists exist for many marketed serums and creams, but manufacturers do not publish exact percentages. Therefore all demo formulas are **`ILLUSTRATIVE`** reconstructions with round example numbers (e.g., niacinamide 5% from the cited clinical study, glycerin 5%). They are not manufacturer recipes and no brand names are used. A `DISCLOSED` basis exists in the schema for formulas whose percentages a credible source publishes (e.g., a patent).

## Assumptions
- A finished-product study applies to the exact formulation version it tested; for any other version it is "different formulation" evidence.
- Ingredient-level studies never prove a finished-product claim on their own.
- A study longer than the claimed timeframe does not prove the benefit already appears at the claimed time (duration factor 0.6).
- Unknown values (concentration, duration, magnitude) are scored conservatively.
- `UNVERIFIED` evidence is excluded from assessments until an evaluator marks it verified.
- Claim percentages are compared to reported effect sizes only when the unit is `%`.
- Scoring weights are initial heuristics and need scientific validation by a domain expert.

## Verification status
`docker compose up --build` was run end to end on 2026-11-25 (Docker 29.2.1): image builds, migrations apply, the seed populates an empty database and is skipped on restart, the app serves the SPA and API on :3000 as the non-root `node` user, the container healthcheck is healthy, a live mock assessment is saved, and a PDF upload lands in the `uploads` volume. 54 API tests pass.

Not verified: the real Claude path (verified only against mocks; the host CLI session had expired when the bridge was smoke-tested) and the README one-line Docker test command.
