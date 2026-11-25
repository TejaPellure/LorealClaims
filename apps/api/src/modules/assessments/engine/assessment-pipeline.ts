// The assessment pipeline: load -> gather evidence -> ask Claude -> validate shape -> save.
// Claude does ALL the judging (verdict, score, which studies matter, reasoning). The backend only supplies facts,
// checks the answer is well-formed and cites real studies, and stores it. Framework-light on purpose so it is easy to test.
import {
  BadGatewayException, BadRequestException, GatewayTimeoutException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import { EvidenceRole, Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { validateClaimReadiness } from '../../claims/claim-rules';
import { InvalidAiResponseError, validateAiAssessment } from './ai-schema';
import { retrieveEvidence } from './evidence-retrieval';
import { PROMPT_VERSION } from './prompt';
import { AssessmentProvider, ProviderError } from './providers/providers';
import { ClaimInput, EvidencePackage, UsageRole } from './types';

export interface AssessOptions {
  /** Re-run even if an identical assessment already exists. */
  forceNew?: boolean;
}

const MAX_ATTEMPTS = 2; // one retry with validation feedback if the model output is malformed
const ROLE_TO_STORED: Record<UsageRole, EvidenceRole> = { SUPPORTS: 'SUPPORTING', DISAGREES: 'CONTRADICTORY', BACKGROUND: 'CONTEXT' };

export class AssessmentPipeline {
  /** Duplicate protection for concurrent clicks: identical inputs share one in-flight run. */
  private readonly inFlight = new Map<string, Promise<{ id: string; reused: boolean }>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AssessmentProvider,
  ) {}

  async run(claimId: string, options: AssessOptions = {}): Promise<{ id: string; reused: boolean }> {
    const pkg = await this.buildPackage(claimId);
    const inputHash = this.hashInputs(pkg);

    if (!options.forceNew) {
      const existing = await this.prisma.assessment.findFirst({ where: { claimId, inputHash }, orderBy: { createdAt: 'desc' } });
      if (existing) return { id: existing.id, reused: true };
    }
    const key = `${claimId}:${inputHash}:${options.forceNew ? 'force' : 'reuse'}`;
    const running = this.inFlight.get(key);
    if (running) return running;

    const job = this.execute(pkg, inputHash).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  // ── Load authoritative data from the database; the client never supplies evidence or formulations ──
  private async buildPackage(claimId: string): Promise<EvidencePackage> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { product: true, formulation: { include: { ingredients: { orderBy: { position: 'asc' }, include: { ingredient: true } } } } },
    });
    if (!claim) throw new NotFoundException('Claim not found');

    const lines = claim.formulation.ingredients.map((l) => ({ ingredientId: l.ingredientId, percentage: l.percentage.toNumber(), ingredientName: l.ingredient.name }));
    const problems = validateClaimReadiness(claim, { ingredients: lines });
    if (problems.length) throw new BadRequestException({ message: 'This claim cannot be assessed yet.', details: problems });

    const claimInput: ClaimInput = {
      id: claim.id, title: claim.title, description: claim.description, benefits: claim.benefits, targetValue: claim.targetValue?.toNumber() ?? null,
      measurementUnit: claim.measurementUnit, durationWeeks: claim.durationWeeks, targetPopulation: claim.targetPopulation,
    };
    const formulation = {
      id: claim.formulation.id, productName: claim.product.name,
      ingredients: claim.formulation.ingredients.map((l) => ({
        ingredientId: l.ingredientId, name: l.ingredient.name, inciName: l.ingredient.inciName, percentage: l.percentage.toNumber(), function: l.ingredient.primaryFunction,
        minConcentration: l.ingredient.minConcentration?.toNumber() ?? null, maxConcentration: l.ingredient.maxConcentration?.toNumber() ?? null,
      })),
    };
    return { claim: claimInput, formulation, evidence: await retrieveEvidence(this.prisma, formulation) };
  }

  /** Fingerprint of everything that influences the result. Same fingerprint => same assessment. */
  private hashInputs(pkg: EvidencePackage): string {
    return createHash('sha256').update(JSON.stringify({ pkg, prompt: PROMPT_VERSION })).digest('hex');
  }

  // ── Ask Claude, validate its answer, save it exactly as given ──
  private async execute(pkg: EvidencePackage, inputHash: string) {
    let feedback: string[] | undefined;
    let output: Awaited<ReturnType<AssessmentProvider['generate']>> | undefined;
    let validated: ReturnType<typeof validateAiAssessment> | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !validated; attempt++) {
      try {
        output = await this.provider.generate({ package: pkg, feedback });
        validated = validateAiAssessment(output.payload, pkg.evidence);
      } catch (error) {
        const retryable = error instanceof InvalidAiResponseError || (error instanceof ProviderError && error.kind === 'BAD_RESPONSE');
        if (retryable && attempt < MAX_ATTEMPTS) {
          feedback = error instanceof InvalidAiResponseError ? error.problems : [error.message];
          continue;
        }
        throw this.toHttpError(error);
      }
    }
    if (!validated || !output) throw new BadGatewayException('Claude did not return a usable assessment.');

    const roleById = new Map(validated.evidenceRoles.map((r) => [r.evidenceId, r.role]));
    const notesById = new Map([...validated.ingredientEvidenceAnalysis, ...validated.formulationEvidenceAnalysis, ...validated.contradictoryEvidence].map((n) => [n.evidenceId, n.note]));
    const json = (value: unknown) => value as Prisma.InputJsonValue;

    const saved = await this.prisma.assessment.create({
      data: {
        claimId: pkg.claim.id, formulationId: pkg.formulation.id, model: output.model, promptVersion: PROMPT_VERSION, inputHash,
        verdict: validated.verdict, evidenceScore: validated.score, scoreExplanation: validated.scoreExplanation,
        summary: validated.summary, reasoning: validated.reasoning, missingEvidence: validated.missingEvidence, recommendedTests: validated.recommendedTests,
        aiResult: json(validated), rawResponse: json(output.raw),
        claimSnapshot: json(pkg.claim), formulationSnapshot: json(pkg.formulation), evidenceSnapshot: json(pkg.evidence),
        evidence: {
          // Every study that was sent is kept with the role Claude gave it (studies it did not mention are background).
          create: pkg.evidence.map((e) => ({ evidenceId: e.id, role: ROLE_TO_STORED[roleById.get(e.id) ?? 'BACKGROUND'], note: notesById.get(e.id) })),
        },
      },
    });
    return { id: saved.id, reused: false };
  }

  private toHttpError(error: unknown): Error {
    if (error instanceof InvalidAiResponseError) return new BadGatewayException({ message: 'Claude returned an invalid assessment.', details: error.problems });
    if (error instanceof ProviderError) {
      switch (error.kind) {
        case 'TIMEOUT': return new GatewayTimeoutException(error.message);
        case 'REFUSAL': return new UnprocessableEntityException(error.message);
        case 'BAD_RESPONSE': return new BadGatewayException(error.message);
        default: return new ServiceUnavailableException(error.message);
      }
    }
    return error as Error;
  }
}
