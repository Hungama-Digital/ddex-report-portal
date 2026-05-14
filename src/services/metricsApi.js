function ensureDateInput(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
  }
}

export function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getAuthToken() {
  try {
    return window.localStorage.getItem('ddex_auth_token') || '';
  } catch (_error) {
    return '';
  }
}

async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed.');
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function requestAccess({ username, email }) {
  return apiFetch('/api/auth/request-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email }),
  });
}

export async function setupPassword({ username, email, password }) {
  return apiFetch('/api/auth/setup-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
}

export async function login({ username, password }) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchMe() {
  return apiFetch('/api/auth/me');
}

export async function logout() {
  return apiFetch('/api/auth/logout', {
    method: 'POST',
  });
}

export async function fetchNotifications({ includeRead = false, limit = 20, days = 7 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('days', String(days));
  if (includeRead) {
    params.set('includeRead', '1');
  }
  return apiFetch(`/api/notifications?${params.toString()}`);
}

export async function markNotificationAsRead(notificationId) {
  return apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
  });
}

export async function fetchPendingApprovals() {
  return apiFetch('/api/admin/approvals');
}

export async function approvePendingUser(userId) {
  return apiFetch(`/api/admin/approvals/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
  });
}

export async function rejectPendingUser(userId) {
  return apiFetch(`/api/admin/approvals/${encodeURIComponent(userId)}/reject`, {
    method: 'POST',
  });
}

export async function fetchReports({ days = 7 } = {}) {
  const params = new URLSearchParams();
  params.set('days', String(days));
  return apiFetch(`/api/reports?${params.toString()}`);
}

export async function fetchReportJobs({ limit = 50 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  return apiFetch(`/api/reports/jobs?${params.toString()}`);
}

export async function queueExportReport({ partner, source }) {
  return apiFetch('/api/reports/jobs/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partner, source }),
  });
}

export async function queueDifferenceReport({ reportIds }) {
  return apiFetch('/api/reports/jobs/difference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportIds }),
  });
}

export function getReportDownloadUrl(reportId) {
  return `/api/reports/${encodeURIComponent(reportId)}/download`;
}

export async function fetchAudioPartnerTotalContentLive({
  partner,
  retailerId,
  signal,
}) {
  if (!partner || partner === 'all') {
    return null;
  }

  const params = new URLSearchParams();
  if (retailerId !== undefined && retailerId !== null && retailerId !== '') {
    params.set('retailerId', retailerId);
  }

  const payload = await apiFetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/total-content-live?${params.toString()}`,
    { signal },
  );

  return {
    partner: payload.partner,
    retailerId: payload.retailerId,
    metasea: Number(payload.metasea) || 0,
    partnerDb: Number(payload.partnerDb ?? payload.b2b) || 0,
    total: Number(payload.total) || 0,
  };
}

export async function fetchAudioPartnerSummary({
  partner,
  startDate,
  endDate,
  retailerId,
  signal,
}) {
  if (!partner || partner === 'all') {
    return null;
  }

  ensureDateInput(startDate, 'startDate');
  ensureDateInput(endDate, 'endDate');

  const params = new URLSearchParams();
  params.set('startDate', startDate);
  params.set('endDate', endDate);
  if (retailerId !== undefined && retailerId !== null && retailerId !== '') {
    params.set('retailerId', retailerId);
  }

  const payload = await apiFetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/summary?${params.toString()}`,
    { signal },
  );

  return {
    partner: payload.partner,
    retailerId: payload.retailerId,
    metasea: Number(payload.metasea) || 0,
    partnerDb: Number(payload.partnerDb ?? payload.b2b) || 0,
    total: Number(payload.total) || 0,
    deliveredInPeriod: Number(payload.deliveredInPeriod) || 0,
    takenDownInPeriod: Number(payload.takenDownInPeriod) || 0,
    dateRange: payload.dateRange || null,
  };
}

export async function fetchAudioRecentDeliveries({
  partner,
  startDate,
  endDate,
  limit = 20,
  signal,
}) {
  if (!partner) {
    throw new Error('partner is required.');
  }

  ensureDateInput(startDate, 'startDate');
  ensureDateInput(endDate, 'endDate');

  const params = new URLSearchParams();
  params.set('startDate', startDate);
  params.set('endDate', endDate);
  params.set('limit', String(limit));

  const payload = await apiFetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/recent-deliveries?${params.toString()}`,
    { signal },
  );

  return {
    partner: payload.partner,
    limit: Number(payload.limit) || limit,
    dateRange: payload.dateRange || null,
    rows: Array.isArray(payload.rows)
      ? payload.rows.map((row, index) => ({
          id: `${row.partner || 'partner'}:${row.batchId || 'batch'}:${row.albumId || 'album'}:${index}`,
          partner: String(row.partner || ''),
          albumId: row.albumId === null || row.albumId === undefined ? '' : String(row.albumId),
          albumName: String(row.albumName || ''),
          upc: String(row.upc || ''),
          batchId: row.batchId === null || row.batchId === undefined ? '' : String(row.batchId),
          ddexType: String(row.ddexType || ''),
          addedOn: String(row.addedOn || ''),
          updatedOn: String(row.updatedOn || ''),
          trackCount: Number(row.trackCount) || 0,
          trackIdsCsv: String(row.trackIdsCsv || ''),
        }))
      : [],
  };
}

export async function fetchAudioDetailsRows({
  partner,
  type,
  startDate,
  endDate,
  limit = 100000,
  signal,
}) {
  if (!partner) {
    throw new Error('partner is required.');
  }
  if (!type) {
    throw new Error('type is required.');
  }

  const normalizedType = String(type).toLowerCase();
  const params = new URLSearchParams();
  params.set('type', normalizedType);
  params.set('limit', String(limit));

  if (normalizedType !== 'live') {
    ensureDateInput(startDate, 'startDate');
    ensureDateInput(endDate, 'endDate');
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }

  const payload = await apiFetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/details?${params.toString()}`,
    { signal },
  );

  return {
    partner: payload.partner,
    type: payload.type,
    limit: Number(payload.limit) || limit,
    dateRange: payload.dateRange || null,
    rows: Array.isArray(payload.rows)
      ? payload.rows.map((row, index) => ({
          id: `${row.partner || 'partner'}:${row.batchId || 'batch'}:${row.albumId || 'album'}:${index}`,
          partner: String(row.partner || ''),
          albumId: row.albumId === null || row.albumId === undefined ? '' : String(row.albumId),
          albumName: String(row.albumName || ''),
          upc: String(row.upc || ''),
          batchId: row.batchId === null || row.batchId === undefined ? '' : String(row.batchId),
          ddexType: String(row.ddexType || ''),
          addedOn: String(row.addedOn || ''),
          updatedOn: String(row.updatedOn || ''),
          trackCount: Number(row.trackCount) || 0,
          trackIdsCsv: String(row.trackIdsCsv || ''),
        }))
      : [],
  };
}
