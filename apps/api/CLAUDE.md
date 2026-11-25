# apps/api guidance

- New feature = new folder in `src/modules/<name>/` with `<name>.module.ts` (controller, service, DTOs) registered in `app.module.ts`.
- `modules/assessments/engine/*` is deliberately framework-light (plain classes, constructor injection) so `prisma/seed.ts` can reuse `AssessmentPipeline` via `tsx`. **Do not add Nest decorators that rely on `emitDecoratorMetadata` to files under `engine/`, `claims/claim-rules.ts`, `formulations/composition.ts` or `common/config.ts`.**
- Route order matters: declare static routes (`compare`, `meta`, `assess`) before `:id`.
- Every request body DTO is validated (`whitelist` + `forbidNonWhitelisted`). Never accept evidence, formulation data or file paths from clients on assessment endpoints.
- New providers implement `AssessmentProvider` (`engine/providers/providers.ts`) and are selected in `createProvider`.
- Changing prompt wording or the evidence package format: bump `PROMPT_VERSION`. Changing scoring: bump `RUBRIC_VERSION` and update `docs/AI_ASSESSMENT_ENGINE.md`.
