import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  B2B_AUDIO_PARTNER_TABLES,
  METASEA_AUDIO_PARTNER_RETAILER_IDS,
  SUPPORTED_AUDIO_PARTNERS,
} from '../config.js';
import { getMetaseaPool } from '../db.js';
import { logError, logInfo } from '../logger.js';
import { getAudioDetailsRows } from './totalContentLiveService.js';
import {
  createNotification,
  createReportJob,
  markReportJobRunning,
  markReportJobFailed,
  markReportJobCompleted,
  createReportRecord,
  getReportById,
  listRecentReports,
  listRecentJobs,
  removeReportById,
} from './localStore.js';

const REPORTS_DIR = path.resolve(process.cwd(), 'reports');
const GENERATED_DIR = path.join(REPORTS_DIR, 'generated');
const JSON_DIR = path.join(REPORTS_DIR, 'json');

const SOURCE_LABELS = {
  metasea: 'Metasea',
  partnerdb: 'Partner DB',
  difference: 'Difference',
};

const PARTNER_LABELS = {
  amazon: 'Amazon',
  bytedance: 'Bytedance',
  facebook: 'Facebook',
  jiosaavn: 'JioSaavn',
  spotify: 'Spotify',
  virgin: 'Virgin',
};

function ensureReportDirectories() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.mkdirSync(JSON_DIR, { recursive: true });
}

function dateTag() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'NA';
}

function getPartnerLabel(partner) {
  return PARTNER_LABELS[String(partner || '').toLowerCase()] || sanitizeSegment(partner);
}

function dedupeTrackRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const trackId = String(row.trackId || '').trim();
    const albumId = String(row.albumId || '').trim();
    if (!trackId) {
      continue;
    }
    if (!map.has(trackId)) {
      map.set(trackId, {
        trackId,
        albumId,
        albumName: String(row.albumName || ''),
        upc: String(row.upc || ''),
      });
    }
  }
  return Array.from(map.values());
}

function buildWorkbookFile(filePath, rows, headers) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(workbook, filePath);
}

async function queryMetaseaTrackRows(partner) {
  const partnerKey = String(partner || '').toLowerCase();
  const retailerId = METASEA_AUDIO_PARTNER_RETAILER_IDS[partnerKey];
  if (!retailerId) {
    const error = new Error(`Unsupported partner for Metasea export: ${partnerKey}`);
    error.statusCode = 400;
    throw error;
  }

  const sql = `
    SELECT DISTINCT ON (trk.content_id)
      trk.content_id::text AS track_id,
      album.content_id::text AS album_id,
      COALESCE(cd.content_title, '') AS album_name,
      COALESCE(album.content_code, '') AS upc
    FROM mvcms.tbl_content_rights_status tcrs
    INNER JOIN mvcms.tbl_contents trk
      ON trk.content_id = tcrs.content_id
    INNER JOIN mvcms.tbl_content_status s
      ON s.content_id = tcrs.content_id
    INNER JOIN mvcms.tbl_package_content_map pcm
      ON trk.content_id = pcm.content_id
    INNER JOIN mvcms.tbl_contents album
      ON album.content_id = pcm.package_content_id
    INNER JOIN mvcms.tbl_content_details cd
      ON album.content_id = cd.content_id
    INNER JOIN mvcms.tbl_content_details cdt
      ON trk.content_id = cdt.content_id
    WHERE tcrs.rights_status IN ('LIVE','MANUAL')
      AND tcrs.retailer_id = $1
      AND cd.language_id = 'eng'
      AND cdt.language_id = 'eng'
      AND trk.content_type_id IN (21)
      AND s.locale_id = 'eng'
      AND s.status IN ('ACTIVE','INACTIVE')
      AND trk.vendor_id IN (13020,544,12515,1324,2526,2106,198,13118,13664,13424,12280,7694,24580,3526,24317,24013,12095,24909,7825,23833,13519,10251,12521,24172,13063,13794,7823,13795,12921,4,13095,3907,5026,10849,13522,1929,24143,24905,7956,7777,4666,24747,13706,23869,6928,13395,25008,24319,13725,12756,12897,6168,8278,24668,13568,24430,496,13388,13354,12994,8344,12495,1428,24161,24203,1476,12993,24596,1887,24647,7539,13716,7710,7933,4046,12977,8672,13166,13824,3546,7847,12395,13322,24693,1627,3506,24679,24829,13331,24454,13141,283,2199,24281,24967,25033,24714,10275,8670,10669,24199,13175,7629,13328,24054,13554,23986,12176,3866,9,10505,23925,24050,11797,24270,12635,13137,2168,7781,10349,2227,8253,546,11014,8761,13774,24748,13252,13536,12928,530,8752,8302,8277,13432,468,10501,6428,24708,13287,24873,24109,2670,13807,7682,8329,3172,13342,8389,13007,13423,1601,24440,24735,13629,13520,2306,24219,13385,4967,13098,24632,2469,343,8293,13339,300,13496,8673,23864,12736,24776,13695,6688,24588,11189,12019,13026,275,12969,24370,24856,502,10510,13262,7747,13644,7540,13566,12741,13346,24274,24360,9328,24414,1338,8336,13154,23972,24449,13456,24194,7732,13624,1639,13212,3666,24009,1509,24871,24476,24583,24850,13433,13298,23887,7410,13802,501,3206,5988,13102,1643,400,3906,7430,2669,5387,24606,1401,1589,24655,13791,24472,1369,24731,285,6068,394,24090,1592,13712,1594,13761,24471,6728,24532,24041,2697,3217,24890,5407,24085,10498,24764,24763,24307,7775,7695,24765,13148,24923,24078,13093,24011,3228,24240,8541,24697,13211,24353,11896,24904,1474,3926,13282,3846,23953,13069,5427,272,24892,23926,8369,19,13360,251,2549,24438,499,8629,1597,13684,1302,24192,23906,24906,7068,5908,13426,24993,24562,24908,23865,24704,5246,10254,24052)
    ORDER BY trk.content_id, album.content_id
  `;

  const pool = getMetaseaPool();
  const result = await pool.query(sql, [retailerId]);

  return dedupeTrackRows(
    (result.rows || []).map((row) => ({
      trackId: String(row.track_id || ''),
      albumId: String(row.album_id || ''),
      albumName: String(row.album_name || ''),
      upc: String(row.upc || ''),
    })),
  );
}

