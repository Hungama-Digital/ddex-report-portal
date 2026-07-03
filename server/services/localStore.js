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

    CREATE TABLE IF NOT EXISTS user_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(recipient_user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
  `);

  try {
    await db.exec(`ALTER TABLE users ADD COLUMN last_login TEXT;`);
  } catch (err) {
    // Column already exists
  }

  await seedAdmin(db);
  await seedRolesAndPermissions(db);
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
  await logUserActivity(insertedId, 'Account request submitted');

  const admins = await db.all(`SELECT id FROM users WHERE role IN ('admin', 'super-admin') AND status = 'approved'`);
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

export async function setupUserPassword({ email, password }) {
  const db = await getStoreDb();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    const error = new Error('email and password are required.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(
    `SELECT id, status, password_hash FROM users
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [normalizedEmail],
  );

  if (!user || user.status !== 'approved') {
    const error = new Error('User is not approved yet or not found.');
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
  await logUserActivity(user.id, 'Set up password credentials');

  return { ok: true };
}

export async function loginUser({ email, password }) {
  const db = await getStoreDb();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    const error = new Error('email and password are required.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(
    `SELECT id, username, email, role, status, password_hash
     FROM users
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [normalizedEmail],
  );

  if (!user) {
    const error = new Error('Invalid email or password.');
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
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const token = await createSession(user.id);
  const now = nowIso();
  await db.run(
    `UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?`,
    [now, now, user.id],
  );
  await logUserActivity(user.id, 'Logged into Delivery Portal');

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

export async function approveUser(userId, adminUserId, role) {
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

  const assignedRole = role || 'user';

  await db.run(
    `UPDATE users
     SET status = 'approved', role = ?, approved_at = ?, updated_at = ?
     WHERE id = ?`,
    [assignedRole, nowIso(), nowIso(), id],
  );
  await logUserActivity(id, `Account approved and assigned role: ${assignedRole}`);

  const admins = await db.all(`SELECT id FROM users WHERE role = 'admin' AND status = 'approved'`);
  for (const admin of admins) {
    await db.run(
      `INSERT INTO notifications (recipient_user_id, type, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        admin.id,
        'approval_granted',
        `User approved: ${user.username} (${user.email}) as ${assignedRole}`,
        JSON.stringify({ userId: user.id, approvedBy: adminUserId, role: assignedRole }),
        nowIso(),
      ],
    );
  }

  return { ok: true, user: { ...user, role: assignedRole } };
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
  await logUserActivity(id, 'Account request rejected by Administrator');

  const admins = await db.all(`SELECT id FROM users WHERE role IN ('admin', 'super-admin') AND status = 'approved'`);
  for (const admin of admins) {
    await db.run(
      `INSERT INTO notifications (recipient_user_id, type, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        admin.id,
        'approval_rejected',
        `User rejected: ${user.username} (${user.email})`,
        JSON.stringify({ userId: user.id, rejectedBy: adminUserId }),
        nowIso(),
      ],
    );
  }

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

export async function listNotificationsForUser(
  userId,
  { includeRead = false, limit = 20, days = 7 } = {},
) {
  const db = await getStoreDb();
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const sinceIso = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000).toISOString();
  const whereRead = includeRead ? '' : 'AND n.read_at IS NULL';
  return db.all(
    `SELECT n.id, n.type, n.message, n.payload_json, n.created_at, n.read_at
     FROM notifications n
     WHERE (n.recipient_user_id = ? OR n.recipient_user_id IS NULL)
       AND n.created_at >= ?
       ${whereRead}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, sinceIso, normalizedLimit],
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

export async function getUnreadNotificationCount(userId, { days = 7 } = {}) {
  const db = await getStoreDb();
  const normalizedDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const sinceIso = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000).toISOString();
  const row = await db.get(
    `SELECT COUNT(*) AS count
     FROM notifications
     WHERE (recipient_user_id = ? OR recipient_user_id IS NULL)
       AND created_at >= ?
       AND read_at IS NULL`,
    [userId, sinceIso],
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

export async function removeReportById(reportId) {
  const db = await getStoreDb();
  await db.run(`DELETE FROM reports WHERE id = ?`, [reportId]);
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

export async function listActiveUsers() {
  const db = await getStoreDb();
  return db.all(
    `SELECT id, username, email, password_hash, role, status, created_at, approved_at, updated_at
     FROM users
     WHERE status = 'approved'
     ORDER BY created_at DESC`,
  );
}

export async function revokeUserAccess(userId) {
  const db = await getStoreDb();
  const normalizedId = Number.parseInt(String(userId), 10);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }

  const user = await db.get(
    `SELECT id, username, role, status
     FROM users
     WHERE id = ?`,
    [normalizedId],
  );

  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  if (user.role === 'admin' || user.role === 'super-admin') {
    const error = new Error('Admin access cannot be revoked from this screen.');
    error.statusCode = 400;
    throw error;
  }

  await db.run(
    `UPDATE users
     SET status = 'revoked', updated_at = ?
     WHERE id = ?`,
    [nowIso(), normalizedId],
  );
  await db.run(`DELETE FROM sessions WHERE user_id = ?`, [normalizedId]);
  await logUserActivity(normalizedId, 'Account status set to deactivated (revoked) by Administrator');

  return { ok: true, user };
}

export async function createUserInDb({ username, email, role, status }) {
  const db = await getStoreDb();
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const now = nowIso();
  const dbStatus = status === 'inactive' ? 'revoked' : 'approved';
  
  const result = await db.run(
    `INSERT INTO users (username, email, role, status, created_at, approved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [normalizedUsername, normalizedEmail, role || 'user', dbStatus, now, now],
  );
  await logUserActivity(result.lastID, 'Account created by Administrator');
  return { id: result.lastID, username: normalizedUsername, email: normalizedEmail, role, status };
}

export async function updateUserInDb(id, { username, email, role, status }) {
  const db = await getStoreDb();
  const normalizedUsername = String(username || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const dbStatus = status === 'inactive' ? 'revoked' : 'approved';

  await db.run(
    `UPDATE users
     SET username = ?, email = ?, role = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [normalizedUsername, normalizedEmail, role, dbStatus, nowIso(), id],
  );
  await logUserActivity(id, 'Account details updated by Administrator');
  return { id, username: normalizedUsername, email: normalizedEmail, role, status };
}

export async function deleteUserInDb(id) {
  const db = await getStoreDb();
  await db.run(`DELETE FROM users WHERE id = ?`, [id]);
  await db.run(`DELETE FROM sessions WHERE user_id = ?`, [id]);
  return { id };
}

export async function resetUserPasswordInDb(id, newPassword) {
  const db = await getStoreDb();
  const passwordHash = hashPassword(newPassword);
  await db.run(
    `UPDATE users
     SET password_hash = ?, updated_at = ?
     WHERE id = ?`,
    [passwordHash, nowIso(), id],
  );
  await logUserActivity(id, 'Password reset by Administrator');
  return { id };
}

export async function listAllUsers() {
  const db = await getStoreDb();
  return db.all(
    `SELECT id, username, email, password_hash, role, status, created_at, approved_at, updated_at, last_login
     FROM users
     ORDER BY created_at DESC`,
  );
}

export async function logUserActivity(userId, action, details = null) {
  const db = await getStoreDb();
  await db.run(
    `INSERT INTO user_activities (user_id, action, details, created_at)
     VALUES (?, ?, ?, ?)`,
    [userId, action, details, nowIso()],
  );
}

export async function getUserActivities(userId) {
  const db = await getStoreDb();
  return db.all(
    `SELECT id, action, details, created_at
     FROM user_activities
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );
}

async function seedRolesAndPermissions(db) {
  const SYSTEM_PERMISSIONS = [
    { id: 'dashboard.view', module: 'Dashboard', name: 'View Dashboard', description: 'View main metrics and charts' },
    { id: 'audio-reports.view', module: 'Audio Reports', name: 'View Audio Reports', description: 'View and query audio metrics' },
    { id: 'video-reports.view', module: 'Video Reports', name: 'View Video Reports', description: 'View and query video metrics' },
    { id: 'reports.view', module: 'Reports', name: 'View Reports', description: 'Access report generation page' },
    { id: 'search.view', module: 'Search Contents', name: 'Search Contents', description: 'Access DDEX album and track search' },
    { id: 'users.view', module: 'Users', name: 'View Users', description: 'List and view user profiles' },
    { id: 'users.create', module: 'Users', name: 'Create Users', description: 'Add new user accounts' },
    { id: 'users.edit', module: 'Users', name: 'Edit Users', description: 'Modify existing user details' },
    { id: 'users.delete', module: 'Users', name: 'Delete Users', description: 'Delete user accounts' },
    { id: 'roles.view', module: 'Roles', name: 'View Roles', description: 'View system access roles' },
    { id: 'roles.create', module: 'Roles', name: 'Create Roles', description: 'Create new access roles' },
    { id: 'roles.edit', module: 'Roles', name: 'Edit Roles', description: 'Modify role permission matrix' },
    { id: 'roles.delete', module: 'Roles', name: 'Delete Roles', description: 'Remove custom roles' },
    { id: 'settings.view', module: 'Settings', name: 'View Settings', description: 'Access system preferences page' },
    { id: 'settings.edit', module: 'Settings', name: 'Edit Settings', description: 'Modify system theme and options' },
  ];

  const now = new Date().toISOString();

  for (const perm of SYSTEM_PERMISSIONS) {
    const existing = await db.get(`SELECT id FROM permissions WHERE id = ? LIMIT 1`, [perm.id]);
    if (!existing) {
      await db.run(
        `INSERT INTO permissions (id, module, name, description, created_at) VALUES (?, ?, ?, ?, ?)`,
        [perm.id, perm.module, perm.name, perm.description, now]
      );
    }
  }

  const DEFAULT_ROLES = [
    {
      id: 'super-admin',
      name: 'Super Admin',
      slug: 'super-admin',
      description: 'Full access to all modules and configurations.',
      status: 'active',
      permissions: SYSTEM_PERMISSIONS.map(p => p.id),
      isSystem: true
    },
    {
      id: 'content-ingestion',
      name: 'Content Ingestion Team',
      slug: 'content-ingestion',
      description: 'Responsible for monitoring metrics, viewing files, and reports.',
      status: 'active',
      permissions: ['dashboard.view', 'users.view', 'reports.view'],
      isSystem: true
    },
    {
      id: 'business-team',
      name: 'Business Team',
      slug: 'business-team',
      description: 'Access to reports page and dashboard stats.',
      status: 'active',
      permissions: ['dashboard.view', 'reports.view'],
      isSystem: true
    }
  ];

  for (const role of DEFAULT_ROLES) {
    const existing = await db.get(`SELECT id FROM roles WHERE id = ? LIMIT 1`, [role.id]);
    if (!existing) {
      await db.run(
        `INSERT INTO roles (id, name, slug, description, status, permissions_json, is_system, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          role.id,
          role.name,
          role.slug,
          role.description,
          role.status,
          JSON.stringify(role.permissions),
          role.isSystem ? 1 : 0,
          now
        ]
      );
    }
  }
}

