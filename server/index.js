import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import {
  API_DEBUG,
  API_PORT,
  CORS_ORIGIN,
  SUPPORTED_AUDIO_PARTNERS,
} from './config.js';
import { checkB2BConnection, checkMetaseaConnection, closePools } from './db.js';
import { logDebug, logError, logInfo } from './logger.js';
import {
  getAudioDetailsRows,
  getAudioRecentDeliveries,
  getAudioPartnerSummary,
  getAudioPartnerTotalContentLive,
} from './services/totalContentLiveService.js';
import {
  approveUser,
  createAccessRequest,
  deleteSession,
  getStoreDb,
  getUnreadNotificationCount,
  listNotificationsForUser,
  listPendingApprovals,
  loginUser,
  markNotificationRead,
  rejectUser,
  setupUserPassword,
} from './services/localStore.js';
import {
  getJobsList,
  getReportsList,
  queueDifferenceJob,
  queueExportJob,
} from './services/reportService.js';
import { authOptional, requireAdmin, requireAuth } from './auth.js';
import { getReportById } from './services/localStore.js';

const app = express();

app.use(express.json({ limit: '2mb' }));

if (API_DEBUG) {
  app.use((req, _res, next) => {
    logDebug('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    supportedAudioPartners: SUPPORTED_AUDIO_PARTNERS,
  });
});

app.get('/api/health/db', async (_req, res) => {
  const [metasea, b2b] = await Promise.allSettled([
    checkMetaseaConnection(),
    checkB2BConnection(),
  ]);

  const metaseaStatus = {
    ok: metasea.status === 'fulfilled' ? metasea.value : false,
    error:
      metasea.status === 'rejected'
        ? metasea.reason?.message || 'Unknown Metasea error'
        : null,
  };

  const b2bStatus = {
    ok: b2b.status === 'fulfilled' ? b2b.value : false,
    error:
      b2b.status === 'rejected'
        ? b2b.reason?.message || 'Unknown B2B error'
        : null,
  };

  const allHealthy = metaseaStatus.ok && b2bStatus.ok;
  const responsePayload = {
    ok: allHealthy,
    metasea: metaseaStatus,
    b2b: b2bStatus,
  };

  if (!allHealthy) {
    logError('Database health check failed', responsePayload);
    res.status(502).json(responsePayload);
    return;
  }

  logInfo('Database health check succeeded', responsePayload);
  res.json(responsePayload);
});

