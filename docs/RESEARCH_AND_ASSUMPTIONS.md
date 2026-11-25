# Research and assumptions

## Method
Bibliographic records were looked up through PubMed E-utilities on 2026-11-25. Only DOI/PMID values returned by PubMed were used, and each summary restates only what the abstract says. A number (concentration, duration, sample size, effect) is entered only when the abstract states it; otherwise the field is empty. `effectMagnitude` (a reported % improvement) is set only where the abstract gives a percentage reduction (currently the niacinamide acne study, -60% papules/pustules). Quality ratings (HIGH/MODERATE/LOW/VERY_LOW) are a curator's preliminary appraisal, not a formal risk-of-bias assessment.

## Library: 16 ingredients, 29 real studies (+3 invented, see below)

| Ingredient | Studies (PMID) | What they cover |
|---|---|---|
| Niacinamide | 16029679, 16209160, 7657446, 16766489, 12100180, 21822427 | Wrinkles/elasticity (5%, 12 wk), rosacea barrier (finished product), acne (4% gel, 8 wk, papules/pustules -60%), sebum (2%, 4-6 wk), pigmentation (5%, 4 wk) and melasma (4%, 8 wk) |
| Glycerin | 18510666, 10598752 | Review of hydration/barrier effects; barrier recovery after damage |
| Sodium hyaluronate | 22052267, 24688623, 22507050 | 0.1% by molecular weight (hydration, wrinkles); nano-HA product range; barrier-cream review |
| Panthenol | 21982351, 29577586 | 1-5% over 30 days (TEWL), 7-11 wt% over 48 h (hydration) |
| Ceramide NP | 22507050, 37276158, 33984185, 30410378 | Barrier-cream review; ceramide routine in acne treatment and in eczema; single-application hydration |
| Cholesterol | 9308554 | Cholesterol-dominant lipid mixture, barrier recovery in aged skin (n=6) |
| Squalane | 40363772 | In-vitro only (human fibroblasts, 0.005-0.015%): the only squalane study found, so VERY_LOW |
| Tocopherol | 16029671, 27559512 | Two vitamin E reviews (antioxidant, photoprotection, barrier) |
| Phenoxyethanol | 31588615 | Safety review: safe as a preservative up to 1% |
| Retinol | 17515510, 20078381 | 0.4% (24 wk) and 0.075% (26 wk) wrinkle studies |
| Salicylic acid | 1535287, 36999489 | 0.5-2% acne review; serum + mask RCT (acne, pores, sebum, 8 wk) |
| Ascorbic acid | 23741676, 18503551 | Vitamin C review; 5% vitamin C + madecassoside in photoaged skin (6 months) |
| Urea | 24314769 | Review of 81 clinical publications (xerosis, dry skin) |
| Azelaic acid | 1712709 | 20% cream review (acne, melasma) |
| Purified water, xanthan gum | none | Vehicle and texturiser. No efficacy studies exist to attach, so they stay `UNVERIFIED` and contribute no evidence |

An ingredient is `VERIFIED` only when at least one such study or regulatory source is attached. Reference concentration ranges are recorded only where a source supports them (phenoxyethanol, EU Regulation 1223/2009 Annex V: maximum 1.0% as a preservative) and are never treated as proof of safety or efficacy.

Most records are ingredient-level. The finished-product studies (niacinamide moisturizer in rosacea, nano-hyaluronic range, three ceramide routines/creams, the salicylic acid serum) tested **other formulations**, so they count as "different formulation" evidence for anything built in this app.

## Proof-of-concept data (invented)
This is a proof of concept, so the library mixes real and invented records without distinguishing them in the UI; the app header carries a **PoC** tag instead. The invented records are:
- Products: **Radiance Serum** (niacinamide 5%, glycerin 5%, panthenol 1%, sodium hyaluronate 0.3%, water 88.7%) and **Clear Pore Serum** (niacinamide 4%, salicylic acid 0.5%, glycerin 4%, sodium hyaluronate 0.3%, water 91.2%).
- Three "Internal clinical study" records (source "Internal clinical study", no DOI or PMID): a 4-week brightening trial of Radiance Serum (28%), an 8-week pore and blemish trial of Clear Pore Serum (32%), and the skin-tone result of that same trial (no significant change).
They are not research and must not be cited. They exist only to demonstrate Supported (a trial of the exact formula backs the claim), Not supported (the formula's own trial shows no effect on a benefit the ingredient alone is known for) and Inconclusive (only ingredient-level evidence). Everything else in the library is a real, PubMed-checked publication.

## What this means for verdicts
Most formulas built here have no study of their own, so Claude usually cannot mark them SUPPORTED: its rules require a finished-product study of the exact formula, so results are mostly **Inconclusive**. To change that, add a finished-product study for the product in the Evidence library (link it to the product), then evaluate again. Studies on the ingredients still shape Claude's score, reasoning and recommended tests.

## Assumptions
- A finished-product study applies to the exact formulation it is linked to; for any other formula it is "different formulation" evidence.
- Ingredient-level studies never prove a finished-product claim on their own.
- A study longer than the claimed timeframe does not prove the benefit already appears at the claimed time.
- A claimed percentage is only comparable with a reported effect when the source stated the effect; the playbook tells Claude to say so when it cannot compare.
- `UNVERIFIED` evidence is excluded from assessments.
- Claude decides which studies are about the claimed benefit; the backend sends all verified studies for the formula's ingredients.
- The score is Claude's own rating and can vary slightly between runs; it needs validation by a domain expert.
- Wording that implies treating a disease (for example "treats acne") may be a medicinal rather than cosmetic claim in many markets. The playbook asks Claude to flag this and suggest cosmetic wording; it does not state specific laws.

## Verification status
The full stack was run with `docker compose up --build`, and claims submitted through the browser were evaluated by real Claude (model `sonnet`, through the host bridge) and saved. 65 API tests pass.