async function queryPartnerDbTrackRows(partner) {
  const partnerKey = String(partner || '').toLowerCase();
  if (!B2B_AUDIO_PARTNER_TABLES[partnerKey]) {
    const error = new Error(`Unsupported partner for Retailer DB export: ${partnerKey}`);
    error.statusCode = 400;
    throw error;
  }

  const detailOutput = await getAudioDetailsRows({
    partner: partnerKey,
    type: 'live',
    limit: 1000000,
  });
  const baseRows = Array.isArray(detailOutput.rows) ? detailOutput.rows : [];

  const rows = [];
  for (const row of baseRows || []) {
    const albumId = String(row.albumId || '').trim();
    const trackIds = String(row.trackIdsCsv || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^[0-9]+$/.test(item));
    if (!albumId || !trackIds.length) {
      continue;
    }
    for (const trackId of trackIds) {
      rows.push({
        trackId,
        albumId,
        albumName: String(row.albumName || ''),
        upc: String(row.upc || ''),
      });
    }
  }

  return dedupeTrackRows(rows);
}

async function writeExportArtifacts({ partner, source, rows, createdByUserId }) {
  ensureReportDirectories();
  const partnerLabel = getPartnerLabel(partner);
  const sourceLabel = SOURCE_LABELS[source] || sanitizeSegment(source);
  const stamp = dateTag();

  const fileName = `${partnerLabel}_${sourceLabel}_DDEX_Export_${stamp}.xlsx`;
  const jsonName = `${partnerLabel}_${sourceLabel}_DDEX_Export_${stamp}.json`;
  const filePath = path.join(GENERATED_DIR, sanitizeSegment(fileName));
  const jsonPath = path.join(JSON_DIR, sanitizeSegment(jsonName));

  const exportRows = rows.map((row) => ({
    'Track ID': row.trackId,
    'Album ID': row.albumId,
    'Album Name': row.albumName || '',
    UPC: row.upc || '',
  }));

  buildWorkbookFile(filePath, exportRows, ['Track ID', 'Album ID', 'Album Name', 'UPC']);
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');

  const reportId = await createReportRecord({
    fileName,
    filePath,
    jsonPath,
    partner: String(partner).toLowerCase(),
    partnerLabel,
    source,
    reportType: 'export',
    createdByUserId,
    trackCount: rows.length,
  });

  return { reportId, fileName, partnerLabel, trackCount: rows.length };
}

