import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  B2B_AUDIO_PARTNER_TABLES,
  METASEA_AUDIO_PARTNER_RETAILER_IDS,
  SUPPORTED_AUDIO_PARTNERS,
  TOTAL_CONTENT_LIVE_CACHE_TTL_MS,
  TOTAL_LIVE_METASEA_QUERY_TIMEOUT_MS,
  TOTAL_LIVE_PARTNERDB_QUERY_TIMEOUT_MS,
} from "../config.js";
import { readBackendCache, writeBackendCache } from "../cache.js";
import { getB2BPool, getMetaseaPool } from "../db.js";
import { logDebug, logError, logInfo } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const metaseaAmazonQuery = fs
  .readFileSync(
    path.resolve(__dirname, "../sql/metasea_amazon_total_content_live.sql"),
    "utf8",
  )
  .trim();

const TRACK_INDEX_SERIES_SQL = `
  SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
  UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14
  UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
  UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24
  UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29
  UNION ALL SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33 UNION ALL SELECT 34
  UNION ALL SELECT 35 UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39
  UNION ALL SELECT 40 UNION ALL SELECT 41 UNION ALL SELECT 42 UNION ALL SELECT 43 UNION ALL SELECT 44
  UNION ALL SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47 UNION ALL SELECT 48 UNION ALL SELECT 49
`;

const inflightTotalContentLive = new Map();
const inflightTotalContentLiveAll = new Map();
const inflightAudioSummary = new Map();
const inflightAudioRecentDeliveries = new Map();
const inflightAudioDetailsRows = new Map();
const albumMetadataCache = new Map();

function escapeMysqlIdentifier(identifier) {
  return identifier
    .split(".")
    .map((part) => `\`${part.replace(/`/g, "``")}\``)
    .join(".");
}

