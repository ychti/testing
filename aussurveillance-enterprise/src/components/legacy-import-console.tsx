"use client";

import { useMemo, useState } from "react";
import type { SiteScore } from "@/lib/scoring-engine";
import { formatCurrencyAud } from "@/lib/format";

interface ImportResult {
  summary: {
    portfolioRiskScore: number;
    portfolioFreshnessScore: number;
    portfolioConfidenceScore: number;
    estimatedMonthlyExposureAud: number;
    totalSites: number;
    atRiskSites: number;
    sites: SiteScore[];
  };
  ingestion: {
    markersReceived: number;
    markersAccepted: number;
    invalidMarkers: number;
    generatedSites: number;
    generatedObservations: number;
  };
  warnings: string[];
}

function extractMarkers(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const maybeItems = (payload as Record<string, unknown>).items;
    if (Array.isArray(maybeItems)) {
      return maybeItems;
    }
    const maybeMarkers = (payload as Record<string, unknown>).markers;
    if (Array.isArray(maybeMarkers)) {
      return maybeMarkers;
    }
  }
  return [];
}

export function LegacyImportConsole() {
  const [status, setStatus] = useState<string>("Upload a marker export JSON.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [markerCount, setMarkerCount] = useState<number>(0);
  const [firestoreLimit, setFirestoreLimit] = useState<number>(10000);
  const [updatedAfter, setUpdatedAfter] = useState<string>("");

  const highestRiskSites = useMemo(() => {
    if (!result) {
      return [];
    }
    return [...result.summary.sites].sort((a, b) => a.riskScore - b.riskScore).slice(0, 6);
  }, [result]);

  const handleFileUpload = async (file: File | null) => {
    if (!file) {
      return;
    }
    setLoading(true);
    setStatus("Parsing file...");
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const markers = extractMarkers(payload);
      setMarkerCount(markers.length);

      if (markers.length === 0) {
        setStatus("No markers found. Expected an array or { items: [...] }.");
        setResult(null);
        return;
      }

      setStatus(`Running ingestion and scoring for ${markers.length} markers...`);
      const response = await fetch("/api/v1/import/legacy-markers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markers }),
      });

      const responseJson = (await response.json()) as ImportResult | { error: string };
      if (!response.ok) {
        setStatus(
          "Ingestion failed: " +
            ("error" in responseJson ? responseJson.error : "unexpected error"),
        );
        setResult(null);
        return;
      }

      const parsedResult = responseJson as ImportResult;
      setResult(parsedResult);
      setStatus("Ingestion complete. Review generated portfolio intelligence below.");
    } catch (error) {
      setStatus(
        `Failed to parse or import file: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFirestoreImport = async () => {
    setLoading(true);
    setStatus("Pulling markers from Firestore and running migration...");
    try {
      const response = await fetch("/api/v1/import/firestore-markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: firestoreLimit,
          updatedAfter: updatedAfter.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as
        | (ImportResult & {
            fetch?: {
              totalFetched: number;
              normalizedMarkers: number;
              invalidRows: number;
            };
          })
        | { error: string };

      if (!response.ok) {
        setStatus(
          "Firestore import failed: " +
            ("error" in payload ? payload.error : "unknown error"),
        );
        setResult(null);
        return;
      }

      const parsed = payload as ImportResult & {
        fetch?: {
          totalFetched: number;
          normalizedMarkers: number;
          invalidRows: number;
        };
      };
      setResult(parsed);
      setMarkerCount(parsed.ingestion.markersReceived);
      const extra =
        parsed.fetch && parsed.fetch.totalFetched !== undefined
          ? ` Fetched ${parsed.fetch.totalFetched} rows from Firestore.`
          : "";
      setStatus(`Firestore import complete.${extra}`);
    } catch (error) {
      setStatus(
        `Firestore import failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLivePublicImport = async () => {
    setLoading(true);
    setStatus("Pulling markers from live AUS Surveillance public data...");
    try {
      const response = await fetch("/api/v1/import/live-aus-surveillance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: firestoreLimit,
        }),
      });

      const payload = (await response.json()) as
        | (ImportResult & {
            fetch?: {
              totalFetched: number;
              normalizedMarkers: number;
              invalidRows: number;
            };
          })
        | { error: string };

      if (!response.ok) {
        setStatus(
          "Live import failed: " +
            ("error" in payload ? payload.error : "unknown error"),
        );
        setResult(null);
        return;
      }

      const parsed = payload as ImportResult & {
        fetch?: {
          totalFetched: number;
          normalizedMarkers: number;
          invalidRows: number;
        };
      };
      setResult(parsed);
      setMarkerCount(parsed.ingestion.markersReceived);
      const extra =
        parsed.fetch && parsed.fetch.totalFetched !== undefined
          ? ` Pulled ${parsed.fetch.totalFetched} live rows.`
          : "";
      setStatus(`Live import complete.${extra}`);
    } catch (error) {
      setStatus(
        `Live import failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/65 p-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-white">Legacy data ingestion console</h2>
        <p className="text-sm text-slate-300">
          Upload a JSON export from legacy Firestore markers to generate enterprise
          risk intelligence previews.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <input
          type="file"
          accept=".json,application/json"
          disabled={loading}
          onChange={(event) =>
            void handleFileUpload(event.target.files?.[0] ?? null)
          }
          className="w-full cursor-pointer rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-slate-950"
        />
        <p className="mt-3 text-xs text-slate-400">{status}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-sm font-semibold text-white">Import directly from Firestore</p>
        <p className="mt-1 text-xs text-slate-400">
          Requires active operator session or API key-scoped access.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <input
            type="number"
            min={1}
            max={50000}
            value={firestoreLimit}
            onChange={(event) => setFirestoreLimit(Number(event.target.value || 10000))}
            className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            placeholder="Limit"
          />
          <input
            type="text"
            value={updatedAfter}
            onChange={(event) => setUpdatedAfter(event.target.value)}
            className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            placeholder="updatedAfter (ISO, optional)"
          />
          <button
            type="button"
            onClick={() => void handleFirestoreImport()}
            disabled={loading}
            className="rounded-lg bg-indigo-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-indigo-200 disabled:opacity-60"
          >
            Import Firestore
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-sm font-semibold text-white">
          One-click live import (no JSON file needed)
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Pulls marker data from the live AUS Surveillance Firebase project with
          anonymous auth and runs enterprise scoring.
        </p>
        <button
          type="button"
          onClick={() => void handleLivePublicImport()}
          disabled={loading}
          className="mt-3 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60"
        >
          Import Live Data Now
        </button>
      </div>

      {markerCount > 0 ? (
        <p className="text-sm text-slate-300">
          Markers parsed from file:{" "}
          <span className="font-semibold text-white">{markerCount}</span>
        </p>
      ) : null}

      {result ? (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-white/10 bg-slate-950/65 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                Portfolio risk
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result.summary.portfolioRiskScore}/100
              </p>
            </article>
            <article className="rounded-xl border border-white/10 bg-slate-950/65 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                Confidence score
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {result.summary.portfolioConfidenceScore}/100
              </p>
            </article>
            <article className="rounded-xl border border-white/10 bg-slate-950/65 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                Exposure / month
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatCurrencyAud(result.summary.estimatedMonthlyExposureAud)}
              </p>
            </article>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/65 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
              Ingestion stats
            </h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
              <li>Received: {result.ingestion.markersReceived}</li>
              <li>Accepted: {result.ingestion.markersAccepted}</li>
              <li>Invalid: {result.ingestion.invalidMarkers}</li>
              <li>Generated sites: {result.ingestion.generatedSites}</li>
            </ul>
          </div>

          {result.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-300/35 bg-amber-300/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Highest-risk generated sites</h3>
            <div className="space-y-2">
              {highestRiskSites.map((site) => (
                <div
                  key={site.site.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-white">{site.site.name}</p>
                    <p className="text-xs text-slate-400">{site.site.region}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-rose-200">Risk {site.riskScore}</p>
                    <p className="text-xs text-slate-400">
                      {formatCurrencyAud(site.estimatedMonthlyExposureAud)} exposure
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
