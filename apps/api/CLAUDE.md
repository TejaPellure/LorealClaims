# apps/api guidance

- New feature = new folder in `src/modules/<name>/` with `<name>.module.ts` (controller, service, DTOs) registered in `app.module.ts`.
- `modules/assessments/engine/*` is deliberately framework-light (plain classes, constructor injection) so it is easy to unit test with test doubles.
- Route order matters: declare static routes (`meta`, `assess`) before `:id`.
- Every request body DTO is validated (`whitelist` + `forbidNonWhitelisted`). Never accept evidence, formulation data or file paths from clients on assessment endpoints.
- The only provider is `ClaudeProvider` (via the bridge). To add another model, implement `AssessmentProvider` and select it in `assessments.module.ts`.
- Changing prompt wording or the evidence package: bump `PROMPT_VERSION`. Changing scoring: bump `RUBRIC_VERSION` and update `docs/AI_ASSESSMENT_ENGINE.md`.
