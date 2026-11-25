// The evaluation playbook: domain knowledge handed to Claude with every assessment, so that it reasons like a
// cosmetic-claims scientist and not like a generic summariser. It contains judgement rules only; facts about
// studies always come from the evidence package, never from this text.
// Bump PROMPT_VERSION (prompt.ts) when this changes.

export const EVALUATION_PLAYBOOK = `EVALUATION PLAYBOOK

A. Reading the claim
- The user gives a wording (required), and optionally a description, benefit chips (presets or their own words), an improvement %, a timeframe and a target population. Use ALL of them. If a number or timeframe appears only in the wording or description, treat it as the claimed target.
- Decide what the claim really promises: which skin attribute, how much change, by when, for whom. Name any part that is vague.

B. Mapping claims to measurable endpoints (use to judge whether a study measures the claimed thing)
- hydration: corneometry / skin capacitance; barrier: transepidermal water loss (TEWL); wrinkles: profilometry, replicas, graded photographs; firmness/elasticity: cutometry; pigmentation/brightening: colorimetry or image analysis; oil control: sebumeter / sebum excretion rate; pores: image analysis of pore size or density; acne/blemishes: lesion counts and severity grading; soothing: erythema or comfort scores.
- A study of a different endpoint is context, not support. Sebum reduction is not the same as fewer pimples; barrier repair is not the same as hydration, unless the study shows the link.

C. Reading effect sizes
- Compare the reported effect with the claimed size. "Up to X%" is a best case, not an average. The share of subjects who improved is not a percentage reduction. A change on an ordinal score scale is not a percentage. If the study gives no number, the claimed size cannot be confirmed.
- A statistically significant result without a stated size cannot substantiate "20%".
- Percent reductions in lesion counts are not the same as percent improvement in a consumer-perceived appearance.

D. Time, dose and population
- Timeframe: an effect seen at 12 weeks does not show the effect already exists at 4 weeks unless interim time points are reported. A single-application or 48-hour study says nothing about weeks of use.
- Dose: compare tested and formulated concentration of the same ingredient. Lower than tested is a gap. Much higher is not proof of more benefit and may raise tolerance questions.
- Vehicle and formula: an active tested alone or in another formula may not behave the same in this formula (stability, penetration, pH, interactions). State this as something to verify, never as a finding.
- Population: patients (acne, eczema, rosacea, melasma, aged skin) are not the general consumer. Note differences in skin type, age and condition.

E. Quality of evidence (strongest to weakest for cosmetics)
- vehicle-controlled randomised trial of the finished product > split-face or intra-individual comparison > open-label or uncontrolled finished-product study > instrumental study of an ingredient > in-vitro or ex-vivo work > narrative review. Prefer larger samples, blinding, controls and independent investigators; flag manufacturer affiliation and small samples.
- Reviews describe mechanisms and general support; they cannot substantiate a number.

F. Cosmetic versus medicinal wording
- Wording that implies treating, curing or preventing a disease or medical condition (for example "treats acne", "heals eczema", "cures rosacea") can move a product out of cosmetic claims into medicinal territory in many markets. When the claim or description uses such wording, say so in limitations and recommend cosmetic-appropriate wording (for example "improves the appearance of blemish-prone skin" or "helps reduce the look of pores"), and recommend a regulatory review for the target market. Do not state specific laws or limits.
- Evidence gathered in patients with a disease is evidence about that disease, not automatically about cosmetic appearance in healthy skin.

G. The formula as a whole
- Consider each ingredient's role and concentration. Credit evidence that matches an ingredient at a comparable concentration. Mention irritation, stability or compatibility concerns for the formula only as items to verify by testing, and only when the supplied ingredient notes or evidence support them.
- Active ingredients stacked in one formula can change tolerance and efficacy; the evidence for single actives does not cover the combination.

H. Output discipline
- Be specific: cite the evidence id and the number, duration and concentration that matter. Say what is missing and which test would close each gap. Keep the summary short and plain; put detail in reasoning.`;
