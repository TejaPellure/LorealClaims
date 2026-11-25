# Business workflow

## Process
```
Business team proposes product / claim
  -> Claim manager reviews applicability and feasibility
  -> Scientist creates the formulation (ingredients + concentrations)
  -> Evaluator attaches scientific evidence
  -> AI claim assessment (decision support)
  -> Human evaluator review
  -> Final decision, or additional testing
```

## Roles and what each does in the app
| Persona | Main screens | Typical actions |
|---|---|---|
| Business team | Claims | Create claim proposal, submit it |
| Claim manager | Claims | Start review; accept (applicable and feasible) or reject |
| Scientist | Formulation Studio, Claims | Start formulation, build and version formulas, submit for assessment |
| Evaluator | Evidence Library, Assessment Report | Add/verify evidence, run assessment, approve / reject / request more evidence |

## Claim statuses
`DRAFT` -> `SUBMITTED` -> `UNDER_MANAGER_REVIEW` -> `ACCEPTED_FOR_FORMULATION` (or `REJECTED`) -> `FORMULATION_IN_PROGRESS` -> `AWAITING_EVIDENCE` -> `READY_FOR_ASSESSMENT` -> `ASSESSED` -> `APPROVED_BY_EVALUATOR` | `REQUIRES_MORE_EVIDENCE` | `REJECTED`.
`REQUIRES_MORE_EVIDENCE` can return to `AWAITING_EVIDENCE` or `READY_FOR_ASSESSMENT`; `ASSESSED` can be reopened for re-assessment (for example after adding evidence or a new formulation version). The server enforces the transition table in `claims/claim-rules.ts`.

Submitting for assessment validates the formulation exists, totals 100%, and the claim has all structured fields; it also locks the formulation version.

## AI versus human
The AI verdict (Supported / Not supported / Inconclusive) and the evaluator decision are stored and displayed separately. Only the evaluator changes the claim to Approved/Rejected/Requires more evidence. The platform never states legal or regulatory approval.

## Demo persona selector (not security)
The top-bar persona selector simulates the four roles: it sets an `x-demo-persona` header used to label records, and the UI enables only the actions that persona would take. **It is not authentication or authorisation**: anyone can switch persona and the API does not enforce roles. The data model (`createdBy`, `reviewedBy`) is ready for real RBAC/SSO later.

A "Fast-track to assessment (demo)" button on a claim walks it through every step so a demo needs one click.
