function ensureDateInput(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
  }
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
  limit = 10,
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
          batchId: row.batchId === null || row.batchId === undefined ? "" : String(row.batchId),
          ddexType: String(row.ddexType || ""),
          addedOn: String(row.addedOn || ""),
          updatedOn: String(row.updatedOn || ""),
          trackCount: Number(row.trackCount) || 0,
        }))
      : [],
  };
}
