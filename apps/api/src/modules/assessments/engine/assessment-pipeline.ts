// The assessment pipeline: retrieval -> scoring -> AI provider -> validation -> guardrails -> persistence.
// Framework-light on purpose (plain class, constructor injection by hand) so the seed script can reuse it.
import {
  BadGatewayException, BadRequestException, GatewayTimeoutException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { AppConfig } from '../../../common/config';
import { ASSESSABLE_STATUSES, validateClaimReadiness } from '../../claims/claim-rules';
import { InvalidAiResponseError, validateAiAssessment } from './ai-schema';
import { retrieveEvidence } from './evidence-retrieval';
import { applyGuardrails } from './guardrails';
import { PROMPT_VERSION } from './prompt';
import { AssessmentProvider, ProviderError } from './providers/providers';
import { computeScore } from './scoring';
import { ClaimInput, EvidencePackage } from './types';

export interface AssessOptions {
  /** Re-run even if an identical assessment already exists. */
  forceNew?: boolean;
}

const MAX_ATTEMPTS = 2; // one retry with validation feedback if the model output is malformed

export class AssessmentPipeline {
  /** Duplicate protection for concurrent clicks: identical inputs share one in-flight run. */
  private readonly inFlight = new Map<string, Promise<{ id: string; reused: boolean }>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AssessmentProvider,
    private readonly config: AppConfig['assessment'],
  ) {}

  async run(claimId: string, options: AssessOptions, createdBy: string): Promise<{ id: string; reused: boolean }> {
    const pkg = await this.buildPackage(claimId);
    const inputHash = this.hashInputs(pkg);

    if (!options.forceNew) {
      const existing = await this.prisma.assessment.findFirst({ where: { claimId, inputHash }, orderBy: { createdAt: 'desc' } });
      if (existing) return { id: existing.id, reused: true };
    }
    const key = `${claimId}:${inputHash}:${options.forceNew ? 'force' : 'reuse'}`;
    const running = this.inFlight.get(key);
    if (running) return running;

    const job = this.execute(pkg, inputHash, createdBy).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  // ── Step 1-5: authoritative data comes from the database, never from the client ──
  private async buildPackage(claimId: string): Promise<EvidencePackage> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { product: true, formulation: { include: { ingredients: { orderBy: { position: 'asc' }, include: { ingredient: true } } } } },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (!ASSESSABLE_STATUSES.includes(claim.status)) {
      throw new BadRequestException(`Claim status ${claim.status} cannot be assessed. Submit it for assessment first (READY_FOR_ASSESSMENT).`);
    }
    const formulationLines = claim.formulation?.ingredients.map((l) => ({
      ingredientId: l.ingredientId, percentage: l.percentage.toNumber(), ingredientName: l.ingredient.name,
    }));
    const problems = validateClaimReadiness(claim, formulationLines ? { ingredients: formulationLines } : null);
    if (problems.length || !claim.formulation) throw new BadRequestException({ message: 'Claim is not ready for assessment.', details: problems });

    const claimInput: ClaimInput = {
      id: claim.id, title: claim.title, description: claim.description, benefitCategory: claim.benefitCategory,
      targetOutcome: claim.targetOutcome, measurementEndpoint: claim.measurementEndpoint, targetValue: claim.targetValue.toNumber(),
      measurementUnit: claim.measurementUnit, durationWeeks: claim.durationWeeks, targetPopulation: claim.targetPopulation,
      applicationFrequency: claim.applicationFrequency, scientificContext: claim.scientificContext,
    };
    const formulation = {
      id: claim.formulation.id, productName: claim.product.name, version: claim.formulation.version, basis: claim.formulation.basis,
      ingredients: claim.formulation.ingredients.map((l) => ({ ingredientId: l.ingredientId, name: l.ingredient.name, inciName: l.ingredient.inciName, percentage: l.percentage.toNumber() })),
    };
    const evidence = await retrieveEvidence(this.prisma, claimInput, formulation);
    return { claim: claimInput, formulation, evidence };
  }

  /** Fingerprint of everything that influences the result. Same fingerprint => same assessment. */
  private hashInputs(pkg: EvidencePackage): string {
    const material = JSON.stringify({ pkg, provider: this.provider.kind, prompt: PROMPT_VERSION, weights: this.config.weights, min: this.config.supportedMinScore });
    return createHash('sha256').update(material).digest('hex');
  }

  // ── Step 6-12: score, ask the provider, validate, apply guardrails, save ──
  private async execute(pkg: EvidencePackage, inputHash: string, createdBy: string) {
    const score = computeScore(pkg.evidence, this.config.weights);

    let feedback: string[] | undefined;
    let output: Awaited<ReturnType<AssessmentProvider['generate']>> | undefined;
    let validated: ReturnType<typeof validateAiAssessment> | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !validated; attempt++) {
      try {
        output = await this.provider.generate({ package: pkg, score, feedback });
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
    if (!validated || !output) throw new BadGatewayException('The AI provider did not return a usable assessment.');

    const { verdict, notes } = applyGuardrails(validated.verdict, pkg.evidence, score.total, this.config.supportedMinScore);
    const notesById = new Map([...validated.ingredientEvidenceAnalysis, ...validated.formulationEvidenceAnalysis, ...validated.contradictoryEvidence].map((n) => [n.evidenceId, n.note]));
    const json = (value: unknown) => value as Prisma.InputJsonValue;

    const saved = await this.prisma.$transaction(async (tx) => {
      const assessment = await tx.assessment.create({
        data: {
          claimId: pkg.claim.id, formulationId: pkg.formulation.id, provider: this.provider.kind, model: output!.model,
          promptVersion: PROMPT_VERSION, scoringVersion: score.rubricVersion, inputHash, verdict, evidenceScore: score.total,
          scoreBreakdown: json(score), summary: validated!.summary, reasoning: validated!.reasoning,
          missingEvidence: validated!.missingEvidence, recommendedTests: validated!.recommendedTests, guardrailNotes: notes,
          aiResult: json(validated), rawResponse: json(output!.raw),
          claimSnapshot: json(pkg.claim), formulationSnapshot: json(pkg.formulation), evidenceSnapshot: json(pkg.evidence),
          createdBy,
          evidence: {
            create: pkg.evidence.map((e) => ({ evidenceId: e.id, role: e.role, relevanceScore: Number(e.factors.fit.toFixed(3)), note: notesById.get(e.id) })),
          },
        },
      });
      await tx.claim.update({ where: { id: pkg.claim.id }, data: { status: 'ASSESSED' } });
      return assessment;
    });
    return { id: saved.id, reused: false };
  }

  private toHttpError(error: unknown): Error {
    if (error instanceof InvalidAiResponseError) return new BadGatewayException({ message: 'The AI returned an invalid assessment.', details: error.problems });
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
