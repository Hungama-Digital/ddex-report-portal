import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_PATH = path.join(DATA_DIR, 'portal.sqlite');

let dbPromise;

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, encoded) {
  if (!encoded || !String(encoded).includes(':')) {
    return false;
  }
  const [salt, expected] = String(encoded).split(':');
  const computed = crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(computed, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function seedAdmin(db) {
  const adminUser = await db.get(
    `SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
    ['Admin'],
  );

  if (!adminUser) {
    await db.run(
      `INSERT INTO users (username, email, password_hash, role, status, created_at, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Admin',
        'admin@hungama.local',
        hashPassword('Admin'),
        'admin',
        'approved',
        nowIso(),
        nowIso(),
      ],
    );
  }
}

async function setupSchema(db) {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      approved_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_user_id INTEGER,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      json_path TEXT,
      partner TEXT NOT NULL,
      partner_label TEXT NOT NULL,
      source TEXT NOT NULL,
      report_type TEXT NOT NULL,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      track_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS report_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      partner TEXT NOT NULL,
      source TEXT,
      status TEXT NOT NULL,
      payload_json TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      result_report_id INTEGER,
      error_message TEXT,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (result_report_id) REFERENCES reports(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(recipient_user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
  `);

  await seedAdmin(db);
}

export async function getStoreDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
      });
      await setupSchema(db);
      return db;
    })();
  }

  return dbPromise;
}

export async function createSession(userId) {
  const db = await getStoreDb();
  const token = generateToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.run(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
    [token, userId, createdAt.toISOString(), expiresAt.toISOString()],
  );

  return token;
}

export async function deleteSession(token) {
  const db = await getStoreDb();
  await db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
}

export async function findUserByToken(token) {
  if (!token) {
    return null;
  }

  const db = await getStoreDb();
  const row = await db.get(
    `SELECT u.id, u.username, u.email, u.role, u.status, u.password_hash
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
       AND s.expires_at > ?
     LIMIT 1`,
    [token, nowIso()],
  );

  return row || null;
}

export async function createAccessRequest({ username, email }) {
  const db = await getStoreDb();
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const now = nowIso();

  if (!normalizedUsername || !normalizedEmail) {
    const error = new Error('username and email are required.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await db.get(
    `SELECT id, status FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
    [normalizedUsername],
  );

  if (existing) {
    if (existing.status === 'pending') {
      return { id: existing.id, alreadyPending: true };
    }

    const error = new Error('Username already exists. Please login or contact admin.');
    error.statusCode = 409;
    throw error;
  }

  const result = await db.run(
    `INSERT INTO users (username, email, role, status, created_at)
     VALUES (?, ?, 'user', 'pending', ?)`,
    [normalizedUsername, normalizedEmail, now],
  );

  const insertedId = result.lastID;

  const admins = await db.all(`SELECT id FROM users WHERE role = 'admin' AND status = 'approved'`);
  for (const admin of admins) {
    await db.run(
      `INSERT INTO notifications (recipient_user_id, type, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        admin.id,
        'approval_request',
        `New user approval request: ${normalizedUsername}`,
        JSON.stringify({ userId: insertedId, username: normalizedUsername, email: normalizedEmail }),
        now,
      ],
    );
  }

  return { id: insertedId, alreadyPending: false };
}

export async function setupUserPassword({ username, email, password }) {
  const db = await getStoreDb();
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedUsername || !normalizedEmail || !password) {
    const error = new Error('username, email and password are required.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(
    `SELECT id, status, password_hash FROM users
     WHERE LOWER(username) = LOWER(?) AND LOWER(email) = LOWER(?)
     LIMIT 1`,
    [normalizedUsername, normalizedEmail],
  );

  if (!user || user.status !== 'approved') {
    const error = new Error('User is not approved yet.');
    error.statusCode = 403;
    throw error;
  }

  if (String(password).length < 6) {
    const error = new Error('Password must be at least 6 characters.');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = hashPassword(password);
  await db.run(
    `UPDATE users
     SET password_hash = ?, updated_at = ?
     WHERE id = ?`,
    [passwordHash, nowIso(), user.id],
  );

  return { ok: true };
}

export async function loginUser({ username, password }) {
  const db = await getStoreDb();
  const normalizedUsername = String(username || '').trim();

  if (!normalizedUsername || !password) {
    const error = new Error('username and password are required.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(
    `SELECT id, username, email, role, status, password_hash
     FROM users
     WHERE LOWER(username) = LOWER(?)
     LIMIT 1`,
    [normalizedUsername],
  );

  if (!user) {
    const error = new Error('Invalid username or password.');
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== 'approved') {
    const error = new Error('User is not approved yet.');
    error.statusCode = 403;
    throw error;
  }

  if (!user.password_hash) {
    const error = new Error('Please setup your password first.');
    error.statusCode = 403;
    error.code = 'PASSWORD_SETUP_REQUIRED';
    throw error;
  }

  if (!verifyPassword(password, user.password_hash)) {
    const error = new Error('Invalid username or password.');
    error.statusCode = 401;
    throw error;
  }

  const token = await createSession(user.id);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
}

export async function listPendingApprovals() {
  const db = await getStoreDb();
  return db.all(
    `SELECT id, username, email, created_at
     FROM users
     WHERE status = 'pending'
     ORDER BY created_at DESC`,
  );
}

export async function approveUser(userId, adminUserId) {
  const db = await getStoreDb();
  const id = Number.parseInt(String(userId), 10);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(`SELECT id, username, email, status FROM users WHERE id = ?`, [id]);
  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  await db.run(
    `UPDATE users
     SET status = 'approved', approved_at = ?, updated_at = ?
     WHERE id = ?`,
    [nowIso(), nowIso(), id],
  );

  await db.run(
    `INSERT INTO notifications (recipient_user_id, type, message, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      'approval_granted',
      'Your access request has been approved. Please setup your password and login.',
      JSON.stringify({ approvedBy: adminUserId }),
      nowIso(),
    ],
  );

  return { ok: true, user };
}

export async function rejectUser(userId, adminUserId) {
  const db = await getStoreDb();
  const id = Number.parseInt(String(userId), 10);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(`SELECT id, username, email FROM users WHERE id = ?`, [id]);
  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  await db.run(
    `UPDATE users
     SET status = 'rejected', updated_at = ?
     WHERE id = ?`,
    [nowIso(), id],
  );

  await db.run(
    `INSERT INTO notifications (recipient_user_id, type, message, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      'approval_rejected',
      'Your access request has been rejected. Please contact Admin.',
      JSON.stringify({ rejectedBy: adminUserId }),
      nowIso(),
    ],
  );

  return { ok: true, user };
}

export async function createNotification({ recipientUserId = null, type, message, payload = null }) {
  const db = await getStoreDb();
  await db.run(
    `INSERT INTO notifications (recipient_user_id, type, message, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [recipientUserId, type, message, payload ? JSON.stringify(payload) : null, nowIso()],
  );
}

export async function listNotificationsForUser(userId, { includeRead = false, limit = 20 } = {}) {
  const db = await getStoreDb();
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const whereRead = includeRead ? '' : 'AND n.read_at IS NULL';
  return db.all(
    `SELECT n.id, n.type, n.message, n.payload_json, n.created_at, n.read_at
     FROM notifications n
     WHERE (n.recipient_user_id = ? OR n.recipient_user_id IS NULL)
       ${whereRead}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, normalizedLimit],
  );
}

export async function markNotificationRead(notificationId, userId) {
  const db = await getStoreDb();
  await db.run(
    `UPDATE notifications
     SET read_at = ?
     WHERE id = ? AND (recipient_user_id = ? OR recipient_user_id IS NULL)`,
    [nowIso(), notificationId, userId],
  );
}

export async function getUnreadNotificationCount(userId) {
  const db = await getStoreDb();
  const row = await db.get(
    `SELECT COUNT(*) AS count
     FROM notifications
     WHERE (recipient_user_id = ? OR recipient_user_id IS NULL)
       AND read_at IS NULL`,
    [userId],
  );
  return Number(row?.count || 0);
}

export async function createReportJob({ jobType, partner, source = null, createdByUserId, payload }) {
  const db = await getStoreDb();
  const result = await db.run(
    `INSERT INTO report_jobs (job_type, partner, source, status, payload_json, created_by_user_id, created_at)
     VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    [jobType, partner, source, JSON.stringify(payload || {}), createdByUserId || null, nowIso()],
  );
  return result.lastID;
}

export async function markReportJobRunning(jobId) {
  const db = await getStoreDb();
  await db.run(
    `UPDATE report_jobs SET status = 'running', started_at = ? WHERE id = ?`,
    [nowIso(), jobId],
  );
}

export async function markReportJobFailed(jobId, errorMessage) {
  const db = await getStoreDb();
  await db.run(
    `UPDATE report_jobs
     SET status = 'failed', finished_at = ?, error_message = ?
     WHERE id = ?`,
    [nowIso(), String(errorMessage || 'Unknown error'), jobId],
  );
}

export async function markReportJobCompleted(jobId, reportId) {
  const db = await getStoreDb();
  await db.run(
    `UPDATE report_jobs
     SET status = 'completed', finished_at = ?, result_report_id = ?
     WHERE id = ?`,
    [nowIso(), reportId, jobId],
  );
}

export async function createReportRecord({
  fileName,
  filePath,
  jsonPath,
  partner,
  partnerLabel,
  source,
  reportType,
  createdByUserId,
  trackCount,
}) {
  const db = await getStoreDb();
  const result = await db.run(
    `INSERT INTO reports (
      file_name,
      file_path,
      json_path,
      partner,
      partner_label,
      source,
      report_type,
      created_by_user_id,
      created_at,
      track_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fileName,
      filePath,
      jsonPath || null,
      partner,
      partnerLabel,
      source,
      reportType,
      createdByUserId || null,
      nowIso(),
      Number(trackCount) || 0,
    ],
  );
  return result.lastID;
}

export async function getReportById(reportId) {
  const db = await getStoreDb();
  return db.get(`SELECT * FROM reports WHERE id = ?`, [reportId]);
}

export async function listRecentReports({ days = 7 } = {}) {
  const db = await getStoreDb();
  const since = new Date(Date.now() - Math.max(Number(days) || 7, 1) * 24 * 60 * 60 * 1000).toISOString();
  return db.all(
    `SELECT id, file_name, partner, partner_label, source, report_type, created_at, track_count
     FROM reports
     WHERE created_at >= ?
     ORDER BY created_at DESC`,
    [since],
  );
}

export async function listRecentJobs({ limit = 50 } = {}) {
  const db = await getStoreDb();
  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.all(
    `SELECT id, job_type, partner, source, status, created_at, started_at, finished_at, result_report_id, error_message
     FROM report_jobs
     ORDER BY created_at DESC
     LIMIT ?`,
    [normalizedLimit],
  );
}
