# Research and assumptions

## Method
Bibliographic records were looked up through PubMed E-utilities on 2026-11-25. Only DOI/PMID values returned by PubMed were used, and each summary restates only what the abstract says (no numbers beyond the abstract). Where the abstract gave no number, the field is empty.

## Evidence in the library (6 real publications)
| PMID | Reference | Role |
|---|---|---|
| 16029679 (doi 10.1111/j.1524-4725.2005.31732) | Bissett et al., *Dermatol Surg* 2005: 5% niacinamide vs vehicle, 12 weeks, n=50, split-face | Ingredient evidence (wrinkles, elasticity) |
| 22052267 | Pavicic et al., *J Drugs Dermatol* 2011: 0.1% hyaluronan creams of different molecular weights, 60 days, n=76 | Ingredient evidence (hydration, wrinkles) |
| 16209160 | Draelos et al., *Cutis* 2005: niacinamide-containing moisturizer, rosacea, 4 weeks, n=50 | Finished product of a different formulation |
| 24688623 | Jegasothy et al., *J Clin Aesthet Dermatol* 2014: nano-hyaluronic acid range, 8 weeks, n=33 | Finished product, different formulation; "up to" results flagged as best case |
| 22507050 (doi 10.1016/j.clindermatol.2011.08.018) | Draelos, *Clin Dermatol* 2012: review of barrier repair creams | Ceramide / hyaluronate background (qualitative) |
| 37276158 (doi 10.36849/JDD.7142) | Draelos et al., *J Drugs Dermatol* 2023: ceramide routine during acne treatment, TEWL, 12 weeks | Ceramide finished product (acne population) |

Quality ratings (HIGH/MODERATE/LOW) are a curator's preliminary appraisal, not a formal risk-of-bias assessment.

None of these studies tested a formula built in this app, so for the user's own products the engine will mostly find ingredient-level or other-formulation evidence. That is the honest answer, and it is why verdicts are mostly "Inconclusive" until the user adds finished-product evidence.

## Ingredients (11)
Purified water, glycerin, niacinamide, sodium hyaluronate, panthenol, ceramide NP, cholesterol, squalane, tocopherol, phenoxyethanol, xanthan gum: enough to build serums and a barrier cream. Niacinamide and sodium hyaluronate (PubMed-backed) and phenoxyethanol (EU Regulation 1223/2009, Annex V: maximum 1.0% as a preservative) are marked `VERIFIED`; the others are general descriptions marked `UNVERIFIED`. A reference concentration range is recorded only where a source supports it (phenoxyethanol), and is never treated as proof of safety or efficacy.

## Assumptions
- A finished-product study applies to the exact formulation it is linked to; for any other formula it is "different formulation" evidence.
- Ingredient-level studies never prove a finished-product claim on their own.
- A study longer than the claimed timeframe does not prove the benefit already appears at the claimed time.
- Unknown values (concentration, duration, magnitude) are scored conservatively.
- `UNVERIFIED` evidence is excluded from assessments.
- A claimed percentage is compared with a reported effect size only when the unit is `%` and the source stated the effect.
- The scoring weights are initial heuristics and need validation by a domain expert.

## Verification status
`docker compose up --build` was run end to end on 2026-11-25 (Docker 29.2.1): migrations apply, the seed loads 11 ingredients and 6 studies, the app serves on :3000 as a non-root user, and a claim submitted through the browser was evaluated by real Claude (model `sonnet`, through the bridge) and saved. 55 API tests pass.
