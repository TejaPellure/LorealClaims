# Product roadmap (with ample time and no boundaries)

Items below are **not implemented**; they are the intended evolution.

## Horizon 1: make the MVP trustworthy
- Real authentication (SSO/OIDC), role-based permissions per persona, full audit trail (who changed what, when), rate limiting.
- Scientific validation of the scoring rubric with R&I experts; calibrate weights against historical evaluator decisions.
- Evidence ingestion: PDF upload -> automatic extraction of design, sample size, endpoints, results, with evaluator confirmation.
- Evaluator feedback loop: capture agree/disagree with AI verdicts to evaluate and improve prompts.
- Notifications and task queues for claim managers and evaluators.

## Horizon 2: deeper intelligence
- Literature search connectors (PubMed, Crossref, internal reports) with dedup and provenance; semantic retrieval (pgvector) once the library outgrows metadata matching.
- Dose-response and formulation-aware reasoning: pH, delivery system, interactions and compatibility intelligence.
- Statistical evidence synthesis (effect size pooling, heterogeneity) instead of single anchor study.
- Multiple AI providers (Claude, OpenAI, local) with automatic model comparison and cross-checking.
- Explainability views: evidence-to-conclusion graph, "what evidence would change the verdict".

## Horizon 3: R&I platform
- Regulatory claim checks by market (EU, US, APAC) with versioned rule sets and wording guidance.
- Clinical trial design recommendations (endpoint, power, duration, population) generated from evidence gaps.
- AI-assisted formulation optimisation under constraints (cost, regulation, evidence coverage).
- Portfolio analytics: claim coverage across products, evidence reuse, testing backlog and cost.
- Multi-user collaboration: comments, approvals, versioned claim dossiers, export of submission-ready substantiation files.
- Integration with PLM/LIMS/ERP, lab instrument data (corneometer, profilometry) and digital twins.

## Platform concerns across horizons
Horizontal scaling (job queue for assessments, DB-level locks), observability, data residency, validated-system documentation (e.g., GxP-style) where required.
