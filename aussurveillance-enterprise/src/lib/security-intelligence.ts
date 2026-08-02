export type ObservationSource = "community" | "integrator" | "customer-audit";

export interface Site {
  id: string;
  name: string;
  segment: "retail" | "healthcare" | "logistics" | "education";
  region: string;
  insuredValueAud: number;
}

export interface Observation {
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
  site: Site;
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
}

const AS_OF_DEFAULT = new Date("2026-08-02T22:00:00.000Z");

const SITES: Site[] = [
  {
    id: "au-syd-ret-001",
    name: "Harbour City Retail Cluster",
    segment: "retail",
    region: "Sydney CBD, NSW",
    insuredValueAud: 5_400_000,
  },
  {
    id: "au-mel-hlt-014",
    name: "Southbank Outpatient Campus",
    segment: "healthcare",
    region: "Melbourne, VIC",
    insuredValueAud: 8_900_000,
  },
  {
    id: "au-bri-log-008",
    name: "Rivergate Freight Terminal",
    segment: "logistics",
    region: "Brisbane, QLD",
    insuredValueAud: 14_600_000,
  },
  {
    id: "au-adl-edu-003",
    name: "North Terrace Education Block",
    segment: "education",
    region: "Adelaide, SA",
    insuredValueAud: 4_100_000,
  },
];

const OBSERVATIONS: Observation[] = [
  {
    id: "obs-001",
    siteId: "au-syd-ret-001",
    observedAt: "2026-08-02T18:10:00.000Z",
    source: "integrator",
    cameraCount: 42,
    blindSpots: 5,
    coverageRatio: 0.86,
    lightingScore: 0.79,
    maintenanceScore: 0.84,
    verifierConfidence: 0.95,
    contributorReputation: 0.88,
    volatility: 0.7,
  },
  {
    id: "obs-002",
    siteId: "au-syd-ret-001",
    observedAt: "2026-07-29T10:30:00.000Z",
    source: "community",
    cameraCount: 39,
    blindSpots: 8,
    coverageRatio: 0.78,
    lightingScore: 0.73,
    maintenanceScore: 0.76,
    verifierConfidence: 0.82,
    contributorReputation: 0.74,
    volatility: 0.7,
  },
  {
    id: "obs-003",
    siteId: "au-syd-ret-001",
    observedAt: "2026-06-20T09:20:00.000Z",
    source: "customer-audit",
    cameraCount: 37,
    blindSpots: 9,
    coverageRatio: 0.71,
    lightingScore: 0.7,
    maintenanceScore: 0.69,
    verifierConfidence: 0.9,
    contributorReputation: 0.86,
    volatility: 0.65,
  },
  {
    id: "obs-004",
    siteId: "au-mel-hlt-014",
    observedAt: "2026-08-01T06:15:00.000Z",
    source: "customer-audit",
    cameraCount: 68,
    blindSpots: 4,
    coverageRatio: 0.91,
    lightingScore: 0.88,
    maintenanceScore: 0.93,
    verifierConfidence: 0.97,
    contributorReputation: 0.93,
    volatility: 0.45,
  },
  {
    id: "obs-005",
    siteId: "au-mel-hlt-014",
    observedAt: "2026-07-16T12:00:00.000Z",
    source: "integrator",
    cameraCount: 66,
    blindSpots: 6,
    coverageRatio: 0.87,
    lightingScore: 0.83,
    maintenanceScore: 0.89,
    verifierConfidence: 0.93,
    contributorReputation: 0.9,
    volatility: 0.42,
  },
  {
    id: "obs-006",
    siteId: "au-bri-log-008",
    observedAt: "2026-08-02T03:45:00.000Z",
    source: "community",
    cameraCount: 54,
    blindSpots: 16,
    coverageRatio: 0.63,
    lightingScore: 0.59,
    maintenanceScore: 0.67,
    verifierConfidence: 0.78,
    contributorReputation: 0.72,
    volatility: 0.88,
  },
  {
    id: "obs-007",
    siteId: "au-bri-log-008",
    observedAt: "2026-07-24T19:30:00.000Z",
    source: "integrator",
    cameraCount: 58,
    blindSpots: 12,
    coverageRatio: 0.69,
    lightingScore: 0.64,
    maintenanceScore: 0.7,
    verifierConfidence: 0.89,
    contributorReputation: 0.84,
    volatility: 0.83,
  },
  {
    id: "obs-008",
    siteId: "au-bri-log-008",
    observedAt: "2026-06-22T11:25:00.000Z",
    source: "customer-audit",
    cameraCount: 60,
    blindSpots: 11,
    coverageRatio: 0.7,
    lightingScore: 0.68,
    maintenanceScore: 0.74,
    verifierConfidence: 0.91,
    contributorReputation: 0.89,
    volatility: 0.78,
  },
  {
    id: "obs-009",
    siteId: "au-adl-edu-003",
    observedAt: "2026-07-30T14:40:00.000Z",
    source: "customer-audit",
    cameraCount: 31,
    blindSpots: 5,
    coverageRatio: 0.8,
    lightingScore: 0.81,
    maintenanceScore: 0.79,
    verifierConfidence: 0.9,
    contributorReputation: 0.86,
    volatility: 0.52,
  },
  {
    id: "obs-010",
    siteId: "au-adl-edu-003",
    observedAt: "2026-07-10T08:10:00.000Z",
    source: "community",
    cameraCount: 29,
    blindSpots: 8,
    coverageRatio: 0.74,
    lightingScore: 0.73,
    maintenanceScore: 0.7,
    verifierConfidence: 0.81,
    contributorReputation: 0.76,
    volatility: 0.54,
  },
];

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function asPercent(value: number): number {
  return Math.round(clamp(value) * 100);
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max((a.getTime() - b.getTime()) / (1000 * 60 * 60), 0);
}

