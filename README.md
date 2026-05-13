# DDEX Report Portal

This project contains:
- `Vite + React` frontend dashboard
- `Express` backend API for live DB counts

Current live integration:
- `Total Content Live`, `Delivered in Period`, `Taken Down in Period` for mapped audio partners
- Data sources:
  - `Metasea DB` (Postgres)
  - `Partner DB` (MySQL 5.7.42-log)

## 1) Configure Environment

Copy `.env.example` to `.env` (already done) and fill values:

- Metasea DB:
  - `METASEA_DB_HOST`
  - `METASEA_DB_PORT`
  - `METASEA_DB_NAME`
  - `METASEA_DB_USER`
  - `METASEA_DB_PASSWORD`
- B2B DB:
  - `B2B_DB_HOST`
  - `B2B_DB_PORT`
  - `B2B_DB_NAME`
  - `B2B_DB_USER`
  - `B2B_DB_PASSWORD`
- Partner mapping:
  - `METASEA_AUDIO_PARTNER_RETAILER_IDS`
  - `B2B_AUDIO_PARTNER_TABLES`
- Optional API tuning:
  - `API_DEBUG=true`
  - `TOTAL_CONTENT_LIVE_CACHE_TTL_MS=300000`

Example amazon mapping:
- `METASEA_AUDIO_PARTNER_RETAILER_IDS={"amazon":3044}`
- `B2B_AUDIO_PARTNER_TABLES={"amazon":{"contents":"AMAZON_DDEX_BATCH_WISE_CONTENTS","push":"AMAZON_DDEX_BATCH_PUSH"}}`

Current default mappings:
- amazon
- bytedance
- facebook
- jiosaavn
- spotify
- virgin

## 2) Install Dependencies

```bash
npm install
```

## 3) Run the Project

Run API (Terminal 1):

```bash
npm run dev:api
```

Run frontend (Terminal 2):

```bash
npm run dev
```

Open:
- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## 4) API Endpoint

Live count endpoint used by UI:

```http
GET /api/audio/partners/:partner/total-content-live
```

Example:

```http
GET /api/audio/partners/amazon/total-content-live
```

Optional retailer override:

```http
GET /api/audio/partners/amazon/total-content-live?retailerId=3044
```

Force refresh (skip cache):

```http
GET /api/audio/partners/amazon/total-content-live?refresh=1
```

DB health endpoint:

```http
GET /api/health/db
```

Summary endpoint used by cards:

```http
GET /api/audio/partners/:partner/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

Example:

```http
GET /api/audio/partners/amazon/summary?startDate=2026-04-01&endDate=2026-05-10
```

Date behavior:
- `startDate` is converted to `YYYY-MM-DD 00:00:00`
- `endDate` is converted to next day `00:00:00` and used as exclusive upper bound (`<`)

## Notes

- Frontend proxies `/api` to `http://127.0.0.1:3001`.
- `Total Content Live` card shows:
  - `Metasea`
  - `B2B`
  - combined total
- For partners not configured in `.env`, API returns an error until mapping is added.
