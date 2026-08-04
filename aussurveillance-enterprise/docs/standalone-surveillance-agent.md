# Standalone Google Surveillance Agent

This collector is intentionally run outside the website UI.

## 1) Prepare an asset CSV

Use header:

```csv
id,name,address,lat,lng,region,segment,insuredValueAud
asset-syd-001,Sydney HQ,123 George St Sydney,-33.8688,151.2093,NSW,retail,5000000
asset-mel-002,Melbourne Campus,210 Collins St Melbourne,-37.8142,144.9632,VIC,education,7200000
```

Quick creation command:

```bash
cat > ./assets.csv <<'CSV'
id,name,address,lat,lng,region,segment,insuredValueAud
asset-syd-001,Sydney HQ,123 George St Sydney,-33.8688,151.2093,NSW,retail,5000000
asset-mel-002,Melbourne Campus,210 Collins St Melbourne,-37.8142,144.9632,VIC,education,7200000
asset-bri-003,Brisbane Hub,12 Queen St Brisbane,-27.4705,153.0260,QLD,logistics,6400000
asset-adl-004,Adelaide Node,90 King William St Adelaide,-34.9285,138.6007,SA,education,3900000
asset-per-005,Perth West,45 St Georges Terrace Perth,-31.9523,115.8613,WA,logistics,7100000
asset-act-006,Canberra Core,220 Northbourne Ave Canberra,-35.2809,149.1300,ACT,retail,5200000
CSV
```

## 2) Plan parallel agent batches

```bash
npm run surveillance:agent -- --assets ./assets.csv --batch-count 6 --plan-only
```

Each batch can be assigned to one worker agent.

## 2.5) Run API doctor first (recommended)

This gives a clear pass/fail report for key validity, Street View access, Vision access, and sample asset coverage.

```bash
# You can use one shared key for both APIs:
export GOOGLE_API_KEY="YOUR_REAL_KEY"

npm run surveillance:doctor -- \
  --assets ./assets.csv \
  --sample-assets 6 \
  --radius-meters 300
```

If doctor returns `REQUEST_DENIED`, the key/project setup is wrong.
If doctor returns `ZERO_RESULTS`, your key is likely valid but that location has no Street View imagery.

## 3) Run one worker batch

```bash
GOOGLE_MAPS_API_KEY=... GOOGLE_VISION_API_KEY=... \
npm run surveillance:agent -- \
  --assets ./assets.csv \
  --batch-count 6 \
  --batch-index 2 \
  --headings 0,90,180,270 \
  --radius-meters 120 \
  --threshold 0.72 \
  --out ./surveillance-batch-2.json
```

If Vision is too strict and you want candidates for the human swipe queue, emit uncertain markers:

```bash
GOOGLE_API_KEY=... npm run surveillance:agent -- \
  --assets ./assets.csv \
  --batch-count 6 \
  --batch-index 2 \
  --radius-meters 350 \
  --threshold 0.55 \
  --emit-uncertain \
  --uncertain-score 0.42 \
  --out ./surveillance-batch-2.json
```

For higher precision "hard surveillance mapping" (fixed-mounted CCTV bias):

```bash
GOOGLE_API_KEY=... npm run surveillance:agent -- \
  --assets ./assets.csv \
  --batch-count 6 \
  --batch-index 2 \
  --radius-meters 350 \
  --threshold 0.62 \
  --hard-surveillance \
  --hard-threshold 0.67 \
  --emit-uncertain \
  --uncertain-score 0.36 \
  --out ./surveillance-batch-2.json
```

If you use one shared key, this is also valid:

```bash
GOOGLE_API_KEY=... npm run surveillance:agent -- --assets ./assets.csv --batch-count 6 --batch-index 2 --out ./surveillance-batch-2.json
```

Before running, verify your keys are real values (not placeholders) and that these Google APIs are enabled on the same project:
- Street View Static API
- Vision API
- Billing enabled

## 4) Merge all batch outputs

```bash
npm run surveillance:merge -- --out ./surveillance-merged.json ./surveillance-batch-*.json
```

## 5) Import into the platform

Go to `/migration` and upload `surveillance-merged.json` in legacy marker upload.