function freshnessWeight(observation: Observation, asOf: Date): number {
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

function trendDeltaForObservations(
  observations: Observation[],
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

  const recentCoverage = recent.reduce((sum, item) => sum + item.coverageRatio, 0);
  const previousCoverage = previous.reduce(
    (sum, item) => sum + item.coverageRatio,
    0,
  );
  const recentAverage = recentCoverage / recent.length;
  const previousAverage = previousCoverage / previous.length;
  return Math.round((recentAverage - previousAverage) * 100);
}

export function getSites(): Site[] {
  return SITES;
}

export function getObservations(): Observation[] {
  return OBSERVATIONS;
}

export function scoreSite(site: Site, asOf = AS_OF_DEFAULT): SiteScore {
  const observations = OBSERVATIONS.filter((item) => item.siteId === site.id);
  const weights = observations.map((item) => {
    const freshness = freshnessWeight(item, asOf);
    const trust = weightedAverage(
      [item.verifierConfidence, item.contributorReputation, sourceWeight(item.source)],
      [0.45, 0.25, 0.3],
      0.7,
    );
    return freshness * trust;
  });

  const blindSpotRatios = observations.map((item) =>
    clamp(item.blindSpots / Math.max(item.cameraCount, 1)),
  );
  const weightedCoverage = weightedAverage(
    observations.map((item) => item.coverageRatio),
    weights,
    0.5,
  );
  const weightedBlindSpots = weightedAverage(blindSpotRatios, weights, 0.5);
  const weightedLighting = weightedAverage(
    observations.map((item) => item.lightingScore),
    weights,
    0.5,
  );
  const weightedMaintenance = weightedAverage(
    observations.map((item) => item.maintenanceScore),
    weights,
    0.5,
  );
  const weightedFreshness = weightedAverage(
    observations.map((item) => freshnessWeight(item, asOf)),
    weights,
    0.45,
  );
  const weightedConfidence = weightedAverage(
    observations.map((item) =>
      weightedAverage(
        [item.verifierConfidence, item.contributorReputation, sourceWeight(item.source)],
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

  const lastObservedAt = observations
    .map((item) => item.observedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const trendDelta = trendDeltaForObservations(observations, asOf);
  const baseExposure = site.insuredValueAud * (combinedRisk * 0.027 + 0.005);
  const exposure = Math.round(baseExposure);

  const siteScore: SiteScore = {
    site,
    riskScore: score,
    confidenceScore: asPercent(weightedConfidence),
    freshnessScore: asPercent(weightedFreshness),
    blindSpotIndex: asPercent(weightedBlindSpots),
    coverageScore: asPercent(weightedCoverage),
    trendDelta,
    riskTier: riskTier(score),
    lastObservedAt,
    observationCount: observations.length,
    estimatedMonthlyExposureAud: exposure,
    recommendedActions: [],
  };
  siteScore.recommendedActions = recommendationList(siteScore);
  return siteScore;
}

export function getScoredSites(asOf = AS_OF_DEFAULT): SiteScore[] {
  return SITES.map((site) => scoreSite(site, asOf)).sort(
    (a, b) => a.riskScore - b.riskScore,
  );
}

export function getPortfolioSummary(asOf = AS_OF_DEFAULT) {
  const sites = getScoredSites(asOf);
  const avgRiskScore = Math.round(
    sites.reduce((sum, site) => sum + site.riskScore, 0) / sites.length,
  );
  const avgFreshness = Math.round(
    sites.reduce((sum, site) => sum + site.freshnessScore, 0) / sites.length,
  );
  const avgConfidence = Math.round(
    sites.reduce((sum, site) => sum + site.confidenceScore, 0) / sites.length,
  );
  const atRiskSites = sites.filter((site) => site.riskScore < 65).length;
  const totalExposure = sites.reduce(
    (sum, site) => sum + site.estimatedMonthlyExposureAud,
    0,
  );

  return {
    asOf: asOf.toISOString(),
    portfolioRiskScore: avgRiskScore,
    portfolioFreshnessScore: avgFreshness,
    portfolioConfidenceScore: avgConfidence,
    atRiskSites,
    protectedSites: sites.length - atRiskSites,
    totalSites: sites.length,
    estimatedMonthlyExposureAud: totalExposure,
    sites,
  };
}
