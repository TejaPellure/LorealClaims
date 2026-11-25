# Business flow

The original process had several handoffs (business proposal, claim manager screening, scientist formulation, evaluator evidence and review). This version collapses it into one short path that a scientist can run alone, while keeping the substance of each step.

```
Formulate (scientist)        Claim (scientist / evaluator)           Result
product name + ingredients   wording + benefit + target + weeks   Claude's evaluation of the
= 100%, save                 + population, submit                 evidence, with a score
```

| Original step | Now |
|---|---|
| Business proposes product and claim | You type the product name, then the claim: a title, optionally a description and benefit chips (presets or your own), and the numbers you know |
| Claim manager checks applicability and feasibility | Claude's report states whether the evidence supports the claim as worded, and what is missing |
| Scientist formulates | Formulate page, with live 100% validation |
| Evaluator attaches evidence | Evidence library: add studies, upload PDFs, link them to ingredients and to the products they tested |
| Evaluator tests product against the claim | Submitting the claim sends it to Claude immediately |
| Review and decision | Removed. The report itself is the outcome; humans act on it (add evidence, re-evaluate, change the claim) |

## Reading a result
- **Supported**: finished-product evidence for this exact formula supports the claim as worded.
- **Not supported**: evidence contradicts the claim or does not reach its size or scope.
- **Inconclusive**: not enough applicable evidence. This is the normal outcome when only ingredient-level studies exist.
- The **evidence score** (0-100) shows how well the available evidence matches the claim. It is a prototype rubric, not a probability.

## Improving a result
Add finished-product evidence for the formula in the Evidence library (link it to the product), then use "Evaluate again with Claude". Every earlier evaluation is kept.

## Not in scope
Authentication, roles, approval workflows and regulatory sign-off. The report is decision support and never legal or regulatory approval.
