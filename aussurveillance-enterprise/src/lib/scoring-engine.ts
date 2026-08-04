export type ObservationSource = "community" | "integrator" | "customer-audit";

export interface ScoringSite {
  id: string;
  name: string;
  segment: "retail" | "healthcare" | "logistics" | "education";
  region: string;
  insuredValueAud: number;
}

export interface ScoringObservation {
  id: string;
  siteId: string;
  observedAt: string;
  source: ObservationSource;
  cameraCount: number;
  blindSpots: number;
  coverageRatio: number;
  lightingScore: number;
  maintenanceScore: number;
  verifierConfidence: number;
  contributorReputation: number;
  volatility: number;
}

export interface SiteScore {
  site: ScoringSite;
  riskScore: number;
  confidenceScore: number;
  freshnessScore: number;
  blindSpotIndex: number;
  coverageScore: number;
  trendDelta: number;
  riskTier: "low" | "moderate" | "elevated" | "critical";
  lastObservedAt: string;
  observationCount: number;
  estimatedMonthlyExposureAud: number;
  recommendedActions: string[];
  underwriting?: UnderwritingDecision;
}

export interface PortfolioSummary {
  asOf: string;
  portfolioRiskScore: number;
  portfolioFreshnessScore: number;
  portfolioConfidenceScore: number;
  atRiskSites: number;
  protectedSites: number;
  totalSites: number;
  estimatedMonthlyExposureAud: number;
  underwriting?: {
    approve: number;
    conditional: number;
    refer: number;
    decline: number;
  };
  sites: SiteScore[];
}

