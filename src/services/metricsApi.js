function ensureDateInput(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
  }
}

export function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export async function fetchAudioPartnerTotalContentLive({
  partner,
  retailerId,
  signal,
}) {
  if (!partner || partner === "all") {
    return null;
  }

  const params = new URLSearchParams();
  if (retailerId !== undefined && retailerId !== null && retailerId !== "") {
    params.set("retailerId", retailerId);
  }

  const response = await fetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/total-content-live?${params.toString()}`,
    { signal },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error || "Unable to load total content live.",
    );
    error.statusCode = response.status;
    throw error;
  }

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
  if (!partner || partner === "all") {
    return null;
  }

  ensureDateInput(startDate, "startDate");
  ensureDateInput(endDate, "endDate");

  const params = new URLSearchParams();
  params.set("startDate", startDate);
  params.set("endDate", endDate);
  if (retailerId !== undefined && retailerId !== null && retailerId !== "") {
    params.set("retailerId", retailerId);
  }

  const response = await fetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/summary?${params.toString()}`,
    { signal },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error || "Unable to load audio partner metrics.",
    );
    error.statusCode = response.status;
    throw error;
  }

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
    throw new Error("partner is required.");
  }

  ensureDateInput(startDate, "startDate");
  ensureDateInput(endDate, "endDate");

  const params = new URLSearchParams();
  params.set("startDate", startDate);
  params.set("endDate", endDate);
  params.set("limit", String(limit));

  const response = await fetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/recent-deliveries?${params.toString()}`,
    { signal },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error || "Unable to load recent deliveries.",
    );
    error.statusCode = response.status;
    throw error;
  }

  return {
    partner: payload.partner,
    limit: Number(payload.limit) || limit,
    dateRange: payload.dateRange || null,
    rows: Array.isArray(payload.rows)
      ? payload.rows.map((row, index) => ({
          id: `${row.partner || "partner"}:${row.batchId || "batch"}:${row.albumId || "album"}:${index}`,
          partner: String(row.partner || ""),
          albumId: row.albumId === null || row.albumId === undefined ? "" : String(row.albumId),
          albumName: String(row.albumName || ""),
          upc: String(row.upc || ""),
          batchId: row.batchId === null || row.batchId === undefined ? "" : String(row.batchId),
          ddexType: String(row.ddexType || ""),
          addedOn: String(row.addedOn || ""),
          updatedOn: String(row.updatedOn || ""),
          trackCount: Number(row.trackCount) || 0,
          trackIdsCsv: String(row.trackIdsCsv || ""),
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
    throw new Error("partner is required.");
  }
  if (!type) {
    throw new Error("type is required.");
  }

  const normalizedType = String(type).toLowerCase();
  const params = new URLSearchParams();
  params.set("type", normalizedType);
  params.set("limit", String(limit));

  if (normalizedType !== "live") {
    ensureDateInput(startDate, "startDate");
    ensureDateInput(endDate, "endDate");
    params.set("startDate", startDate);
    params.set("endDate", endDate);
  }

  const response = await fetch(
    `/api/audio/partners/${encodeURIComponent(partner)}/details?${params.toString()}`,
    { signal },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error || "Unable to load detailed rows.",
    );
    error.statusCode = response.status;
    throw error;
  }

  return {
    partner: payload.partner,
    type: payload.type,
    limit: Number(payload.limit) || limit,
    dateRange: payload.dateRange || null,
    rows: Array.isArray(payload.rows)
      ? payload.rows.map((row, index) => ({
          id: `${row.partner || "partner"}:${row.batchId || "batch"}:${row.albumId || "album"}:${index}`,
          partner: String(row.partner || ""),
          albumId: row.albumId === null || row.albumId === undefined ? "" : String(row.albumId),
          albumName: String(row.albumName || ""),
          upc: String(row.upc || ""),
          batchId: row.batchId === null || row.batchId === undefined ? "" : String(row.batchId),
          ddexType: String(row.ddexType || ""),
          addedOn: String(row.addedOn || ""),
          updatedOn: String(row.updatedOn || ""),
          trackCount: Number(row.trackCount) || 0,
          trackIdsCsv: String(row.trackIdsCsv || ""),
        }))
      : [],
  };
}
