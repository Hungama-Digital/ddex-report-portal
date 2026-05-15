import {
  B2B_AUDIO_PARTNER_TABLES,
  SUPPORTED_AUDIO_PARTNERS,
} from "../config.js";
import { getB2BPool, getMetaseaPool } from "../db.js";
import { logDebug, logError } from "../logger.js";
import { getAudioDetailsRows } from "./totalContentLiveService.js";

const SEARCH_LIMIT = 200;
const SEARCH_TIMEOUT_MS = 30000;

// Whitelisted column names — never interpolate user input directly
const FIELD_MAP = {
  upc: "UPCID",
  albumId: "ALBUM_ID",
  batchId: "BATCH_ID",
};

function escapeMysqlIdentifier(identifier) {
  return identifier
    .split(".")
    .map((part) => `\`${part.replace(/`/g, "``")}\``)
    .join(".");
}

function formatDate(value) {
  if (!value) return "";
  try {
    if (value instanceof Date) return value.toISOString().replace("T", " ").slice(0, 19);
    return String(value);
  } catch (_error) {
    return String(value);
  }
}

function mapSearchRow(row, partner) {
  return {
    retailer: partner,
    albumId: row.ALBUM_ID === null || row.ALBUM_ID === undefined ? "" : String(row.ALBUM_ID),
    upc: String(row.UPCID || ""),
    batchId: row.BATCH_ID === null || row.BATCH_ID === undefined ? "" : String(row.BATCH_ID),
    ddexType: String(row.DDEX_TYPE || ""),
    status: row.STATUS === null || row.STATUS === undefined ? "" : String(row.STATUS),
    addedOn: formatDate(row.ADDED_ON),
    updatedOn: formatDate(row.UPDATED_ON),
    deletionDate: formatDate(row.DELETION_DATE),
    albumTitle: "",
    matchedBy: "",
  };
}

async function queryPartnerByField({ contentsTable, partner, field, value, limit }) {
  const table = escapeMysqlIdentifier(contentsTable);
  const b2bPool = getB2BPool();

  try {
    const [rows] = await b2bPool.query(
      {
        sql: `
          SELECT ALBUM_ID, BATCH_ID, UPCID, DDEX_TYPE, STATUS,
                 ADDED_ON, UPDATED_ON, DELETION_DATE
          FROM ${table}
          WHERE \`${field}\` = ?
          ORDER BY ADDED_ON DESC
          LIMIT ?
        `,
        timeout: SEARCH_TIMEOUT_MS,
      },
      [value, limit],
    );
    return (rows || []).map((row) => mapSearchRow(row, partner));
  } catch (error) {
    logError("Search query failed", { partner, field, error: error?.message });
    return [];
  }
}

async function searchAllPartnersByField({ field, value, limit }) {
  const results = await Promise.allSettled(
    SUPPORTED_AUDIO_PARTNERS.map((partner) => {
      const tables = B2B_AUDIO_PARTNER_TABLES[partner];
      if (!tables?.contents) return Promise.resolve([]);
      return queryPartnerByField({ contentsTable: tables.contents, partner, field, value, limit });
    }),
  );

  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    logError("Partner search failed", {
      partner: SUPPORTED_AUDIO_PARTNERS[i],
      error: r.reason?.message,
    });
    return [];
  });
}

async function searchByTrackId(trackId) {
  const normalizedId = String(trackId).trim();
  if (!normalizedId || !/^\d+$/.test(normalizedId)) {
    return [];
  }

  logDebug("Track ID search — reading from live rows cache", { trackId: normalizedId });

  const results = await Promise.allSettled(
    SUPPORTED_AUDIO_PARTNERS.map(async (partner) => {
      const payload = await getAudioDetailsRows({
        partner,
        type: "live",
        limit: 500000,
        bypassCache: false,
      });

      return (payload.rows || [])
        .filter((row) => {
          const ids = String(row.trackIdsCsv || "")
            .split(",")
            .map((s) => s.trim());
          return ids.includes(normalizedId);
        })
        .map((row) => ({
          retailer: partner,
          albumId: String(row.albumId || ""),
          upc: String(row.upc || ""),
          batchId: String(row.batchId || ""),
          ddexType: String(row.ddexType || ""),
          status: "",
          addedOn: String(row.addedOn || ""),
          updatedOn: String(row.updatedOn || ""),
          deletionDate: "",
          albumTitle: "",
          matchedBy: "trackId",
        }));
    }),
  );

  return results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    logError("Track ID search failed for partner", {
      partner: SUPPORTED_AUDIO_PARTNERS[i],
      error: r.reason?.message,
    });
    return [];
  });
}