async function runExportJob(jobId, { partner, source, createdByUserId }) {
  try {
    await markReportJobRunning(jobId);

    let rows;
    if (source === 'metasea') {
      rows = await queryMetaseaTrackRows(partner);
    } else if (source === 'partnerdb') {
      rows = await queryPartnerDbTrackRows(partner);
    } else {
      const error = new Error('Unsupported source type.');
      error.statusCode = 400;
      throw error;
    }

    const output = await writeExportArtifacts({
      partner,
      source,
      rows,
      createdByUserId,
    });

    await markReportJobCompleted(jobId, output.reportId);
    await createNotification({
      recipientUserId: null,
      type: 'report_ready',
      message: `Report ready: ${output.fileName}`,
      payload: { jobId, reportId: output.reportId, partner, source, trackCount: output.trackCount },
    });

    logInfo('Report export job completed', {
      jobId,
      partner,
      source,
      reportId: output.reportId,
      trackCount: output.trackCount,
    });
  } catch (error) {
    await markReportJobFailed(jobId, error.message);
    await createNotification({
      recipientUserId: null,
      type: 'report_failed',
      message: `Report export failed for ${partner} (${source}). ${error.message}`,
      payload: { jobId, partner, source },
    });

    logError('Report export job failed', {
      jobId,
      partner,
      source,
      error: error.message,
    });
  }
}