export interface UnderwritingDecision {
  decision: "approve" | "conditional" | "refer" | "decline";
  premiumAdjustmentPct: number;
  inspectionPriority: "routine" | "elevated" | "urgent" | "critical";
  rationale: string[];
  requiredControls: string[];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function asPercent(value: number): number {
  return Math.round(clamp(value) * 100);
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max((a.getTime() - b.getTime()) / (1000 * 60 * 60), 0);
}

function freshnessWeight(observation: ScoringObservation, asOf: Date): number {
  const ageHours = hoursBetween(asOf, new Date(observation.observedAt));
  const halfLife = 72 + (1 - observation.volatility) * 240;
  return Math.exp((-Math.log(2) * ageHours) / halfLife);
}

function sourceWeight(source: ObservationSource): number {
  if (source === "customer-audit") {
    return 1;
  }
  if (source === "integrator") {
    return 0.92;
  }
  return 0.78;
}

function weightedAverage(
  values: number[],
  weights: number[],
  fallback = 0,
): number {
  if (values.length === 0 || weights.length !== values.length) {
    return fallback;
  }

  const denominator = weights.reduce((total, weight) => total + weight, 0);
  if (denominator === 0) {
    return fallback;
  }

  const numerator = values.reduce(
    (total, value, index) => total + value * weights[index],
    0,
  );
  return numerator / denominator;
}

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

interface ExposureCalibration {
  baseLossRate: number;
  riskSlope: number;
  confidencePenaltySlope: number;
  freshnessPenaltySlope: number;
}

function exposureCalibration(): ExposureCalibration {
  return {
    baseLossRate: numericEnv("EXPOSURE_BASE_LOSS_RATE", 0.0048),
    riskSlope: numericEnv("EXPOSURE_RISK_SLOPE", 0.0265),
    confidencePenaltySlope: numericEnv("EXPOSURE_CONFIDENCE_PENALTY", 0.42),
    freshnessPenaltySlope: numericEnv("EXPOSURE_FRESHNESS_PENALTY", 0.28),
  };
}

function segmentExposureMultiplier(segment: ScoringSite["segment"]): number {
  if (segment === "logistics") {
    return 1.18;
  }
  if (segment === "healthcare") {
    return 1.12;
  }
  if (segment === "education") {
    return 0.92;
  }
  return 1;
}

function estimateMonthlyExposureAud(input: {
  site: ScoringSite;
  combinedRisk: number;
  confidence: number;
  freshness: number;
}): number {
  const calibration = exposureCalibration();
  const confidencePenalty =
    1 + (1 - clamp(input.confidence)) * calibration.confidencePenaltySlope;
  const freshnessPenalty =
    1 + (1 - clamp(input.freshness)) * calibration.freshnessPenaltySlope;
  const rate =
    calibration.baseLossRate +
    clamp(input.combinedRisk) * calibration.riskSlope * confidencePenalty * freshnessPenalty;
  const exposure =
    input.site.insuredValueAud * rate * segmentExposureMultiplier(input.site.segment);
  return Math.max(Math.round(exposure), 0);
}

function riskTier(score: number): SiteScore["riskTier"] {
  if (score >= 80) {
    return "low";
  }
  if (score >= 65) {
    return "moderate";
  }
  if (score >= 50) {
    return "elevated";
  }
  return "critical";
}

function recommendationList(site: SiteScore): string[] {
  const recommendations: string[] = [];
  if (site.blindSpotIndex > 35) {
    recommendations.push("Deploy targeted blind-spot remediation sprint.");
  }
  if (site.freshnessScore < 65) {
    recommendations.push("Trigger high-priority re-verification workflow.");
  }
  if (site.confidenceScore < 70) {
    recommendations.push("Increase partner-audited observations this cycle.");
  }
  if (site.coverageScore < 70) {
    recommendations.push("Add perimeter and ingress camera overlap coverage.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain current controls and monitor weekly drift.");
  }
  return recommendations;
}

function underwritingDecision(site: SiteScore): UnderwritingDecision {
  let decision: UnderwritingDecision["decision"] = "approve";
  if (site.riskScore < 40 || site.coverageScore < 35) {
    decision = "decline";
  } else if (
    site.riskScore < 56 ||
    site.confidenceScore < 60 ||
    site.freshnessScore < 58
  ) {
    decision = "refer";
  } else if (site.riskScore < 72 || site.blindSpotIndex > 32) {
    decision = "conditional";
  }

  const premiumAdjustmentPct = Math.round(
    clamp(
      ((70 - site.riskScore) * 0.46 +
        (68 - site.confidenceScore) * 0.12 +
        (66 - site.freshnessScore) * 0.1 +
        Math.max(site.blindSpotIndex - 24, 0) * 0.24 +
        (decision === "decline" ? 20 : decision === "refer" ? 10 : 0)) /
        100,
      -0.2,
      0.95,
    ) * 100,
  );

  const requiredControls: string[] = [];
  if (site.coverageScore < 72) {
    requiredControls.push("Perimeter and ingress overlap camera upgrade.");
  }
  if (site.blindSpotIndex > 30) {
    requiredControls.push("Blind-spot remediation blueprint with install milestones.");
  }
  if (site.freshnessScore < 65) {
    requiredControls.push("30-day re-verification evidence package.");
  }
  if (site.confidenceScore < 67) {
    requiredControls.push("Independent integrator audit for camera quality assurance.");
  }
  if (requiredControls.length === 0) {
    requiredControls.push("Maintain current controls and keep quarterly verification cadence.");
  }

  const rationale = [
    `Risk ${site.riskScore}/100 with coverage ${site.coverageScore}/100 and blind-spot index ${site.blindSpotIndex}/100.`,
    `Confidence ${site.confidenceScore}/100 and freshness ${site.freshnessScore}/100 drive evidentiary trust for underwriting.`,
  ];
  if (site.trendDelta < -4) {
    rationale.push("Coverage trend is deteriorating versus prior observation window.");
  } else if (site.trendDelta > 4) {
    rationale.push("Coverage trend is improving versus prior observation window.");
  }

  let inspectionPriority: UnderwritingDecision["inspectionPriority"] = "routine";
  if (decision === "decline") {
    inspectionPriority = "critical";
  } else if (decision === "refer") {
    inspectionPriority = "urgent";
  } else if (decision === "conditional") {
    inspectionPriority = "elevated";
  }

  return {
    decision,
    premiumAdjustmentPct,
    inspectionPriority,
    rationale,
    requiredControls,
  };
}

function trendDeltaForObservations(
  observations: ScoringObservation[],
  asOf: Date,
): number {
  const recent = observations.filter((item) => {
    const age = hoursBetween(asOf, new Date(item.observedAt));
    return age <= 24 * 21;
  });
  const previous = observations.filter((item) => {
    const age = hoursBetween(asOf, new Date(item.observedAt));
    return age > 24 * 21 && age <= 24 * 70;
  });

  if (recent.length === 0 || previous.length === 0) {
    return 0;
  }

  const recentCoverage =
    recent.reduce((sum, item) => sum + item.coverageRatio, 0) / recent.length;
  const previousCoverage =
    previous.reduce((sum, item) => sum + item.coverageRatio, 0) / previous.length;
  return Math.round((recentCoverage - previousCoverage) * 100);
}

export function scoreSite(
  site: ScoringSite,
  siteObservations: ScoringObservation[],
  asOf: Date,
): SiteScore {
  const weights = siteObservations.map((item) => {
    const freshness = freshnessWeight(item, asOf);
    const trust = weightedAverage(
      [
        item.verifierConfidence,
        item.contributorReputation,
        sourceWeight(item.source),
      ],
      [0.45, 0.25, 0.3],
      0.7,
    );
    return freshness * trust;
  });

  const blindSpotRatios = siteObservations.map((item) =>
    clamp(item.blindSpots / Math.max(item.cameraCount, 1)),
  );

  const weightedCoverage = weightedAverage(
    siteObservations.map((item) => item.coverageRatio),
    weights,
    0.5,
  );
  const weightedBlindSpots = weightedAverage(blindSpotRatios, weights, 0.5);
  const weightedLighting = weightedAverage(
    siteObservations.map((item) => item.lightingScore),
    weights,
    0.5,
  );
  const weightedMaintenance = weightedAverage(
    siteObservations.map((item) => item.maintenanceScore),
    weights,
    0.5,
  );
  const weightedFreshness = weightedAverage(
    siteObservations.map((item) => freshnessWeight(item, asOf)),
    weights,
    0.45,
  );
  const weightedConfidence = weightedAverage(
    siteObservations.map((item) =>
      weightedAverage(
        [
          item.verifierConfidence,
          item.contributorReputation,
          sourceWeight(item.source),
        ],
        [0.45, 0.25, 0.3],
        0.7,
      ),
    ),
    weights,
    0.65,
  );

  const combinedRisk =
    (1 - weightedCoverage) * 0.45 +
    weightedBlindSpots * 0.3 +
    (1 - weightedLighting) * 0.15 +
    (1 - weightedMaintenance) * 0.1;
  const score = asPercent(1 - combinedRisk);

  const lastObservedAt = siteObservations
    .map((item) => item.observedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const trendDelta = trendDeltaForObservations(siteObservations, asOf);
  const exposure = estimateMonthlyExposureAud({
    site,
    combinedRisk,
    confidence: weightedConfidence,
    freshness: weightedFreshness,
  });

  const siteScore: SiteScore = {
    site,
    riskScore: score,
    confidenceScore: asPercent(weightedConfidence),
    freshnessScore: asPercent(weightedFreshness),
    blindSpotIndex: asPercent(weightedBlindSpots),
    coverageScore: asPercent(weightedCoverage),
    trendDelta,
    riskTier: riskTier(score),
    lastObservedAt: lastObservedAt ?? asOf.toISOString(),
    observationCount: siteObservations.length,
    estimatedMonthlyExposureAud: exposure,
    recommendedActions: [],
    underwriting: {
      decision: "refer",
      premiumAdjustmentPct: 0,
      inspectionPriority: "routine",
      rationale: [],
      requiredControls: [],
    },
  };
  siteScore.recommendedActions = recommendationList(siteScore);
  siteScore.underwriting = underwritingDecision(siteScore);
  return siteScore;
}

export function buildPortfolioSummary(
  sites: ScoringSite[],
  observations: ScoringObservation[],
  asOf = new Date("2026-08-02T22:00:00.000Z"),
): PortfolioSummary {
  const scoredSites = sites
    .map((site) => {
      const siteObservations = observations.filter((item) => item.siteId === site.id);
      return scoreSite(site, siteObservations, asOf);
    })
    .sort((a, b) => a.riskScore - b.riskScore);

  const avgRiskScore = Math.round(
    scoredSites.reduce((sum, site) => sum + site.riskScore, 0) / scoredSites.length,
  );
  const avgFreshness = Math.round(
    scoredSites.reduce((sum, site) => sum + site.freshnessScore, 0) /
      scoredSites.length,
  );
  const avgConfidence = Math.round(
    scoredSites.reduce((sum, site) => sum + site.confidenceScore, 0) /
      scoredSites.length,
  );
  const atRiskSites = scoredSites.filter((site) => site.riskScore < 65).length;
  const totalExposure = scoredSites.reduce(
    (sum, site) => sum + site.estimatedMonthlyExposureAud,
    0,
  );
  const underwriting = scoredSites.reduce(
    (summary, site) => {
      const decision = site.underwriting?.decision ?? "refer";
      summary[decision] += 1;
      return summary;
    },
    { approve: 0, conditional: 0, refer: 0, decline: 0 },
  );

  return {
    asOf: asOf.toISOString(),
    portfolioRiskScore: avgRiskScore,
    portfolioFreshnessScore: avgFreshness,
    portfolioConfidenceScore: avgConfidence,
    atRiskSites,
    protectedSites: scoredSites.length - atRiskSites,
    totalSites: scoredSites.length,
    estimatedMonthlyExposureAud: totalExposure,
    underwriting,
    sites: scoredSites,
  };
}
