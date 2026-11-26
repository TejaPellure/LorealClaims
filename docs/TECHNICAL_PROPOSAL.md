# Technical proposal (answers task.md)

Scenario: a scientist submits a formulation to support a claim ("Reduces wrinkles by 20% in 4 weeks"); the system uses an LLM to judge whether the evidence justifies the claim, saves the result and returns it to React. This repository is the working implementation; items 1-3 point at the real code.

## 1. Database
`prisma/schema.prisma`: `Claim` (wording + structured fields, bound to a formulation) and `Assessment` (verdict, score, reasoning, snapshots), plus `Evidence`, `Formulation`, `FormulationIngredient`, `Ingredient`, `AssessmentEvidence`. See [DATABASE_DESIGN.md](DATABASE_DESIGN.md).

## 2. Backend: `POST /api/claims/assess`
`modules/assessments/assessments.module.ts` delegating to `engine/assessment-pipeline.ts`. It takes only a `claimId`, loads claim, formulation and evidence from PostgreSQL, calls Claude (the brief mentions OpenAI; the `AssessmentProvider` interface is where another model would plug in), validates the structured response, saves it and returns the saved assessment.

```
assess(claimId):
  claim, formulation = db.load(claimId)           # never trust client-supplied evidence
  check readiness (fields, formulation = 100%)
  evidence = every verified study for the ingredients  # labelled: this formula / another formula / ingredient
  result = claude.generate(package)               # verdict, score, per-study roles, explanations: all from Claude
  validate(result)                                # shape and cited ids only; never changes Claude's answer
  save assessment + snapshots + evidence links; return it
```

## 3. Frontend
`pages/ClaimsPage.jsx` + `features/claims/ClaimForm.jsx` submit the claim and call `POST /api/claims/assess`; `pages/AssessmentReportPage.jsx` shows the result. In the brief's terms, "Justified: Yes/No" is the three-valued verdict (Supported / Not supported / Inconclusive), "Confidence Score" is the evidence-strength score (0-100, given by Claude with a plain explanation, explicitly not a probability), and "Reasoning" is Claude's summary and detailed reasoning.

## 4. Business process understanding
See [BUSINESS_WORKFLOW.md](BUSINESS_WORKFLOW.md). The full process (business proposal, claim manager screening, formulation, evidence, evaluation, review) is collapsed into Formulate -> Claim -> Result. Key insight: substantiation most often fails by treating **ingredient** evidence as proof for the **finished product**, so that distinction is encoded in the data (every study is labelled this formula / another formula / ingredient) and in the prompt Claude follows.

## 5. Research performed
See [RESEARCH_AND_ASSUMPTIONS.md](RESEARCH_AND_ASSUMPTIONS.md): PubMed-verified studies on niacinamide, hyaluronic acid and ceramides; the fact that exact commercial concentrations are not public.

## 6. Technical architecture justification
See [ARCHITECTURE.md](ARCHITECTURE.md).

## 7. Product roadmap
See [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md).
