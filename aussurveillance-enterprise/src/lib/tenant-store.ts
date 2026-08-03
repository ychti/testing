import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { PortfolioSummary } from "@/lib/scoring-engine";

export interface TenantRecord {
  id: string;
  name: string;
  industry: string;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "paused";
}

export interface ImportRunRecord {
  id: string;
  tenantId: string;
  source:
    | "legacy-file"
    | "firestore-admin"
    | "live-public"
    | "official-state-feeds"
    | "google-streetview";
  authMode?: string;
  actorId: string;
  createdAt: string;
  warnings: string[];
  ingestion: {
    markersReceived: number;
    markersAccepted: number;
    invalidMarkers: number;
    generatedSites: number;
    generatedObservations: number;
  };
  coverage?: {
    totalMarkersAfterNormalization: number;
    duplicateMarkersCollapsed: number;
    representedStateCount: number;
    nationalCoverageScore: number;
    assetsProvided?: number;
    markersMatchedToAssets?: number;
    unmatchedMarkers?: number;
    generatedAssetSites?: number;
    byState: Array<{
      state: string;
      markerCount: number;
      siteCount: number;
      avgConfidence: number;
    }>;
  };
  summary: PortfolioSummary;
}

export interface AssetRecord {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  region?: string;
  segment?: "retail" | "healthcare" | "logistics" | "education";
  insuredValueAud?: number;
  createdAt: string;
  updatedAt: string;
}

interface TenantStore {
  schemaVersion: number;
  tenants: TenantRecord[];
  importRuns: ImportRunRecord[];
  assets: AssetRecord[];
}

const DEFAULT_TENANT_ID = "tenant-default";
const DEFAULT_TENANT_NAME = "Default pilot workspace";
let pendingStoreWrite: Promise<unknown> = Promise.resolve();

function tenantStorePath(): string {
  return (
    process.env.ENTERPRISE_TENANT_STORE_PATH ??
    "/tmp/aussurveillance-enterprise-tenants.json"
  );
}

function emptyStore(): TenantStore {
  return {
    schemaVersion: 2,
    tenants: [],
    importRuns: [],
    assets: [],
  };
}