app.post('/api/auth/request-access', async (req, res, next) => {
  try {
    const output = await createAccessRequest({
      username: req.body?.username,
      email: req.body?.email,
    });
    res.json({
      ok: true,
      alreadyPending: Boolean(output.alreadyPending),
      message: output.alreadyPending
        ? 'Approval request is already pending.'
        : 'Approval request submitted. Please wait for admin approval.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/setup-password', async (req, res, next) => {
  try {
    await setupUserPassword({
      username: req.body?.username,
      email: req.body?.email,
      password: req.body?.password,
    });
    res.json({ ok: true, message: 'Password setup completed. Please login.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const output = await loginUser({
      username: req.body?.username,
      password: req.body?.password,
    });
    res.json(output);
  } catch (error) {
    next(error);
  }
});

app.use(authOptional);

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const unreadCount = await getUnreadNotificationCount(req.authUser.id, { days: 7 });
  res.json({
    ok: true,
    user: {
      id: req.authUser.id,
      username: req.authUser.username,
      email: req.authUser.email,
      role: req.authUser.role,
    },
    unreadNotifications: unreadCount,
  });
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    await deleteSession(req.authUser.token);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/notifications', requireAuth, async (req, res, next) => {
  try {
    const includeRead = req.query.includeRead === '1';
    const limit = req.query.limit;
    const days = req.query.days;
    const notifications = await listNotificationsForUser(req.authUser.id, {
      includeRead,
      limit,
      days,
    });
    const unreadCount = await getUnreadNotificationCount(req.authUser.id, { days });

    res.json({
      ok: true,
      unreadCount,
      notifications: notifications.map((item) => ({
        id: item.id,
        type: item.type,
        message: item.message,
        payload: item.payload_json ? JSON.parse(item.payload_json) : null,
        createdAt: item.created_at,
        readAt: item.read_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    await markNotificationRead(req.params.id, req.authUser.id);
    const unreadCount = await getUnreadNotificationCount(req.authUser.id);
    res.json({ ok: true, unreadCount });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/approvals', requireAdmin, async (_req, res, next) => {
  try {
    const rows = await listPendingApprovals();
    res.json({
      ok: true,
      rows: rows.map((row) => ({
        id: row.id,
        username: row.username,
        email: row.email,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/approvals/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const output = await approveUser(req.params.id, req.authUser.id);
    res.json({ ok: true, user: output.user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/approvals/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const output = await rejectUser(req.params.id, req.authUser.id);
    res.json({ ok: true, user: output.user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports', requireAuth, async (req, res, next) => {
  try {
    const rows = await getReportsList({ days: req.query.days || 7 });
    res.json({ ok: true, rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/jobs', requireAuth, async (req, res, next) => {
  try {
    const rows = await getJobsList({ limit: req.query.limit || 50 });
    res.json({ ok: true, rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reports/jobs/export', requireAuth, async (req, res, next) => {
  try {
    const output = await queueExportJob({
      partner: req.body?.partner,
      source: req.body?.source,
      createdByUserId: req.authUser.id,
    });
    res.json({ ok: true, ...output });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reports/jobs/difference', requireAuth, async (req, res, next) => {
  try {
    const output = await queueDifferenceJob({
      reportIds: req.body?.reportIds,
      createdByUserId: req.authUser.id,
    });
    res.json({ ok: true, ...output });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/:id/download', requireAuth, async (req, res, next) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      const error = new Error('Report not found.');
      error.statusCode = 404;
      throw error;
    }

    res.download(path.resolve(report.file_path), report.file_name);
  } catch (error) {
    next(error);
  }
});

app.get('/api/audio/partners/:partner/total-content-live', requireAuth, async (req, res, next) => {
  try {
    const totals = await getAudioPartnerTotalContentLive({
      partner: req.params.partner,
      retailerIdOverride: req.query.retailerId,
      bypassCache:
        req.query.refresh === '1' ||
        req.query.noCache === '1' ||
        req.query.nocache === '1',
    });

    res.json(totals);
  } catch (error) {
    next(error);
  }
});

app.get('/api/audio/partners/:partner/summary', requireAuth, async (req, res, next) => {
  try {
    const summary = await getAudioPartnerSummary({
      partner: req.params.partner,
      retailerIdOverride: req.query.retailerId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      bypassCache:
        req.query.refresh === '1' ||
        req.query.noCache === '1' ||
        req.query.nocache === '1',
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get('/api/audio/partners/:partner/recent-deliveries', requireAuth, async (req, res, next) => {
  try {
    const recentDeliveries = await getAudioRecentDeliveries({
      partner: req.params.partner,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit,
      bypassCache:
        req.query.refresh === '1' ||
        req.query.noCache === '1' ||
        req.query.nocache === '1',
    });

    res.json(recentDeliveries);
  } catch (error) {
    next(error);
  }
});

app.get('/api/audio/partners/:partner/details', requireAuth, async (req, res, next) => {
  try {
    const details = await getAudioDetailsRows({
      partner: req.params.partner,
      type: req.query.type,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit,
      bypassCache:
        req.query.refresh === '1' ||
        req.query.noCache === '1' ||
        req.query.nocache === '1',
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
      ? error.message || 'Failed to process request.'
      : error.message;

  if (statusCode >= 500) {
    logError('Request failed', {
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

const server = app.listen(API_PORT, async () => {
  await getStoreDb();
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
