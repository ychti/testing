# Standalone Google Surveillance Agent

This collector is intentionally run outside the website UI.

## 1) Prepare an asset CSV

Use header:

```csv
id,name,address,lat,lng,region,segment,insuredValueAud
asset-syd-001,Sydney HQ,123 George St Sydney,-33.8688,151.2093,NSW,retail,5000000
asset-mel-002,Melbourne Campus,210 Collins St Melbourne,-37.8142,144.9632,VIC,education,7200000
```

## 2) Plan parallel agent batches

```bash
npm run surveillance:agent -- --assets ./assets.csv --batch-count 6 --plan-only
```

Each batch can be assigned to one worker agent.

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

## 4) Merge all batch outputs

```bash
npm run surveillance:merge -- --out ./surveillance-merged.json ./surveillance-batch-*.json
```

## 5) Import into the platform

Go to `/migration` and upload `surveillance-merged.json` in legacy marker upload.

