// Deciding whether a study is about the benefit a claim makes.
//
// Claims arrive as wording + optional description + optional benefit chips (presets or anything the user types),
// and studies carry benefit tags plus an endpoint and title. Rather than a fixed list, both sides are reduced to
// a small set of benefit "concepts" with keyword patterns, so "reduces pimples", "blemish-prone skin" and the
// "acne-blemishes" chip all meet the same concept. Anything unrecognised still matches by identical tag.

/** Concept name -> keyword pattern (lower-case text). Order is irrelevant; a text may match several concepts. */
const CONCEPT_PATTERNS: Record<string, RegExp> = {
  hydration: /hydrat|moistur|dryness|dry skin|xerosis|water.?(loss|retention|binding)|plump/,
  wrinkle: /wrinkl|fine.?line|crow.?s|rhytid|photo.?ag|anti.?ag|\bag(e)?ing\b/,
  firmness: /firm|elastic|suppleness|sagg|lifting/,
  barrier: /barrier|\btewl\b|transepidermal|permeab/,
  pigmentation: /pigment|brighten|lighten|whiten|dark spot|age spot|sun spot|melasma|lentigo|\bskin tone\b|even.?tone|radian|\bglow\b|discolou?r/,
  soothing: /sooth|calm|redness|erythema|irritat|sensitiv|rosacea/,
  acne: /acne|pimple|blemish|breakout|\bzits?\b|comedon|blackhead|whitehead/,
  oil: /sebum|\boil(y)?\b|\bshine\b|greas|mattif/,
  pores: /\bpores?\b/,
  exfoliation: /exfoli|keratoly|\bpeel|desquam|rough|smoothness|texture/,
  antioxidant: /antioxid|free.?radical|oxidative|photoprotect|\buv[ab]?\b/,
};

/** Lower-case a benefit label into a stable tag: "Acne / Blemishes" -> "acne-blemishes". */
export function normalizeBenefit(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function conceptsOf(text: string): Set<string> {
  const lower = text.toLowerCase();
  return new Set(Object.entries(CONCEPT_PATTERNS).filter(([, pattern]) => pattern.test(lower)).map(([concept]) => concept));
}

export interface ClaimBenefitInput {
  title: string;
  description?: string | null;
  benefits: string[];
}

export interface StudyBenefitInput {
  benefits: string[];
  endpoint: string;
  title: string;
}

/** Concepts a claim is about, taken from every piece of text the user supplied. */
export function claimConcepts(claim: ClaimBenefitInput): Set<string> {
  return conceptsOf([claim.title, claim.description ?? '', ...claim.benefits].join(' '));
}

/** True when the study measures something the claim is about (shared concept, or an identical custom tag). */
export function studyMatchesClaim(claim: ClaimBenefitInput, study: StudyBenefitInput): boolean {
  const wanted = claimConcepts(claim);
  const offered = conceptsOf([...study.benefits, study.endpoint, study.title].join(' '));
  if ([...wanted].some((concept) => offered.has(concept))) return true;
  const claimTags = new Set(claim.benefits.map(normalizeBenefit));
  return study.benefits.map(normalizeBenefit).some((tag) => claimTags.has(tag));
}