export async function queueExportJob({ partner, source, createdByUserId }) {
  const partnerKey = String(partner || '').trim().toLowerCase();
  if (!SUPPORTED_AUDIO_PARTNERS.includes(partnerKey)) {
    const error = new Error('Please select a valid audio partner for export.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedSource = String(source || '').trim().toLowerCase();
  if (normalizedSource !== 'metasea' && normalizedSource !== 'partnerdb') {
    const error = new Error('source must be metasea or partnerdb.');
    error.statusCode = 400;
    throw error;
  }

  const jobId = await createReportJob({
    jobType: 'export',
    partner: partnerKey,
    source: normalizedSource,
    createdByUserId,
    payload: { partner: partnerKey, source: normalizedSource },
  });

  await createNotification({
    recipientUserId: null,
    type: 'report_started',
    message: `Report generation started for ${getPartnerLabel(partnerKey)} (${SOURCE_LABELS[normalizedSource] || normalizedSource}).`,
    payload: { jobId, partner: partnerKey, source: normalizedSource },
  });

  setImmediate(() => {
    runExportJob(jobId, {
      partner: partnerKey,
      source: normalizedSource,
      createdByUserId,
    });
  });

  return { jobId };
}

function buildDifferenceRows(metaseaRows, partnerDbRows) {
  const metaseaMap = new Map();
  const partnerMap = new Map();

  for (const row of metaseaRows || []) {
    metaseaMap.set(String(row.trackId), row);
  }
  for (const row of partnerDbRows || []) {
    partnerMap.set(String(row.trackId), row);
  }

  const differences = [];

  for (const [trackId, row] of metaseaMap.entries()) {
    if (!partnerMap.has(trackId)) {
      differences.push({
        trackId,
        albumId: String(row.albumId || ''),
        albumName: String(row.albumName || ''),
        upc: String(row.upc || ''),
        remarks: 'Present in Metasea but Missing in Retailer DB',
      });
    }
  }

  for (const [trackId, row] of partnerMap.entries()) {
    if (!metaseaMap.has(trackId)) {
      differences.push({
        trackId,
        albumId: String(row.albumId || ''),
        albumName: String(row.albumName || ''),
        upc: String(row.upc || ''),
        remarks: 'Present in Retailer DB but Missing in Metasea',
      });
    }
  }

  differences.sort((a, b) => a.trackId.localeCompare(b.trackId, 'en', { numeric: true }));
  return differences;
}

async function runDifferenceJob(jobId, { reportIdA, reportIdB, createdByUserId, partner }) {
  try {
    await markReportJobRunning(jobId);

    const reportA = await getReportById(reportIdA);
    const reportB = await getReportById(reportIdB);
    if (!reportA || !reportB) {
      throw new Error('Selected reports not found.');
    }

    const rowsA = JSON.parse(fs.readFileSync(reportA.json_path, 'utf8'));
    const rowsB = JSON.parse(fs.readFileSync(reportB.json_path, 'utf8'));

    const metaseaRows = reportA.source === 'metasea' ? rowsA : rowsB;
    const partnerRows = reportA.source === 'partnerdb' ? rowsA : rowsB;

    const diffRows = buildDifferenceRows(metaseaRows, partnerRows);

    ensureReportDirectories();
    const partnerLabel = getPartnerLabel(partner);
    const stamp = dateTag();
    const fileName = `Difference_${partnerLabel}_DDEX_Export_${stamp}.xlsx`;
    const jsonName = `Difference_${partnerLabel}_DDEX_Export_${stamp}.json`;
    const filePath = path.join(GENERATED_DIR, sanitizeSegment(fileName));
    const jsonPath = path.join(JSON_DIR, sanitizeSegment(jsonName));

    const exportRows = diffRows.map((row) => ({
      'Track ID': row.trackId,
      'Album ID': row.albumId,
      'Album Name': row.albumName,
      UPC: row.upc,
      Remarks: row.remarks,
    }));

    buildWorkbookFile(filePath, exportRows, ['Track ID', 'Album ID', 'Album Name', 'UPC', 'Remarks']);
    fs.writeFileSync(jsonPath, JSON.stringify(diffRows, null, 2), 'utf8');

    const reportId = await createReportRecord({
      fileName,
      filePath,
      jsonPath,
      partner,
      partnerLabel,
      source: 'difference',
      reportType: 'difference',
      createdByUserId,
      trackCount: diffRows.length,
    });

    await markReportJobCompleted(jobId, reportId);
    await createNotification({
      recipientUserId: null,
      type: 'report_ready',
      message: `Difference report ready: ${fileName}`,
      payload: { jobId, reportId, partner, source: 'difference' },
    });

    logInfo('Difference report job completed', {
      jobId,
      reportId,
      partner,
      trackCount: diffRows.length,
    });
  } catch (error) {
    await markReportJobFailed(jobId, error.message);
    await createNotification({
      recipientUserId: null,
      type: 'report_failed',
      message: `Difference report failed. ${error.message}`,
      payload: { jobId, partner },
    });
    logError('Difference report job failed', {
      jobId,
      error: error.message,
      partner,
    });
  }
}

export async function queueDifferenceJob({ reportIds, createdByUserId }) {
  const [rawA, rawB] = Array.isArray(reportIds) ? reportIds : [];
  const reportIdA = Number.parseInt(String(rawA), 10);
  const reportIdB = Number.parseInt(String(rawB), 10);

  if (!Number.isInteger(reportIdA) || !Number.isInteger(reportIdB)) {
    const error = new Error('Please select exactly two valid reports.');
    error.statusCode = 400;
    throw error;
  }

  const reportA = await getReportById(reportIdA);
  const reportB = await getReportById(reportIdB);

  if (!reportA || !reportB) {
    const error = new Error('One or more selected reports were not found.');
    error.statusCode = 404;
    throw error;
  }

  if (reportA.partner !== reportB.partner) {
    const error = new Error('Please select reports from the same partner.');
    error.statusCode = 400;
    throw error;
  }

  const sources = new Set([String(reportA.source), String(reportB.source)]);
  if (!(sources.has('metasea') && sources.has('partnerdb'))) {
    const error = new Error('Please select one Metasea and one Retailer DB report.');
    error.statusCode = 400;
    throw error;
  }

  const partner = reportA.partner;

  const jobId = await createReportJob({
    jobType: 'difference',
    partner,
    source: 'difference',
    createdByUserId,
    payload: { reportIds: [reportIdA, reportIdB] },
  });

  await createNotification({
    recipientUserId: null,
    type: 'report_started',
    message: `Difference report generation started for ${getPartnerLabel(partner)}.`,
    payload: { jobId, partner, source: 'difference' },
  });

  setImmediate(() => {
    runDifferenceJob(jobId, {
      reportIdA,
      reportIdB,
      createdByUserId,
      partner,
    });
  });

  return { jobId };
}

export async function getReportsList({ days = 7 }) {
  return listRecentReports({ days });
}

export async function getJobsList({ limit = 50 }) {
  return listRecentJobs({ limit });
}

export async function deleteReportAndFiles({ reportId }) {
  const report = await getReportById(reportId);
  if (!report) {
    const error = new Error('Report not found.');
    error.statusCode = 404;
    throw error;
  }

  const fileTargets = [report.file_path, report.json_path]
    .filter(Boolean)
    .map((target) => path.resolve(target));

  for (const target of fileTargets) {
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (error) {
      logError('Failed deleting report file', { reportId, target, error: error.message });
    }
  }

  await removeReportById(reportId);
  return { ok: true, reportId };
}