async function readStore(): Promise<TenantStore> {
  const filePath = tenantStorePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as TenantStore;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.tenants) ||
      !Array.isArray(parsed.importRuns)
    ) {
      return emptyStore();
    }
    if (!Array.isArray(parsed.assets)) {
      (parsed as TenantStore).assets = [];
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: TenantStore): Promise<void> {
  const filePath = tenantStorePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

async function withStoreWrite<T>(operation: (store: TenantStore) => T | Promise<T>) {
  const run = pendingStoreWrite.then(async () => {
    const store = await readStore();
    const result = await operation(store);
    await writeStore(store);
    return result;
  });
  pendingStoreWrite = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDefaultTenantInStore(store: TenantStore): TenantRecord {
  let existing = store.tenants.find((tenant) => tenant.id === DEFAULT_TENANT_ID);
  if (!existing) {
    existing = {
      id: DEFAULT_TENANT_ID,
      name: DEFAULT_TENANT_NAME,
      industry: "security",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "active",
    };
    store.tenants.push(existing);
  }
  return existing;
}

export async function ensureDefaultTenant(): Promise<TenantRecord> {
  return withStoreWrite((store) => ensureDefaultTenantInStore(store));
}

export async function listTenants(): Promise<TenantRecord[]> {
  return withStoreWrite((store) => {
    ensureDefaultTenantInStore(store);
    return [...store.tenants].sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function getTenant(tenantId: string): Promise<TenantRecord | null> {
  return withStoreWrite((store) => {
    ensureDefaultTenantInStore(store);
    return store.tenants.find((tenant) => tenant.id === tenantId) ?? null;
  });
}

export async function createTenant(input: {
  name: string;
  industry?: string;
  ownerEmail?: string;
}): Promise<TenantRecord> {
  return withStoreWrite((store) => {
    ensureDefaultTenantInStore(store);
    const now = nowIso();
    const tenant: TenantRecord = {
      id: `tenant-${randomUUID()}`,
      name: input.name.trim(),
      industry: input.industry?.trim() || "security",
      ownerEmail: input.ownerEmail?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    store.tenants.push(tenant);
    return tenant;
  });
}

export async function resolveTenantId(tenantId?: string): Promise<string> {
  return withStoreWrite((store) => {
    const defaultTenant = ensureDefaultTenantInStore(store);
    if (!tenantId) {
      return defaultTenant.id;
    }
    const exists = store.tenants.some((tenant) => tenant.id === tenantId);
    if (!exists) {
      throw new Error(`Tenant ${tenantId} not found.`);
    }
    return tenantId;
  });
}

export async function listTenantAssets(tenantId: string): Promise<AssetRecord[]> {
  return withStoreWrite((store) => {
    ensureDefaultTenantInStore(store);
    const tenant = store.tenants.find((item) => item.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found.`);
    }
    return store.assets
      .filter((asset) => asset.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function replaceTenantAssets(
  tenantId: string,
  assets: Array<{
    name: string;
    address: string;
    lat: number;
    lng: number;
    region?: string;
    segment?: AssetRecord["segment"];
    insuredValueAud?: number;
  }>,
): Promise<AssetRecord[]> {
  return withStoreWrite((store) => {
    ensureDefaultTenantInStore(store);
    const tenant = store.tenants.find((item) => item.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found.`);
    }
    store.assets = store.assets.filter((asset) => asset.tenantId !== tenantId);
    const now = nowIso();
    const created = assets.map((asset) => ({
      id: `asset-${randomUUID()}`,
      tenantId,
      name: asset.name.trim(),
      address: asset.address.trim(),
      lat: asset.lat,
      lng: asset.lng,
      region: asset.region?.trim() || undefined,
      segment: asset.segment,
      insuredValueAud:
        typeof asset.insuredValueAud === "number" && Number.isFinite(asset.insuredValueAud)
          ? Math.max(Math.round(asset.insuredValueAud), 0)
          : undefined,
      createdAt: now,
      updatedAt: now,
    }));
    store.assets.push(...created);
    tenant.updatedAt = now;
    return created;
  });
}

export async function saveImportRun(input: {
  tenantId?: string;
  source: ImportRunRecord["source"];
  authMode?: string;
  actorId: string;
  warnings: string[];
  ingestion: ImportRunRecord["ingestion"];
  coverage?: ImportRunRecord["coverage"];
  summary: PortfolioSummary;
}): Promise<ImportRunRecord> {
  return withStoreWrite((store) => {
    const defaultTenant = ensureDefaultTenantInStore(store);
    const tenantId = input.tenantId?.trim() || defaultTenant.id;
    const tenant = store.tenants.find((item) => item.id === tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found.`);
    }

    const run: ImportRunRecord = {
      id: `run-${randomUUID()}`,
      tenantId: tenant.id,
      source: input.source,
      authMode: input.authMode,
      actorId: input.actorId,
      createdAt: nowIso(),
      warnings: input.warnings,
      ingestion: input.ingestion,
      coverage: input.coverage,
      summary: input.summary,
    };
    store.importRuns.push(run);
    tenant.updatedAt = nowIso();
    return run;
  });
}

export async function listImportRuns(
  tenantId: string,
  limit = 30,
): Promise<ImportRunRecord[]> {
  return withStoreWrite((store) => {
    ensureDefaultTenantInStore(store);
    return store.importRuns
      .filter((run) => run.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  });
}

export async function getLatestImportRun(
  tenantId: string,
): Promise<ImportRunRecord | null> {
  const runs = await listImportRuns(tenantId, 1);
  return runs[0] ?? null;
}

export async function getTenantTrend(tenantId: string, limit = 20) {
  const runs = await listImportRuns(tenantId, limit);
  return runs
    .slice()
    .reverse()
    .map((run) => ({
      runId: run.id,
      recordedAt: run.createdAt,
      source: run.source,
      authMode: run.authMode ?? "unknown",
      riskScore: run.summary.portfolioRiskScore,
      confidenceScore: run.summary.portfolioConfidenceScore,
      freshnessScore: run.summary.portfolioFreshnessScore,
      exposureAud: run.summary.estimatedMonthlyExposureAud,
      atRiskSites: run.summary.atRiskSites,
      totalSites: run.summary.totalSites,
    }));
}

