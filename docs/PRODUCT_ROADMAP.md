# Product roadmap (with ample time and no boundaries)

Items below are **not implemented**; they are the intended evolution.

## Horizon 1: make it trustworthy
- Authentication (SSO/OIDC), role-based permissions, full audit trail, rate limiting.
- Scientific validation of the scoring rubric with R&I experts; calibrate weights against expert judgements.
- Evidence ingestion: PDF upload -> automatic extraction of design, sample size, endpoints and results, confirmed by a person.
- A job queue so evaluations run in the background with live progress, instead of inside one HTTP request.
- Optional review and approval workflow for teams that need sign-off (it was deliberately removed from the MVP).

## Horizon 2: deeper intelligence
- Literature connectors (PubMed, Crossref, internal reports) with de-duplication and provenance; semantic retrieval (pgvector) once the library outgrows metadata matching.
- Dose-response and formulation-aware reasoning: pH, delivery system, interactions and compatibility.
- Statistical evidence synthesis (pooled effect sizes, heterogeneity) instead of a single anchor study.
- Multiple model providers (Claude, OpenAI, local) with cross-checking.
- Explainability: evidence-to-conclusion graph and "what evidence would change the verdict".

## Horizon 3: R&I platform
- Regulatory claim checks by market (EU, US, APAC) with versioned rule sets and wording guidance.
- Clinical trial design recommendations (endpoint, power, duration, population) from evidence gaps.
- AI-assisted formulation optimisation under cost, regulatory and evidence constraints.
- Portfolio analytics: claim coverage across products, evidence reuse, testing backlog and cost.
- Multi-user collaboration, versioned claim dossiers, export of submission-ready substantiation files.
- Integration with PLM/LIMS/ERP and lab instrument data.

## Across horizons
Horizontal scaling (database locks, queue workers), observability, data residency, validated-system documentation where required.
