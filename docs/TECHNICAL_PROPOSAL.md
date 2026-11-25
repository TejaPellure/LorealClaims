# Technical proposal (answers task.md)

Scenario: a scientist submits a formulation to support a claim ("Reduces wrinkles by 20% in 4 weeks"); an evaluator attaches clinical evidence; the system uses an LLM to judge whether the evidence justifies the claim, saves the result and returns it to React. This repository is the working implementation. Items 1-3 below point at the real code.

## 1. Database
`prisma/schema.prisma`: `Claim` (structured claim bound to a formulation version) and `Assessment` (verdict, score, reasoning, snapshots, review), plus `Evidence`, `Formulation`, `FormulationIngredient`, `Ingredient`, `AssessmentEvidence`. See [DATABASE_DESIGN.md](DATABASE_DESIGN.md).

## 2. Backend: `POST /api/claims/assess`
`apps/api/src/modules/assessments/assessments.module.ts` (controller + service) delegating to `engine/assessment-pipeline.ts`. It takes only a `claimId`, loads claim, formulation and evidence from PostgreSQL, calls the model (Claude through a local bridge; the brief mentions OpenAI, and the provider interface `AssessmentProvider` is where an OpenAI provider would plug in), validates the structured response, saves it and returns the saved assessment. Pseudo-code:

```
assess(claimId):
  claim, formulation = db.load(claimId)           # never trust client-supplied evidence
  check readiness (fields, formulation = 100%)
  evidence = retrieve(ingredients, formulation)   # classify: ingredient / exact finished / other formulation
  score = deterministicScore(claim, evidence)     # transparent rubric, not from the LLM
  result = provider.generate(package)             # structured JSON
  result = validate(result); verdict = guardrails(result.verdict, evidence, score)
  save assessment + snapshots + evidence links; return it
```

## 3. Frontend
`apps/web/src/pages/AssessmentReportPage.tsx` (Justified verdict, score, reasoning, evidence traceability, human decision) and the trigger in `features/claims/ClaimDetailDialog.tsx`, calling `POST /api/claims/assess` through `services/api.ts`. In the brief's terms: "Justified: Yes/No" is the three-valued verdict (Supported / Not supported / Inconclusive), "Confidence Score" is the Evidence Sufficiency Score (0-100, rubric based, explicitly not a probability), "Reasoning" is the AI summary and detailed reasoning.

## 4. Business process understanding
See [BUSINESS_WORKFLOW.md](BUSINESS_WORKFLOW.md): Business proposes, Claim Manager screens for applicability and feasibility, Scientist formulates, Evaluator attaches evidence and tests the product against the claim, AI assists, human decides. Key insight: claim substantiation fails most often by treating **ingredient** evidence as proof for the **finished product**, so the system encodes that distinction in data, scoring, prompts and guardrails.

## 5. Research performed
See [RESEARCH_AND_ASSUMPTIONS.md](RESEARCH_AND_ASSUMPTIONS.md): PubMed-verified studies on niacinamide, hyaluronic acid and ceramides; public INCI practice; the fact that exact concentrations are not disclosed (hence `ILLUSTRATIVE` formulas).

## 6. Technical architecture justification
See [ARCHITECTURE.md](ARCHITECTURE.md): one NestJS app, one PostgreSQL, Prisma, React SPA served by Nest, deterministic scoring with LLM explanation, structured outputs with validation and guardrails, immutable snapshots, mock mode for keyless demos.

## 7. Product roadmap
See [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md).
