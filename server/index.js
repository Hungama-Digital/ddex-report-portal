import "dotenv/config";
import express from "express";
import {
  API_DEBUG,
  API_PORT,
  CORS_ORIGIN,
  SUPPORTED_AUDIO_PARTNERS,
} from "./config.js";
import { checkB2BConnection, checkMetaseaConnection, closePools } from "./db.js";
import { logDebug, logError, logInfo } from "./logger.js";
import {
  getAudioDetailsRows,
  getAudioRecentDeliveries,
  getAudioPartnerSummary,
  getAudioPartnerTotalContentLive,
} from "./services/totalContentLiveService.js";

const app = express();

app.use(express.json());

if (API_DEBUG) {
  app.use((req, _res, next) => {
    logDebug("Incoming request", {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    supportedAudioPartners: SUPPORTED_AUDIO_PARTNERS,
  });
});

app.get("/api/health/db", async (_req, res) => {
  const [metasea, b2b] = await Promise.allSettled([
    checkMetaseaConnection(),
    checkB2BConnection(),
  ]);

  const metaseaStatus = {
    ok: metasea.status === "fulfilled" ? metasea.value : false,
    error:
      metasea.status === "rejected"
        ? metasea.reason?.message || "Unknown Metasea error"
        : null,
  };

  const b2bStatus = {
    ok: b2b.status === "fulfilled" ? b2b.value : false,
    error:
      b2b.status === "rejected"
        ? b2b.reason?.message || "Unknown B2B error"
        : null,
  };

  const allHealthy = metaseaStatus.ok && b2bStatus.ok;
  const responsePayload = {
    ok: allHealthy,
    metasea: metaseaStatus,
    b2b: b2bStatus,
  };

  if (!allHealthy) {
    logError("Database health check failed", responsePayload);
    res.status(502).json(responsePayload);
    return;
  }

  logInfo("Database health check succeeded", responsePayload);
  res.json(responsePayload);
});

app.get("/api/audio/partners/:partner/total-content-live", async (req, res, next) => {
  try {
    const totals = await getAudioPartnerTotalContentLive({
      partner: req.params.partner,
      retailerIdOverride: req.query.retailerId,
      bypassCache:
        req.query.refresh === "1" ||
        req.query.noCache === "1" ||
        req.query.nocache === "1",
    });

    res.json(totals);
  } catch (error) {
    next(error);
  }
});

app.get("/api/audio/partners/:partner/summary", async (req, res, next) => {
  try {
    const summary = await getAudioPartnerSummary({
      partner: req.params.partner,
      retailerIdOverride: req.query.retailerId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      bypassCache:
        req.query.refresh === "1" ||
        req.query.noCache === "1" ||
        req.query.nocache === "1",
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get("/api/audio/partners/:partner/recent-deliveries", async (req, res, next) => {
  try {
    const recentDeliveries = await getAudioRecentDeliveries({
      partner: req.params.partner,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit,
      bypassCache:
        req.query.refresh === "1" ||
        req.query.noCache === "1" ||
        req.query.nocache === "1",
    });

    res.json(recentDeliveries);
  } catch (error) {
    next(error);
  }
});

app.get("/api/audio/partners/:partner/details", async (req, res, next) => {
  try {
    const details = await getAudioDetailsRows({
      partner: req.params.partner,
      type: req.query.type,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit,
      bypassCache:
        req.query.refresh === "1" ||
        req.query.noCache === "1" ||
        req.query.nocache === "1",
    });

    res.json(details);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, next) => {
  void next;
  const statusCode = error.statusCode || 500;
  const message =
    statusCode >= 500
      ? error.message || "Failed to fetch Total Content Live from databases."
      : error.message;

  if (statusCode >= 500) {
    logError("Request failed", {
      statusCode,
      message: error.message,
      code: error.code,
    });
    if (API_DEBUG) {
      console.error(error);
    }
  }

  res.status(statusCode).json({ error: message });
});

const server = app.listen(API_PORT, () => {
  logInfo(`API server running on http://127.0.0.1:${API_PORT}`, {
    debug: API_DEBUG,
  });
});

async function shutdown(signal) {
  logInfo(`Received ${signal}, closing resources...`);
  server.close(async () => {
    await closePools();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