export async function listRoles() {
  const db = await getStoreDb();
  const rows = await db.all(`SELECT * FROM roles ORDER BY created_at ASC`);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    status: r.status,
    permissions: JSON.parse(r.permissions_json || '[]'),
    isSystem: Boolean(r.is_system)
  }));
}

export async function createRoleInDb({ name, description, status, permissions }) {
  const db = await getStoreDb();
  const id = name.toLowerCase().replace(/\s+/g, '-');
  const slug = id;
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO roles (id, name, slug, description, status, permissions_json, is_system, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      slug,
      description || '',
      status || 'active',
      JSON.stringify(permissions || []),
      0,
      now
    ]
  );
  return {
    id,
    name,
    slug,
    description,
    status,
    permissions: permissions || [],
    isSystem: false
  };
}

export async function updateRoleInDb(roleId, { name, slug, description, status, permissions }) {
  const db = await getStoreDb();
  await db.run(
    `UPDATE roles
     SET name = ?, slug = ?, description = ?, status = ?, permissions_json = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      slug,
      description || '',
      status || 'active',
      JSON.stringify(permissions || []),
      new Date().toISOString(),
      roleId
    ]
  );
  return {
    id: roleId,
    name,
    slug,
    description,
    status,
    permissions: permissions || []
  };
}

export async function deleteRoleInDb(roleId) {
  const db = await getStoreDb();
  await db.run(`DELETE FROM roles WHERE id = ? AND is_system = 0`, [roleId]);
}

export async function listPermissions() {
  const db = await getStoreDb();
  const rows = await db.all(`SELECT * FROM permissions ORDER BY module ASC, name ASC`);
  return rows.map(r => ({
    id: r.id,
    module: r.module,
    name: r.name,
    description: r.description
  }));
}

export async function createPermissionInDb({ id, module, name, description }) {
  const db = await getStoreDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO permissions (id, module, name, description, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, module, name, description || '', now]
  );
  return { id, module, name, description };
}