function toSqlString(value) {
  return `'${String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function fillPostgresParam1(sql, value) {
  return sql.replace(/\$1\b/g, String(Number.parseInt(String(value), 10) || 0));
}

async function withTimeout(promise, timeoutMs, label) {
  const safeTimeoutMs = Math.max(Number(timeoutMs) || 0, 1000);
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out after ${safeTimeoutMs}ms`);
          error.code = "QUERY_TIMEOUT";
          reject(error);
        }, safeTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function parseRetailerId(overrideValue) {
  if (
    overrideValue === undefined ||
    overrideValue === null ||
    String(overrideValue).trim() === ""
  ) {
    return null;
  }

  const parsed = Number.parseInt(String(overrideValue), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("retailerId must be a positive integer.");
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function parsePositiveInteger(value, fallback, { min = 1, max = 1000 } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    const error = new Error(
      `Value must be an integer between ${min} and ${max}.`,
    );
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function parseReportType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized !== "live" &&
    normalized !== "delivered" &&
    normalized !== "takedown"
  ) {
    const error = new Error(
      "type must be one of: live, delivered, takedown.",
    );
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function toYmd(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateRangeBounds(startDate, endDate) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(String(startDate || ""))) {
    const error = new Error("startDate must be in YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }
  if (!datePattern.test(String(endDate || ""))) {
    const error = new Error("endDate must be in YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }

  const startUtc = new Date(`${startDate}T00:00:00.000Z`);
  const endUtc = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) {
    const error = new Error("Invalid startDate/endDate values.");
    error.statusCode = 400;
    throw error;
  }
  if (startUtc.getTime() > endUtc.getTime()) {
    const error = new Error("startDate cannot be after endDate.");
    error.statusCode = 400;
    throw error;
  }

  const endExclusiveUtc = new Date(endUtc.getTime());
  endExclusiveUtc.setUTCDate(endExclusiveUtc.getUTCDate() + 1);

  return {
    startDateTime: `${startDate} 00:00:00`,
    endExclusiveDateTime: `${toYmd(endExclusiveUtc)} 00:00:00`,
  };
}

function resolvePartnerConfiguration(rawPartner, retailerIdOverride) {
  const partnerKey = String(rawPartner || "").trim().toLowerCase();
  if (!partnerKey) {
    const error = new Error("Partner is required.");
    error.statusCode = 400;
    throw error;
  }

  const configuredRetailerId = METASEA_AUDIO_PARTNER_RETAILER_IDS[partnerKey];
  const configuredPartnerTables = B2B_AUDIO_PARTNER_TABLES[partnerKey];
  if (!configuredRetailerId || !configuredPartnerTables) {
    const error = new Error(
      `No query configuration found for audio partner "${partnerKey}".`,
    );
    error.statusCode = 400;
    throw error;
  }

  const retailerId = parseRetailerId(retailerIdOverride) ?? configuredRetailerId;
  return {
    partnerKey,
    retailerId,
    partnerDbTables: configuredPartnerTables,
  };
}

function resolveRecentDeliveriesPartners(rawPartner) {
  const partnerKey = String(rawPartner || "").trim().toLowerCase();
  if (!partnerKey) {
    const error = new Error("Partner is required.");
    error.statusCode = 400;
    throw error;
  }

  if (partnerKey === "all") {
    return SUPPORTED_AUDIO_PARTNERS;
  }

  return [resolvePartnerConfiguration(partnerKey).partnerKey];
}

function extractNumericTrackIds(trackIdsJson) {
  if (!trackIdsJson || typeof trackIdsJson !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(trackIdsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    return Object.keys(parsed)
      .filter((key) => /^[0-9]+$/.test(key))
      .sort((left, right) => Number(left) - Number(right));
  } catch (_error) {
    return [];
  }
}

function mapRowWithTrackIds(row, partnerKey) {
  const trackIds = extractNumericTrackIds(String(row.trackIdsJson || ""));
  return {
    partner: String(row.partnerKey || partnerKey),
    albumId:
      row.albumId === null || row.albumId === undefined ? "" : String(row.albumId),
    batchId:
      row.batchId === null || row.batchId === undefined ? "" : String(row.batchId),
    ddexType: String(row.ddexType || ""),
    addedOn: String(row.addedOn || ""),
    updatedOn: String(row.updatedOn || ""),
    trackCount: trackIds.length,
    trackIdsCsv: trackIds.join(", "),
    albumName: "",
    upc: "",
  };
}

async function queryAlbumMetadataMap(albumIds) {
  const normalizedIds = Array.from(
    new Set(
      (albumIds || []).reduce((accumulator, id) => {
        const parsed = Number.parseInt(String(id || "").trim(), 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          accumulator.push(String(parsed));
        }
        return accumulator;
      }, []),
    ),
  );

  if (!normalizedIds.length) {
    return new Map();
  }

  const missingIds = normalizedIds.filter((id) => !albumMetadataCache.has(id));
  if (missingIds.length) {
    logDebug("Fetching album metadata from Metasea DB", {
      requestedAlbumIds: normalizedIds.length,
      missingAlbumIds: missingIds.length,
    });

    const metaseaPool = getMetaseaPool();
    const chunkSize = 1000;
    for (let index = 0; index < missingIds.length; index += chunkSize) {
      const chunk = missingIds.slice(index, index + chunkSize);
      const chunkNumbers = chunk.map((id) => Number(id));
      const sql = `
        SELECT
          td.content_id::text AS album_id,
          COALESCE(meta_title.content_title, '') AS album_name,
          COALESCE(td.content_code, '') AS upc
        FROM mvcms.tbl_contents td
        LEFT JOIN LATERAL (
          SELECT cd.content_title
          FROM mvcms.tbl_content_details cd
          WHERE cd.content_id = td.content_id
          ORDER BY CASE WHEN cd.language_id = 'eng' THEN 0 ELSE 1 END
          LIMIT 1
        ) AS meta_title ON TRUE
        WHERE td.content_id = ANY($1::bigint[])
      `;
      const result = await metaseaPool.query(sql, [chunkNumbers]);
      const found = new Set();
      for (const row of result.rows || []) {
        const key = String(row.album_id || "");
        if (!key) {
          continue;
        }
        albumMetadataCache.set(key, {
          albumName: String(row.album_name || ""),
          upc: String(row.upc || ""),
        });
        found.add(key);
      }
      for (const id of chunk) {
        if (!found.has(id)) {
          albumMetadataCache.set(id, { albumName: "", upc: "" });
        }
      }
    }

    logDebug("Album metadata fetch from Metasea completed", {
      fetchedAlbumIds: missingIds.length,
      cacheSize: albumMetadataCache.size,
    });
  }

  const output = new Map();
  for (const id of normalizedIds) {
    output.set(id, albumMetadataCache.get(id) || { albumName: "", upc: "" });
  }
  return output;
}

async function enrichRowsWithAlbumMetadata(rows) {
  if (!rows?.length) {
    return rows || [];
  }
  const albumIds = rows
    .map((row) => String(row.albumId || "").trim())
    .filter(Boolean);
  if (!albumIds.length) {
    return rows;
  }
  const metadataMap = await queryAlbumMetadataMap(albumIds);
  return rows.map((row) => {
    const meta = metadataMap.get(String(row.albumId || "").trim()) || {
      albumName: "",
      upc: "",
    };
    return {
      ...row,
      albumName: meta.albumName,
      upc: meta.upc,
    };
  });
}

async function queryMetaseaTotalTracks(retailerId) {
  const startedAt = Date.now();
  logDebug("Running Metasea total-content-live query", { retailerId });
  const metaseaPool = getMetaseaPool();
  const result = await withTimeout(
    metaseaPool.query({
      text: metaseaAmazonQuery,
      values: [retailerId],
      statement_timeout: TOTAL_LIVE_METASEA_QUERY_TIMEOUT_MS,
    }),
    TOTAL_LIVE_METASEA_QUERY_TIMEOUT_MS + 1500,
    `Metasea total-content-live (retailerId=${retailerId})`,
  );
  const rawCount = result.rows?.[0]?.total_tracks ?? 0;
  const count = Number(rawCount) || 0;
  logDebug("Metasea query completed", {
    retailerId,
    count,
    durationMs: Date.now() - startedAt,
  });
  return count;
}

async function queryPartnerDbTotalTracks({ contents, push }) {
  const startedAt = Date.now();
  logDebug("Running partner-db total-content-live query", {
    contentsTable: contents,
    pushTable: push,
  });

  const contentsTable = escapeMysqlIdentifier(contents);
  const pushTable = escapeMysqlIdentifier(push);
  const sql = `
    SELECT COALESCE(
      SUM(
        CASE
          WHEN c.TRACK_IDS IS NOT NULL
            AND c.TRACK_IDS != ''
            AND JSON_VALID(c.TRACK_IDS) = 1
          THEN JSON_LENGTH(c.TRACK_IDS)
          ELSE 0
        END
      ),
      0
    ) AS total_track_count
    FROM ${contentsTable} c
    WHERE c.DDEX_TYPE IN ('AUDIO_ALBUM_INSERT', 'AUDIO_ALBUM_UPDATE')
      AND c.STATUS = 1
      AND EXISTS (
        SELECT 1
        FROM ${pushTable} p
        WHERE p.BATCH_ID = c.BATCH_ID
          AND p.STATUS = 1
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ${contentsTable} c2
        WHERE c2.ALBUM_ID = c.ALBUM_ID
          AND c2.DDEX_TYPE IN (
            'AUDIO_ALBUM_INSERT',
            'AUDIO_ALBUM_UPDATE',
            'AUDIO_ALBUM_TAKEDOWN'
          )
          AND c2.ADDED_ON > c.ADDED_ON
      );
  `;

  const b2bPool = getB2BPool();
  const [rows] = await withTimeout(
    b2bPool.query({
      sql,
      timeout: TOTAL_LIVE_PARTNERDB_QUERY_TIMEOUT_MS,
    }),
    TOTAL_LIVE_PARTNERDB_QUERY_TIMEOUT_MS + 1500,
    `Partner-db total-content-live (${contents})`,
  );
  const rawCount = rows?.[0]?.total_track_count ?? 0;
  const count = Number(rawCount) || 0;
  logDebug("Partner-db total-content-live query completed", {
    contentsTable: contents,
    pushTable: push,
    count,
    durationMs: Date.now() - startedAt,
  });
  return count;
}

async function queryPartnerDbDeliveredTracks({ tables, bounds }) {
  const startedAt = Date.now();
  const contentsTable = escapeMysqlIdentifier(tables.contents);
  const pushTable = escapeMysqlIdentifier(tables.push);
  logDebug("Running partner-db delivered-in-period query", {
    contentsTable: tables.contents,
    pushTable: tables.push,
    startDateTime: bounds.startDateTime,
    endExclusiveDateTime: bounds.endExclusiveDateTime,
  });

  const sql = `
    SELECT COUNT(*) AS delivered_track_count
    FROM (
      /*
        Latest UPDATE per album (in range), only for albums that had INSERT in range
      */
      SELECT u.TRACK_IDS
      FROM ${contentsTable} u
      INNER JOIN ${pushTable} pu
          ON pu.BATCH_ID = u.BATCH_ID
         AND pu.STATUS = 1
      INNER JOIN (
          SELECT c.ALBUM_ID,
                 MAX(
                   CONCAT(
                     COALESCE(
                       DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(
                       DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
                   )
                 ) AS latest_key
          FROM ${contentsTable} c
          INNER JOIN ${pushTable} p
              ON p.BATCH_ID = c.BATCH_ID
             AND p.STATUS = 1
          WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
            AND c.STATUS = 1
            AND c.ADDED_ON >= ?
            AND c.ADDED_ON <  ?
          GROUP BY c.ALBUM_ID
      ) latest_update
         ON latest_update.ALBUM_ID = u.ALBUM_ID
         AND latest_update.latest_key = CONCAT(
               COALESCE(
                 DATE_FORMAT(u.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(
                 DATE_FORMAT(u.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(LPAD(u.BATCH_ID, 64, '0'), '0')
             )
      INNER JOIN (
          SELECT DISTINCT ci.ALBUM_ID
          FROM ${contentsTable} ci
          INNER JOIN ${pushTable} pi
              ON pi.BATCH_ID = ci.BATCH_ID
             AND pi.STATUS = 1
          WHERE ci.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
            AND ci.STATUS = 1
            AND ci.ADDED_ON >= ?
            AND ci.ADDED_ON <  ?
      ) insert_albums
          ON insert_albums.ALBUM_ID = u.ALBUM_ID
      WHERE u.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
        AND u.STATUS = 1
        AND u.ADDED_ON >= ?
        AND u.ADDED_ON <  ?
        AND u.TRACK_IDS IS NOT NULL
        AND u.TRACK_IDS != ''
        AND JSON_VALID(u.TRACK_IDS) = 1

      UNION ALL

      /*
        Latest INSERT per album (in range), only where UPDATE does not exist in range
      */
      SELECT i.TRACK_IDS
      FROM ${contentsTable} i
      INNER JOIN ${pushTable} pi
          ON pi.BATCH_ID = i.BATCH_ID
         AND pi.STATUS = 1
      INNER JOIN (
          SELECT c.ALBUM_ID,
                 MAX(
                   CONCAT(
                     COALESCE(
                       DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(
                       DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
                   )
                 ) AS latest_key
          FROM ${contentsTable} c
          INNER JOIN ${pushTable} p
              ON p.BATCH_ID = c.BATCH_ID
             AND p.STATUS = 1
          WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
            AND c.STATUS = 1
            AND c.ADDED_ON >= ?
            AND c.ADDED_ON <  ?
          GROUP BY c.ALBUM_ID
      ) latest_insert
         ON latest_insert.ALBUM_ID = i.ALBUM_ID
         AND latest_insert.latest_key = CONCAT(
               COALESCE(
                 DATE_FORMAT(i.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(
                 DATE_FORMAT(i.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(LPAD(i.BATCH_ID, 64, '0'), '0')
             )
      LEFT JOIN (
          SELECT DISTINCT cu.ALBUM_ID
          FROM ${contentsTable} cu
          INNER JOIN ${pushTable} pu
              ON pu.BATCH_ID = cu.BATCH_ID
             AND pu.STATUS = 1
          WHERE cu.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
            AND cu.STATUS = 1
            AND cu.ADDED_ON >= ?
            AND cu.ADDED_ON <  ?
      ) update_albums
          ON update_albums.ALBUM_ID = i.ALBUM_ID
      WHERE i.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
        AND i.STATUS = 1
        AND i.ADDED_ON >= ?
        AND i.ADDED_ON <  ?
        AND i.TRACK_IDS IS NOT NULL
        AND i.TRACK_IDS != ''
        AND JSON_VALID(i.TRACK_IDS) = 1
        AND update_albums.ALBUM_ID IS NULL
    ) d
    INNER JOIN (${TRACK_INDEX_SERIES_SQL}) nums
      ON nums.n < JSON_LENGTH(d.TRACK_IDS)
    WHERE JSON_UNQUOTE(
      JSON_EXTRACT(
        JSON_KEYS(d.TRACK_IDS),
        CONCAT('$[', nums.n, ']')
      )
    ) REGEXP '^[0-9]';
  `;

  const params = [
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
  ];

  const b2bPool = getB2BPool();
  const [rows] = await b2bPool.query(sql, params);
  const rawCount = rows?.[0]?.delivered_track_count ?? 0;
  const count = Number(rawCount) || 0;
  logDebug("Partner-db delivered-in-period query completed", {
    contentsTable: tables.contents,
    count,
    durationMs: Date.now() - startedAt,
  });
  return count;
}

async function queryPartnerDbTakenDownTracks({ tables, bounds }) {
  const startedAt = Date.now();
  const contentsTable = escapeMysqlIdentifier(tables.contents);
  const pushTable = escapeMysqlIdentifier(tables.push);
  logDebug("Running partner-db takedown-in-period query", {
    contentsTable: tables.contents,
    pushTable: tables.push,
    startDateTime: bounds.startDateTime,
    endExclusiveDateTime: bounds.endExclusiveDateTime,
  });

  const sql = `
    SELECT COUNT(*) AS takedown_track_count
    FROM (
      SELECT t.TRACK_IDS
      FROM ${contentsTable} t
      INNER JOIN ${pushTable} pt
          ON pt.BATCH_ID = t.BATCH_ID
         AND pt.STATUS = 1
      INNER JOIN (
          SELECT c.ALBUM_ID,
                 MAX(
                   CONCAT(
                     COALESCE(
                       DATE_FORMAT(c.DELETION_DATE, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(
                       DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
                   )
                 ) AS latest_key
          FROM ${contentsTable} c
          INNER JOIN ${pushTable} p
              ON p.BATCH_ID = c.BATCH_ID
             AND p.STATUS = 1
          WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_TAKEDOWN'
            AND c.STATUS = 1
            AND c.DELETION_DATE >= ?
            AND c.DELETION_DATE <  ?
          GROUP BY c.ALBUM_ID
      ) latest_takedown
         ON latest_takedown.ALBUM_ID = t.ALBUM_ID
         AND latest_takedown.latest_key = CONCAT(
               COALESCE(
                 DATE_FORMAT(t.DELETION_DATE, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(
                 DATE_FORMAT(t.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(LPAD(t.BATCH_ID, 64, '0'), '0')
             )
      WHERE t.DDEX_TYPE = 'AUDIO_ALBUM_TAKEDOWN'
        AND t.STATUS = 1
        AND t.DELETION_DATE >= ?
        AND t.DELETION_DATE <  ?
        AND t.TRACK_IDS IS NOT NULL
        AND t.TRACK_IDS != ''
        AND JSON_VALID(t.TRACK_IDS) = 1
    ) d
    INNER JOIN (${TRACK_INDEX_SERIES_SQL}) nums
      ON nums.n < JSON_LENGTH(d.TRACK_IDS)
    WHERE JSON_UNQUOTE(
      JSON_EXTRACT(
        JSON_KEYS(d.TRACK_IDS),
        CONCAT('$[', nums.n, ']')
      )
    ) REGEXP '^[0-9]';
  `;

  const params = [
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
  ];

  const b2bPool = getB2BPool();
  const [rows] = await b2bPool.query(sql, params);
  const rawCount = rows?.[0]?.takedown_track_count ?? 0;
  const count = Number(rawCount) || 0;
  logDebug("Partner-db takedown-in-period query completed", {
    contentsTable: tables.contents,
    count,
    durationMs: Date.now() - startedAt,
  });
  return count;
}

async function queryPartnerDbRecentDeliveriesRows({
  partnerKey,
  tables,
  bounds,
  limit,
}) {
  const startedAt = Date.now();
  const contentsTable = escapeMysqlIdentifier(tables.contents);
  const pushTable = escapeMysqlIdentifier(tables.push);
  logDebug("Running partner-db recent-deliveries query", {
    partner: partnerKey,
    contentsTable: tables.contents,
    pushTable: tables.push,
    startDateTime: bounds.startDateTime,
    endExclusiveDateTime: bounds.endExclusiveDateTime,
    limit,
  });

  const sql = `
    SELECT
      ? AS partnerKey,
      d.ALBUM_ID AS albumId,
      d.BATCH_ID AS batchId,
      d.DDEX_TYPE AS ddexType,
      DATE_FORMAT(d.ADDED_ON, '%Y-%m-%d %H:%i:%s') AS addedOn,
      DATE_FORMAT(d.UPDATED_ON, '%Y-%m-%d %H:%i:%s') AS updatedOn,
      d.TRACK_IDS AS trackIdsJson
    FROM (
      /*
        Latest UPDATE per album (in range), only for albums that had INSERT in range
      */
      SELECT u.ALBUM_ID, u.BATCH_ID, u.DDEX_TYPE, u.ADDED_ON, u.UPDATED_ON, u.TRACK_IDS
      FROM ${contentsTable} u
      INNER JOIN ${pushTable} pu
          ON pu.BATCH_ID = u.BATCH_ID
         AND pu.STATUS = 1
      INNER JOIN (
          SELECT c.ALBUM_ID,
                 MAX(
                   CONCAT(
                     COALESCE(
                       DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(
                       DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
                   )
                 ) AS latest_key
          FROM ${contentsTable} c
          INNER JOIN ${pushTable} p
              ON p.BATCH_ID = c.BATCH_ID
             AND p.STATUS = 1
          WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
            AND c.STATUS = 1
            AND c.ADDED_ON >= ?
            AND c.ADDED_ON <  ?
          GROUP BY c.ALBUM_ID
      ) latest_update
         ON latest_update.ALBUM_ID = u.ALBUM_ID
         AND latest_update.latest_key = CONCAT(
               COALESCE(
                 DATE_FORMAT(u.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(
                 DATE_FORMAT(u.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(LPAD(u.BATCH_ID, 64, '0'), '0')
             )
      INNER JOIN (
          SELECT DISTINCT ci.ALBUM_ID
          FROM ${contentsTable} ci
          INNER JOIN ${pushTable} pi
              ON pi.BATCH_ID = ci.BATCH_ID
             AND pi.STATUS = 1
          WHERE ci.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
            AND ci.STATUS = 1
            AND ci.ADDED_ON >= ?
            AND ci.ADDED_ON <  ?
      ) insert_albums
          ON insert_albums.ALBUM_ID = u.ALBUM_ID
      WHERE u.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
        AND u.STATUS = 1
        AND u.ADDED_ON >= ?
        AND u.ADDED_ON <  ?
        AND u.TRACK_IDS IS NOT NULL
        AND u.TRACK_IDS != ''
        AND JSON_VALID(u.TRACK_IDS) = 1

      UNION ALL

      /*
        Latest INSERT per album (in range), only where UPDATE does not exist in range
      */
      SELECT i.ALBUM_ID, i.BATCH_ID, i.DDEX_TYPE, i.ADDED_ON, i.UPDATED_ON, i.TRACK_IDS
      FROM ${contentsTable} i
      INNER JOIN ${pushTable} pi
          ON pi.BATCH_ID = i.BATCH_ID
         AND pi.STATUS = 1
      INNER JOIN (
          SELECT c.ALBUM_ID,
                 MAX(
                   CONCAT(
                     COALESCE(
                       DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(
                       DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
                   )
                 ) AS latest_key
          FROM ${contentsTable} c
          INNER JOIN ${pushTable} p
              ON p.BATCH_ID = c.BATCH_ID
             AND p.STATUS = 1
          WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
            AND c.STATUS = 1
            AND c.ADDED_ON >= ?
            AND c.ADDED_ON <  ?
          GROUP BY c.ALBUM_ID
      ) latest_insert
         ON latest_insert.ALBUM_ID = i.ALBUM_ID
         AND latest_insert.latest_key = CONCAT(
               COALESCE(
                 DATE_FORMAT(i.ADDED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(
                 DATE_FORMAT(i.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                 '0000-00-00 00:00:00'
               ),
               '|',
               COALESCE(LPAD(i.BATCH_ID, 64, '0'), '0')
             )
      LEFT JOIN (
          SELECT DISTINCT cu.ALBUM_ID
          FROM ${contentsTable} cu
          INNER JOIN ${pushTable} pu
              ON pu.BATCH_ID = cu.BATCH_ID
             AND pu.STATUS = 1
          WHERE cu.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
            AND cu.STATUS = 1
            AND cu.ADDED_ON >= ?
            AND cu.ADDED_ON <  ?
      ) update_albums
          ON update_albums.ALBUM_ID = i.ALBUM_ID
      WHERE i.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
        AND i.STATUS = 1
        AND i.ADDED_ON >= ?
        AND i.ADDED_ON <  ?
        AND i.TRACK_IDS IS NOT NULL
        AND i.TRACK_IDS != ''
        AND JSON_VALID(i.TRACK_IDS) = 1
        AND update_albums.ALBUM_ID IS NULL
    ) d
    ORDER BY d.ADDED_ON DESC, d.UPDATED_ON DESC, d.BATCH_ID DESC
    LIMIT ?;
  `;

  const params = [
    partnerKey,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    limit,
  ];

  const b2bPool = getB2BPool();
  const [rows] = await b2bPool.query(sql, params);
  const deliveries = (rows || []).map((row) => mapRowWithTrackIds(row, partnerKey));

  logDebug("Partner-db recent-deliveries query completed", {
    partner: partnerKey,
    contentsTable: tables.contents,
    returnedRows: deliveries.length,
    durationMs: Date.now() - startedAt,
  });

  return deliveries;
}

async function queryPartnerDbLiveRows({ partnerKey, tables, limit }) {
  const startedAt = Date.now();
  const contentsTable = escapeMysqlIdentifier(tables.contents);
  const pushTable = escapeMysqlIdentifier(tables.push);
  logDebug("Running partner-db live-rows query", {
    partner: partnerKey,
    contentsTable: tables.contents,
    pushTable: tables.push,
    limit,
  });

  const sql = `
    SELECT
      ? AS partnerKey,
      c.ALBUM_ID AS albumId,
      c.BATCH_ID AS batchId,
      c.DDEX_TYPE AS ddexType,
      DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s') AS addedOn,
      DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s') AS updatedOn,
      c.TRACK_IDS AS trackIdsJson
    FROM ${contentsTable} c
    WHERE c.DDEX_TYPE IN ('AUDIO_ALBUM_INSERT', 'AUDIO_ALBUM_UPDATE')
      AND c.STATUS = 1
      AND c.TRACK_IDS IS NOT NULL
      AND c.TRACK_IDS != ''
      AND JSON_VALID(c.TRACK_IDS) = 1
      AND EXISTS (
        SELECT 1
        FROM ${pushTable} p
        WHERE p.BATCH_ID = c.BATCH_ID
          AND p.STATUS = 1
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ${contentsTable} c2
        WHERE c2.ALBUM_ID = c.ALBUM_ID
          AND c2.DDEX_TYPE IN (
            'AUDIO_ALBUM_INSERT',
            'AUDIO_ALBUM_UPDATE',
            'AUDIO_ALBUM_TAKEDOWN'
          )
          AND c2.ADDED_ON > c.ADDED_ON
      )
    ORDER BY c.ADDED_ON DESC, c.UPDATED_ON DESC, c.BATCH_ID DESC
    LIMIT ?;
  `;

  const b2bPool = getB2BPool();
  const [rows] = await b2bPool.query(sql, [partnerKey, limit]);
  const deliveries = (rows || []).map((row) => mapRowWithTrackIds(row, partnerKey));
  logDebug("Partner-db live-rows query completed", {
    partner: partnerKey,
    contentsTable: tables.contents,
    returnedRows: deliveries.length,
    durationMs: Date.now() - startedAt,
  });
  return deliveries;
}

async function queryPartnerDbTakenDownRows({
  partnerKey,
  tables,
  bounds,
  limit,
}) {
  const startedAt = Date.now();
  const contentsTable = escapeMysqlIdentifier(tables.contents);
  const pushTable = escapeMysqlIdentifier(tables.push);
  logDebug("Running partner-db takedown-rows query", {
    partner: partnerKey,
    contentsTable: tables.contents,
    pushTable: tables.push,
    startDateTime: bounds.startDateTime,
    endExclusiveDateTime: bounds.endExclusiveDateTime,
    limit,
  });

  const sql = `
    SELECT
      ? AS partnerKey,
      d.ALBUM_ID AS albumId,
      d.BATCH_ID AS batchId,
      d.DDEX_TYPE AS ddexType,
      DATE_FORMAT(d.DELETION_DATE, '%Y-%m-%d %H:%i:%s') AS addedOn,
      DATE_FORMAT(d.UPDATED_ON, '%Y-%m-%d %H:%i:%s') AS updatedOn,
      d.TRACK_IDS AS trackIdsJson
    FROM (
      SELECT t.ALBUM_ID, t.BATCH_ID, t.DDEX_TYPE, t.DELETION_DATE, t.UPDATED_ON, t.TRACK_IDS
      FROM ${contentsTable} t
      INNER JOIN ${pushTable} pt
          ON pt.BATCH_ID = t.BATCH_ID
         AND pt.STATUS = 1
      INNER JOIN (
          SELECT c.ALBUM_ID,
                 MAX(
                   CONCAT(
                     COALESCE(
                       DATE_FORMAT(c.DELETION_DATE, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(
                       DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                       '0000-00-00 00:00:00'
                     ),
                     '|',
                     COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
                   )
                 ) AS latest_key
          FROM ${contentsTable} c
          INNER JOIN ${pushTable} p
              ON p.BATCH_ID = c.BATCH_ID
             AND p.STATUS = 1
          WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_TAKEDOWN'
            AND c.STATUS = 1
            AND c.DELETION_DATE >= ?
            AND c.DELETION_DATE <  ?
          GROUP BY c.ALBUM_ID
      ) latest_takedown
         ON latest_takedown.ALBUM_ID = t.ALBUM_ID
        AND latest_takedown.latest_key = CONCAT(
              COALESCE(
                DATE_FORMAT(t.DELETION_DATE, '%Y-%m-%d %H:%i:%s'),
                '0000-00-00 00:00:00'
              ),
              '|',
              COALESCE(
                DATE_FORMAT(t.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),
                '0000-00-00 00:00:00'
              ),
              '|',
              COALESCE(LPAD(t.BATCH_ID, 64, '0'), '0')
            )
      WHERE t.DDEX_TYPE = 'AUDIO_ALBUM_TAKEDOWN'
        AND t.STATUS = 1
        AND t.DELETION_DATE >= ?
        AND t.DELETION_DATE <  ?
        AND t.TRACK_IDS IS NOT NULL
        AND t.TRACK_IDS != ''
        AND JSON_VALID(t.TRACK_IDS) = 1
    ) d
    ORDER BY d.DELETION_DATE DESC, d.UPDATED_ON DESC, d.BATCH_ID DESC
    LIMIT ?;
  `;

  const params = [
    partnerKey,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    bounds.startDateTime,
    bounds.endExclusiveDateTime,
    limit,
  ];

  const b2bPool = getB2BPool();
  const [rows] = await b2bPool.query(sql, params);
  const deliveries = (rows || []).map((row) => mapRowWithTrackIds(row, partnerKey));
  logDebug("Partner-db takedown-rows query completed", {
    partner: partnerKey,
    contentsTable: tables.contents,
    returnedRows: deliveries.length,
    durationMs: Date.now() - startedAt,
  });
  return deliveries;
}

function getCacheKey(config) {
  return [
    config.partnerKey,
    config.retailerId,
    config.partnerDbTables.contents,
    config.partnerDbTables.push,
  ].join("|");
}

function getSummaryCacheKey(config, bounds) {
  return `${getCacheKey(config)}|${bounds.startDateTime}|${bounds.endExclusiveDateTime}`;
}

function getRecentDeliveriesCacheKey(partner, bounds, limit) {
  return `recent|${partner}|${bounds.startDateTime}|${bounds.endExclusiveDateTime}|${limit}`;
}

function getDetailsRowsCacheKey({ partner, type, bounds, limit }) {
  const startKey = bounds?.startDateTime || "all-time";
  const endKey = bounds?.endExclusiveDateTime || "all-time";
  return `details|${partner}|${type}|${startKey}|${endKey}|${limit}`;
}

async function getCached(namespace, cacheKey) {
  if (TOTAL_CONTENT_LIVE_CACHE_TTL_MS <= 0) {
    return null;
  }
  return readBackendCache({
    namespace,
    cacheKey,
    ttlMs: TOTAL_CONTENT_LIVE_CACHE_TTL_MS,
  });
}

async function setCached(namespace, cacheKey, value) {
  if (TOTAL_CONTENT_LIVE_CACHE_TTL_MS <= 0) {
    return;
  }
  await writeBackendCache({
    namespace,
    cacheKey,
    value,
    ttlMs: TOTAL_CONTENT_LIVE_CACHE_TTL_MS,
  });
}

async function executeTotalContentLive(config) {
  logInfo("Fetching total-content-live", {
    partner: config.partnerKey,
    retailerId: config.retailerId,
    partnerDbContentsTable: config.partnerDbTables.contents,
    partnerDbPushTable: config.partnerDbTables.push,
  });

  const [metaseaResult, partnerDbResult] = await Promise.allSettled([
    queryMetaseaTotalTracks(config.retailerId),
    queryPartnerDbTotalTracks(config.partnerDbTables),
  ]);

  if (metaseaResult.status === "rejected") {
    logError("Metasea query failed", {
      partner: config.partnerKey,
      retailerId: config.retailerId,
      error: metaseaResult.reason?.message,
      code: metaseaResult.reason?.code,
    });
  }
  if (partnerDbResult.status === "rejected") {
    logError("Partner-db total query failed", {
      partner: config.partnerKey,
      contentsTable: config.partnerDbTables.contents,
      pushTable: config.partnerDbTables.push,
      error: partnerDbResult.reason?.message,
      code: partnerDbResult.reason?.code,
    });
  }

  if (partnerDbResult.status === "rejected") {
    const error = new Error(
      "Partner DB query failed. Check API logs for failure details.",
    );
    error.statusCode = 502;
    throw error;
  }

  const metaseaCount =
    metaseaResult.status === "fulfilled" ? metaseaResult.value : 0;
  const partnerDbCount = partnerDbResult.value;
  const payload = {
    partner: config.partnerKey,
    retailerId: config.retailerId,
    metasea: metaseaCount,
    partnerDb: partnerDbCount,
    b2b: partnerDbCount,
    total: partnerDbCount,
    partnerDbTables: config.partnerDbTables,
  };

  logInfo("Total-content-live fetched", {
    partner: config.partnerKey,
    retailerId: config.retailerId,
    metasea: metaseaCount,
    partnerDb: partnerDbCount,
    total: partnerDbCount,
  });
  return payload;
}

async function executeAllPartnersTotalContentLive({ bypassCache = false } = {}) {
  logInfo("Fetching total-content-live for all partners", {
    partnerCount: SUPPORTED_AUDIO_PARTNERS.length,
  });

  const results = await Promise.allSettled(
    SUPPORTED_AUDIO_PARTNERS.map((partnerKey) =>
      getAudioPartnerTotalContentLive({
        partner: partnerKey,
        bypassCache,
      }),
    ),
  );

  const successful = [];
  const failedPartners = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const partnerKey = SUPPORTED_AUDIO_PARTNERS[index];
    if (result.status === "fulfilled") {
      successful.push(result.value);
      continue;
    }
    failedPartners.push(partnerKey);
    logError("All-partners total-content-live partner query failed", {
      partner: partnerKey,
      error: result.reason?.message,
      code: result.reason?.code,
    });
  }

  if (failedPartners.length) {
    const error = new Error(
      `Unable to fetch total-content-live for all partners. Failed partner(s): ${failedPartners.join(
        ", ",
      )}`,
    );
    error.statusCode = 502;
    throw error;
  }

  const aggregate = successful.reduce(
    (acc, item) => {
      acc.metasea += Number(item.metasea) || 0;
      acc.partnerDb += Number(item.partnerDb) || 0;
      return acc;
    },
    { metasea: 0, partnerDb: 0 },
  );

  const payload = {
    partner: "all",
    retailerId: null,
    metasea: aggregate.metasea,
    partnerDb: aggregate.partnerDb,
    b2b: aggregate.partnerDb,
    total: aggregate.partnerDb,
    partnerBreakdown: successful.map((item) => ({
      partner: item.partner,
      retailerId: item.retailerId,
      metasea: Number(item.metasea) || 0,
      partnerDb: Number(item.partnerDb) || 0,
      b2b: Number(item.partnerDb) || 0,
      total: Number(item.partnerDb) || 0,
      partnerDbTables: item.partnerDbTables,
    })),
  };

  logInfo("All-partners total-content-live fetched", {
    partnerCount: payload.partnerBreakdown.length,
    metasea: payload.metasea,
    partnerDb: payload.partnerDb,
    total: payload.total,
  });

  return payload;
}

export async function getAudioPartnerTotalContentLive({
  partner,
  retailerIdOverride,
  bypassCache = false,
}) {
  const normalizedPartner = String(partner || "").trim().toLowerCase();
  if (normalizedPartner === "all") {
    const cacheKey = `all|${SUPPORTED_AUDIO_PARTNERS.join(",")}`;
    const cacheNamespace = "audio:total-content-live-all";

    if (!bypassCache) {
      const cached = await getCached(cacheNamespace, cacheKey);
      if (cached) {
        logDebug("Total-content-live-all cache hit", { cacheKey });
        return cached;
      }
    } else {
      logDebug("Total-content-live-all cache bypass requested", { cacheKey });
    }

    if (!bypassCache && inflightTotalContentLiveAll.has(cacheKey)) {
      logDebug("Total-content-live-all awaiting inflight query", { cacheKey });
      return inflightTotalContentLiveAll.get(cacheKey);
    }

    const promise = executeAllPartnersTotalContentLive({ bypassCache })
      .then(async (payload) => {
        await setCached(cacheNamespace, cacheKey, payload);
        return payload;
      })
      .finally(() => {
        inflightTotalContentLiveAll.delete(cacheKey);
      });

    inflightTotalContentLiveAll.set(cacheKey, promise);
    return promise;
  }

  const config = resolvePartnerConfiguration(partner, retailerIdOverride);
  const cacheKey = getCacheKey(config);
  const cacheNamespace = "audio:total-content-live";

  if (!bypassCache) {
    const cached = await getCached(cacheNamespace, cacheKey);
    if (cached) {
      logDebug("Total-content-live cache hit", { cacheKey });
      return cached;
    }
  } else {
    logDebug("Total-content-live cache bypass requested", { cacheKey });
  }

  if (!bypassCache && inflightTotalContentLive.has(cacheKey)) {
    logDebug("Total-content-live awaiting inflight query", { cacheKey });
    return inflightTotalContentLive.get(cacheKey);
  }

  const promise = executeTotalContentLive(config)
    .then(async (payload) => {
      await setCached(cacheNamespace, cacheKey, payload);
      return payload;
    })
    .finally(() => {
      inflightTotalContentLive.delete(cacheKey);
    });

  inflightTotalContentLive.set(cacheKey, promise);
  return promise;
}

async function executeAudioPartnerSummary(config, bounds) {
  const [totalResult, deliveredResult, takenDownResult] = await Promise.allSettled([
    getAudioPartnerTotalContentLive({
      partner: config.partnerKey,
      retailerIdOverride: config.retailerId,
    }),
    queryPartnerDbDeliveredTracks({
      tables: config.partnerDbTables,
      bounds,
    }),
    queryPartnerDbTakenDownTracks({
      tables: config.partnerDbTables,
      bounds,
    }),
  ]);

  if (totalResult.status === "rejected") {
    throw totalResult.reason;
  }
  if (deliveredResult.status === "rejected") {
    logError("Partner-db delivered query failed", {
      partner: config.partnerKey,
      error: deliveredResult.reason?.message,
      code: deliveredResult.reason?.code,
    });
    const error = new Error(
      "Partner DB delivered query failed. Check API logs for details.",
    );
    error.statusCode = 502;
    throw error;
  }
  if (takenDownResult.status === "rejected") {
    logError("Partner-db takedown query failed", {
      partner: config.partnerKey,
      error: takenDownResult.reason?.message,
      code: takenDownResult.reason?.code,
    });
    const error = new Error(
      "Partner DB takedown query failed. Check API logs for details.",
    );
    error.statusCode = 502;
    throw error;
  }

  return {
    ...totalResult.value,
    dateRange: {
      from: bounds.startDateTime,
      toExclusive: bounds.endExclusiveDateTime,
    },
    deliveredInPeriod: deliveredResult.value,
    takenDownInPeriod: takenDownResult.value,
  };
}

export async function getAudioPartnerSummary({
  partner,
  retailerIdOverride,
  startDate,
  endDate,
  bypassCache = false,
}) {
  const config = resolvePartnerConfiguration(partner, retailerIdOverride);
  const bounds = parseDateRangeBounds(startDate, endDate);
  const cacheKey = getSummaryCacheKey(config, bounds);
  const cacheNamespace = "audio:summary";

  if (!bypassCache) {
    const cached = await getCached(cacheNamespace, cacheKey);
    if (cached) {
      logDebug("Audio-summary cache hit", { cacheKey });
      return cached;
    }
  } else {
    logDebug("Audio-summary cache bypass requested", { cacheKey });
  }

  if (!bypassCache && inflightAudioSummary.has(cacheKey)) {
    logDebug("Audio-summary awaiting inflight query", { cacheKey });
    return inflightAudioSummary.get(cacheKey);
  }

  const promise = executeAudioPartnerSummary(config, bounds)
    .then(async (payload) => {
      await setCached(cacheNamespace, cacheKey, payload);
      return payload;
    })
    .finally(() => {
      inflightAudioSummary.delete(cacheKey);
    });

  inflightAudioSummary.set(cacheKey, promise);
  return promise;
}

async function executeAudioRecentDeliveries({ partner, bounds, limit }) {
  const partnerKeys = resolveRecentDeliveriesPartners(partner);
  const shouldMergeAllPartners = partnerKeys.length > 1;

  logInfo("Fetching recent deliveries", {
    partner,
    partnerCount: partnerKeys.length,
    startDateTime: bounds.startDateTime,
    endExclusiveDateTime: bounds.endExclusiveDateTime,
    limit,
  });

  const queryLimitPerPartner = shouldMergeAllPartners
    ? Math.max(limit, 10)
    : limit;

  const deliveriesPerPartner = await Promise.allSettled(
    partnerKeys.map((partnerKey) => {
      const config = resolvePartnerConfiguration(partnerKey);
      return queryPartnerDbRecentDeliveriesRows({
        partnerKey,
        tables: config.partnerDbTables,
        bounds,
        limit: queryLimitPerPartner,
      });
    }),
  );

  const fulfilled = [];
  const partnerRowsMap = new Map();
  let successfulPartnerQueries = 0;
  for (let index = 0; index < deliveriesPerPartner.length; index += 1) {
    const result = deliveriesPerPartner[index];
    const partnerKey = partnerKeys[index];
    if (result.status === "fulfilled") {
      successfulPartnerQueries += 1;
      fulfilled.push(...result.value);
      partnerRowsMap.set(partnerKey, result.value || []);
      continue;
    }
    logError("Partner-db recent-deliveries query failed", {
      partner,
      error: result.reason?.message,
      code: result.reason?.code,
    });
  }

  // "No rows found" is a valid outcome; fail only when every partner query failed.
  if (successfulPartnerQueries === 0 && deliveriesPerPartner.length > 0) {
    const error = new Error(
      "Unable to fetch recent deliveries from partner DB. Check API logs for details.",
    );
    error.statusCode = 502;
    throw error;
  }

  fulfilled.sort((left, right) => {
    const leftAdded = left.addedOn || "";
    const rightAdded = right.addedOn || "";
    if (leftAdded !== rightAdded) {
      return rightAdded.localeCompare(leftAdded);
    }

    const leftUpdated = left.updatedOn || "";
    const rightUpdated = right.updatedOn || "";
    if (leftUpdated !== rightUpdated) {
      return rightUpdated.localeCompare(leftUpdated);
    }

    return String(right.batchId || "").localeCompare(String(left.batchId || ""));
  });

  const topRows = fulfilled.slice(0, limit);

  logInfo("Recent deliveries fetched", {
    partner,
    returnedRows: topRows.length,
    partnerCount: partnerKeys.length,
  });

  const enrichedRows = await enrichRowsWithAlbumMetadata(topRows);
  const payload = {
    partner: String(partner || "").toLowerCase(),
    limit,
    dateRange: {
      from: bounds.startDateTime,
      toExclusive: bounds.endExclusiveDateTime,
    },
    rows: enrichedRows,
  };

  if (shouldMergeAllPartners) {
    for (const [partnerKey, rows] of partnerRowsMap.entries()) {
      const partnerPayload = {
        partner: partnerKey,
        limit,
        dateRange: payload.dateRange,
        rows: await enrichRowsWithAlbumMetadata((rows || []).slice(0, limit)),
      };
      const partnerCacheKey = getRecentDeliveriesCacheKey(
        partnerKey,
        bounds,
        limit,
      );
      await setCached("audio:recent-deliveries", partnerCacheKey, partnerPayload);
      logDebug("Recent-deliveries partner cache primed from all-partners query", {
        partner: partnerKey,
        cacheKey: partnerCacheKey,
        rows: partnerPayload.rows.length,
      });
    }
  }

  return payload;
}

export async function getAudioRecentDeliveries({
  partner,
  startDate,
  endDate,
  limit = 10,
  bypassCache = false,
}) {
  const normalizedPartner = String(partner || "").trim().toLowerCase();
  if (!normalizedPartner) {
    const error = new Error("Partner is required.");
    error.statusCode = 400;
    throw error;
  }

  const parsedLimit = parsePositiveInteger(limit, 10, { min: 1, max: 50 });
  const bounds = parseDateRangeBounds(startDate, endDate);
  const cacheKey = getRecentDeliveriesCacheKey(
    normalizedPartner,
    bounds,
    parsedLimit,
  );
  const cacheNamespace = "audio:recent-deliveries";

  if (!bypassCache) {
    const cached = await getCached(cacheNamespace, cacheKey);
    if (cached) {
      logDebug("Recent-deliveries cache hit", { cacheKey });
      return cached;
    }
  } else {
    logDebug("Recent-deliveries cache bypass requested", { cacheKey });
  }

  if (!bypassCache && inflightAudioRecentDeliveries.has(cacheKey)) {
    logDebug("Recent-deliveries awaiting inflight query", { cacheKey });
    return inflightAudioRecentDeliveries.get(cacheKey);
  }

  const promise = executeAudioRecentDeliveries({
    partner: normalizedPartner,
    bounds,
    limit: parsedLimit,
  })
    .then(async (payload) => {
      await setCached(cacheNamespace, cacheKey, payload);
      return payload;
    })
    .finally(() => {
      inflightAudioRecentDeliveries.delete(cacheKey);
    });

  inflightAudioRecentDeliveries.set(cacheKey, promise);
  return promise;
}

async function executeAudioDetailsRows({ partner, type, bounds, limit }) {
  const partnerKeys = resolveRecentDeliveriesPartners(partner);
  const shouldMergeAllPartners = partnerKeys.length > 1;
  const queryLimitPerPartner = shouldMergeAllPartners
    ? Math.max(Math.ceil(limit / partnerKeys.length) + 200, 300)
    : limit;

  logInfo("Fetching audio details rows", {
    partner,
    type,
    partnerCount: partnerKeys.length,
    limit,
    startDateTime: bounds?.startDateTime,
    endExclusiveDateTime: bounds?.endExclusiveDateTime,
  });

  const queryPromises = partnerKeys.map((partnerKey) => {
    const config = resolvePartnerConfiguration(partnerKey);
    if (type === "live") {
      return queryPartnerDbLiveRows({
        partnerKey,
        tables: config.partnerDbTables,
        limit: queryLimitPerPartner,
      });
    }
    if (type === "delivered") {
      return queryPartnerDbRecentDeliveriesRows({
        partnerKey,
        tables: config.partnerDbTables,
        bounds,
        limit: queryLimitPerPartner,
      });
    }
    return queryPartnerDbTakenDownRows({
      partnerKey,
      tables: config.partnerDbTables,
      bounds,
      limit: queryLimitPerPartner,
    });
  });

  const results = await Promise.allSettled(queryPromises);
  const mergedRows = [];
  const partnerRowsMap = new Map();
  let successfulPartnerQueries = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const partnerKey = partnerKeys[index];
    if (result.status === "fulfilled") {
      successfulPartnerQueries += 1;
      mergedRows.push(...result.value);
      partnerRowsMap.set(partnerKey, result.value || []);
      continue;
    }
    logError("Audio details rows query failed", {
      partner,
      type,
      error: result.reason?.message,
      code: result.reason?.code,
    });
  }

  if (successfulPartnerQueries === 0 && results.length > 0) {
    const error = new Error(
      "Unable to fetch audio details rows from partner DB. Check API logs for details.",
    );
    error.statusCode = 502;
    throw error;
  }

  mergedRows.sort((left, right) => {
    const leftAdded = left.addedOn || "";
    const rightAdded = right.addedOn || "";
    if (leftAdded !== rightAdded) {
      return rightAdded.localeCompare(leftAdded);
    }
    const leftUpdated = left.updatedOn || "";
    const rightUpdated = right.updatedOn || "";
    if (leftUpdated !== rightUpdated) {
      return rightUpdated.localeCompare(leftUpdated);
    }
    return String(right.batchId || "").localeCompare(String(left.batchId || ""));
  });

  const rows = mergedRows.slice(0, limit);
  const enrichedRows = await enrichRowsWithAlbumMetadata(rows);
  logInfo("Audio details rows fetched", {
    partner,
    type,
    returnedRows: enrichedRows.length,
    partnerCount: partnerKeys.length,
  });

  const payload = {
    partner: String(partner || "").toLowerCase(),
    type,
    limit,
    dateRange: bounds
      ? {
          from: bounds.startDateTime,
          toExclusive: bounds.endExclusiveDateTime,
        }
      : null,
    rows: enrichedRows,
  };

  if (shouldMergeAllPartners) {
    for (const [partnerKey, partnerRows] of partnerRowsMap.entries()) {
      const partnerPayload = {
        partner: partnerKey,
        type,
        limit,
        dateRange: payload.dateRange,
        rows: await enrichRowsWithAlbumMetadata((partnerRows || []).slice(0, limit)),
      };
      const partnerCacheKey = getDetailsRowsCacheKey({
        partner: partnerKey,
        type,
        bounds,
        limit,
      });
      await setCached("audio:details-rows", partnerCacheKey, partnerPayload);
      logDebug("Audio-details partner cache primed from all-partners query", {
        partner: partnerKey,
        type,
        cacheKey: partnerCacheKey,
        rows: partnerPayload.rows.length,
      });
    }
  }

  return payload;
}

export async function getAudioDetailsRows({
  partner,
  type,
  startDate,
  endDate,
  limit = 100000,
  bypassCache = false,
}) {
  const normalizedPartner = String(partner || "").trim().toLowerCase();
  if (!normalizedPartner) {
    const error = new Error("Partner is required.");
    error.statusCode = 400;
    throw error;
  }

  const parsedType = parseReportType(type);
  const parsedLimit = parsePositiveInteger(limit, 100000, { min: 1, max: 1000000 });
  const bounds =
    parsedType === "live" ? null : parseDateRangeBounds(startDate, endDate);

  const cacheKey = getDetailsRowsCacheKey({
    partner: normalizedPartner,
    type: parsedType,
    bounds,
    limit: parsedLimit,
  });
  const cacheNamespace = "audio:details-rows";

  if (!bypassCache) {
    const cached = await getCached(cacheNamespace, cacheKey);
    if (cached) {
      logDebug("Audio-details-rows cache hit", { cacheKey });
      return cached;
    }
  } else {
    logDebug("Audio-details-rows cache bypass requested", { cacheKey });
  }

  if (!bypassCache && inflightAudioDetailsRows.has(cacheKey)) {
    logDebug("Audio-details-rows awaiting inflight query", { cacheKey });
    return inflightAudioDetailsRows.get(cacheKey);
  }

  const promise = executeAudioDetailsRows({
    partner: normalizedPartner,
    type: parsedType,
    bounds,
    limit: parsedLimit,
  })
    .then(async (payload) => {
      await setCached(cacheNamespace, cacheKey, payload);
      return payload;
    })
    .finally(() => {
      inflightAudioDetailsRows.delete(cacheKey);
    });

  inflightAudioDetailsRows.set(cacheKey, promise);
  return promise;
}

export function getAudioPartnerDebugQueries({
  partner,
  retailerIdOverride,
  startDate,
  endDate,
}) {
  const normalizedPartner = String(partner || "").trim().toLowerCase();
  if (!normalizedPartner) {
    const error = new Error("Partner is required.");
    error.statusCode = 400;
    throw error;
  }

  const buildForPartner = (partnerKey) => {
    const config = resolvePartnerConfiguration(partnerKey, retailerIdOverride);
    const contentsTable = escapeMysqlIdentifier(config.partnerDbTables.contents);
    const pushTable = escapeMysqlIdentifier(config.partnerDbTables.push);
    const bounds =
      startDate && endDate ? parseDateRangeBounds(startDate, endDate) : null;

    const metaseaQuery = fillPostgresParam1(
      metaseaAmazonQuery,
      config.retailerId,
    );

    const partnerDbTotalQuery = `
SELECT COALESCE(
  SUM(
    CASE
      WHEN c.TRACK_IDS IS NOT NULL
        AND c.TRACK_IDS != ''
        AND JSON_VALID(c.TRACK_IDS) = 1
      THEN JSON_LENGTH(c.TRACK_IDS)
      ELSE 0
    END
  ),
  0
) AS total_track_count
FROM ${contentsTable} c
WHERE c.DDEX_TYPE IN ('AUDIO_ALBUM_INSERT', 'AUDIO_ALBUM_UPDATE')
  AND c.STATUS = 1
  AND EXISTS (
    SELECT 1
    FROM ${pushTable} p
    WHERE p.BATCH_ID = c.BATCH_ID
      AND p.STATUS = 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM ${contentsTable} c2
    WHERE c2.ALBUM_ID = c.ALBUM_ID
      AND c2.DDEX_TYPE IN (
        'AUDIO_ALBUM_INSERT',
        'AUDIO_ALBUM_UPDATE',
        'AUDIO_ALBUM_TAKEDOWN'
      )
      AND c2.ADDED_ON > c.ADDED_ON
  );`.trim();

    const deliveredQuery = bounds
      ? `
SELECT COUNT(*) AS delivered_track_count
FROM (
  SELECT u.TRACK_IDS
  FROM ${contentsTable} u
  INNER JOIN ${pushTable} pu
      ON pu.BATCH_ID = u.BATCH_ID
     AND pu.STATUS = 1
  INNER JOIN (
      SELECT c.ALBUM_ID,
             MAX(
               CONCAT(
                 COALESCE(DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
                 '|',
                 COALESCE(DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
                 '|',
                 COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
               )
             ) AS latest_key
      FROM ${contentsTable} c
      INNER JOIN ${pushTable} p
          ON p.BATCH_ID = c.BATCH_ID
         AND p.STATUS = 1
      WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
        AND c.STATUS = 1
        AND c.ADDED_ON >= ${toSqlString(bounds.startDateTime)}
        AND c.ADDED_ON <  ${toSqlString(bounds.endExclusiveDateTime)}
      GROUP BY c.ALBUM_ID
  ) latest_update
     ON latest_update.ALBUM_ID = u.ALBUM_ID
     AND latest_update.latest_key = CONCAT(
           COALESCE(DATE_FORMAT(u.ADDED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
           '|',
           COALESCE(DATE_FORMAT(u.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
           '|',
           COALESCE(LPAD(u.BATCH_ID, 64, '0'), '0')
         )
  INNER JOIN (
      SELECT DISTINCT ci.ALBUM_ID
      FROM ${contentsTable} ci
      INNER JOIN ${pushTable} pi
          ON pi.BATCH_ID = ci.BATCH_ID
         AND pi.STATUS = 1
      WHERE ci.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
        AND ci.STATUS = 1
        AND ci.ADDED_ON >= ${toSqlString(bounds.startDateTime)}
        AND ci.ADDED_ON <  ${toSqlString(bounds.endExclusiveDateTime)}
  ) insert_albums
      ON insert_albums.ALBUM_ID = u.ALBUM_ID
  WHERE u.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
    AND u.STATUS = 1
    AND u.ADDED_ON >= ${toSqlString(bounds.startDateTime)}
    AND u.ADDED_ON <  ${toSqlString(bounds.endExclusiveDateTime)}
    AND u.TRACK_IDS IS NOT NULL
    AND u.TRACK_IDS != ''
    AND JSON_VALID(u.TRACK_IDS) = 1

  UNION ALL

  SELECT i.TRACK_IDS
  FROM ${contentsTable} i
  INNER JOIN ${pushTable} pi
      ON pi.BATCH_ID = i.BATCH_ID
     AND pi.STATUS = 1
  INNER JOIN (
      SELECT c.ALBUM_ID,
             MAX(
               CONCAT(
                 COALESCE(DATE_FORMAT(c.ADDED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
                 '|',
                 COALESCE(DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
                 '|',
                 COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
               )
             ) AS latest_key
      FROM ${contentsTable} c
      INNER JOIN ${pushTable} p
          ON p.BATCH_ID = c.BATCH_ID
         AND p.STATUS = 1
      WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
        AND c.STATUS = 1
        AND c.ADDED_ON >= ${toSqlString(bounds.startDateTime)}
        AND c.ADDED_ON <  ${toSqlString(bounds.endExclusiveDateTime)}
      GROUP BY c.ALBUM_ID
  ) latest_insert
     ON latest_insert.ALBUM_ID = i.ALBUM_ID
     AND latest_insert.latest_key = CONCAT(
           COALESCE(DATE_FORMAT(i.ADDED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
           '|',
           COALESCE(DATE_FORMAT(i.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
           '|',
           COALESCE(LPAD(i.BATCH_ID, 64, '0'), '0')
         )
  LEFT JOIN (
      SELECT DISTINCT cu.ALBUM_ID
      FROM ${contentsTable} cu
      INNER JOIN ${pushTable} pu
          ON pu.BATCH_ID = cu.BATCH_ID
         AND pu.STATUS = 1
      WHERE cu.DDEX_TYPE = 'AUDIO_ALBUM_UPDATE'
        AND cu.STATUS = 1
        AND cu.ADDED_ON >= ${toSqlString(bounds.startDateTime)}
        AND cu.ADDED_ON <  ${toSqlString(bounds.endExclusiveDateTime)}
  ) update_albums
      ON update_albums.ALBUM_ID = i.ALBUM_ID
  WHERE i.DDEX_TYPE = 'AUDIO_ALBUM_INSERT'
    AND i.STATUS = 1
    AND i.ADDED_ON >= ${toSqlString(bounds.startDateTime)}
    AND i.ADDED_ON <  ${toSqlString(bounds.endExclusiveDateTime)}
    AND i.TRACK_IDS IS NOT NULL
    AND i.TRACK_IDS != ''
    AND JSON_VALID(i.TRACK_IDS) = 1
    AND update_albums.ALBUM_ID IS NULL
) d
INNER JOIN (
  ${TRACK_INDEX_SERIES_SQL}
) nums
  ON nums.n < JSON_LENGTH(d.TRACK_IDS)
WHERE JSON_UNQUOTE(
  JSON_EXTRACT(
    JSON_KEYS(d.TRACK_IDS),
    CONCAT('$[', nums.n, ']')
  )
) REGEXP '^[0-9]';`.trim()
      : "-- Provide startDate and endDate to generate Delivered in Period query.";

    const takenDownQuery = bounds
      ? `
SELECT COUNT(*) AS takedown_track_count
FROM (
  SELECT t.TRACK_IDS
  FROM ${contentsTable} t
  INNER JOIN ${pushTable} pt
      ON pt.BATCH_ID = t.BATCH_ID
     AND pt.STATUS = 1
  INNER JOIN (
      SELECT c.ALBUM_ID,
             MAX(
               CONCAT(
                 COALESCE(DATE_FORMAT(c.DELETION_DATE, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
                 '|',
                 COALESCE(DATE_FORMAT(c.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
                 '|',
                 COALESCE(LPAD(c.BATCH_ID, 64, '0'), '0')
               )
             ) AS latest_key
      FROM ${contentsTable} c
      INNER JOIN ${pushTable} p
          ON p.BATCH_ID = c.BATCH_ID
         AND p.STATUS = 1
      WHERE c.DDEX_TYPE = 'AUDIO_ALBUM_TAKEDOWN'
        AND c.STATUS = 1
        AND c.DELETION_DATE >= ${toSqlString(bounds.startDateTime)}
        AND c.DELETION_DATE <  ${toSqlString(bounds.endExclusiveDateTime)}
      GROUP BY c.ALBUM_ID
  ) latest_takedown
     ON latest_takedown.ALBUM_ID = t.ALBUM_ID
    AND latest_takedown.latest_key = CONCAT(
          COALESCE(DATE_FORMAT(t.DELETION_DATE, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
          '|',
          COALESCE(DATE_FORMAT(t.UPDATED_ON, '%Y-%m-%d %H:%i:%s'),'0000-00-00 00:00:00'),
          '|',
          COALESCE(LPAD(t.BATCH_ID, 64, '0'), '0')
        )
  WHERE t.DDEX_TYPE = 'AUDIO_ALBUM_TAKEDOWN'
    AND t.STATUS = 1
    AND t.DELETION_DATE >= ${toSqlString(bounds.startDateTime)}
    AND t.DELETION_DATE <  ${toSqlString(bounds.endExclusiveDateTime)}
    AND t.TRACK_IDS IS NOT NULL
    AND t.TRACK_IDS != ''
    AND JSON_VALID(t.TRACK_IDS) = 1
) d
INNER JOIN (
  ${TRACK_INDEX_SERIES_SQL}
) nums
  ON nums.n < JSON_LENGTH(d.TRACK_IDS)
WHERE JSON_UNQUOTE(
  JSON_EXTRACT(
    JSON_KEYS(d.TRACK_IDS),
    CONCAT('$[', nums.n, ']')
  )
) REGEXP '^[0-9]';`.trim()
      : "-- Provide startDate and endDate to generate Taken Down in Period query.";

    return {
      partner: partnerKey,
      retailerId: config.retailerId,
      tables: config.partnerDbTables,
      dateRange: bounds
        ? {
            startDateTime: bounds.startDateTime,
            endExclusiveDateTime: bounds.endExclusiveDateTime,
          }
        : null,
      queries: {
        metaseaTotalContentLive: metaseaQuery,
        partnerDbTotalContentLive: partnerDbTotalQuery,
        partnerDbDeliveredInPeriod: deliveredQuery,
        partnerDbTakenDownInPeriod: takenDownQuery,
      },
    };
  };

  if (normalizedPartner === "all") {
    return {
      partner: "all",
      items: SUPPORTED_AUDIO_PARTNERS.map((partnerKey) =>
        buildForPartner(partnerKey),
      ),
    };
  }

  return {
    partner: normalizedPartner,
    item: buildForPartner(normalizedPartner),
  };
}