async function enrichWithAlbumTitles(rows) {
  const uniqueIds = [
    ...new Set(rows.map((r) => r.albumId).filter((id) => id && /^\d+$/.test(id))),
  ];
  if (!uniqueIds.length) return rows;

  try {
    const metaseaPool = getMetaseaPool();
    const numericIds = uniqueIds.map(Number);
    const { rows: titleRows } = await metaseaPool.query(
      "SELECT content_id, content_title FROM mvcms.tbl_content_details WHERE content_id = ANY($1)",
      [numericIds],
    );
    const titleMap = Object.fromEntries(
      titleRows.map((r) => [String(r.content_id), r.content_title || ""]),
    );
    return rows.map((row) => ({
      ...row,
      albumTitle: titleMap[row.albumId] || "",
    }));
  } catch (error) {
    logError("Album title enrichment failed", { error: error?.message });
    return rows;
  }
}

function deduplicateRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.retailer}|${row.albumId}|${row.batchId}|${row.ddexType}|${row.addedOn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByAddedOnDesc(rows) {
  return rows.slice().sort((a, b) => {
    const aTs = a.addedOn ? new Date(a.addedOn).getTime() : 0;
    const bTs = b.addedOn ? new Date(b.addedOn).getTime() : 0;
    return bTs - aTs;
  });
}

export async function searchContents({ query, type = "all", limit = SEARCH_LIMIT }) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return { rows: [], total: 0 };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || SEARCH_LIMIT, 1), 500);
  let rows = [];

  if (type === "upc") {
    rows = (await searchAllPartnersByField({ field: "UPCID", value: trimmed, limit: safeLimit }))
      .map((r) => ({ ...r, matchedBy: "upc" }));
  } else if (type === "albumId") {
    rows = (await searchAllPartnersByField({ field: "ALBUM_ID", value: trimmed, limit: safeLimit }))
      .map((r) => ({ ...r, matchedBy: "albumId" }));
  } else if (type === "batchId") {
    rows = (await searchAllPartnersByField({ field: "BATCH_ID", value: trimmed, limit: safeLimit }))
      .map((r) => ({ ...r, matchedBy: "batchId" }));
  } else if (type === "trackId") {
    rows = await searchByTrackId(trimmed);
  } else {
    // All identifiers — run all 4 concurrently then merge
    const [upcRes, albumRes, batchRes, trackRes] = await Promise.allSettled([
      searchAllPartnersByField({ field: "UPCID", value: trimmed, limit: safeLimit }),
      searchAllPartnersByField({ field: "ALBUM_ID", value: trimmed, limit: safeLimit }),
      searchAllPartnersByField({ field: "BATCH_ID", value: trimmed, limit: safeLimit }),
      searchByTrackId(trimmed),
    ]);

    rows = [
      ...(upcRes.status === "fulfilled" ? upcRes.value.map((r) => ({ ...r, matchedBy: "upc" })) : []),
      ...(albumRes.status === "fulfilled" ? albumRes.value.map((r) => ({ ...r, matchedBy: "albumId" })) : []),
      ...(batchRes.status === "fulfilled" ? batchRes.value.map((r) => ({ ...r, matchedBy: "batchId" })) : []),
      ...(trackRes.status === "fulfilled" ? trackRes.value : []),
    ];
  }

  rows = deduplicateRows(rows);
  rows = sortByAddedOnDesc(rows);
  rows = await enrichWithAlbumTitles(rows);

  return { rows, total: rows.length };
}
