import { API_DEBUG } from "./config.js";

const IST_TIMEZONE = "Asia/Kolkata";

function formatIstTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+05:30`;
}

function formatMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const cleanedEntries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined,
  );
  if (!cleanedEntries.length) {
    return "";
  }

  return ` ${JSON.stringify(Object.fromEntries(cleanedEntries))}`;
}

function log(level, message, metadata) {
  const timestamp = formatIstTimestamp();
  const line = `[${timestamp}] [${level}] ${message}${formatMetadata(metadata)}`;
  if (level === "ERROR") {
    console.error(line);
    return;
  }
  console.log(line);
}

export function logInfo(message, metadata) {
  log("INFO", message, metadata);
}

export function logError(message, metadata) {
  log("ERROR", message, metadata);
}

export function logDebug(message, metadata) {
  if (!API_DEBUG) {
    return;
  }
  log("DEBUG", message, metadata);
}

export function sanitizeDbConfig(dbConfig) {
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database || "(empty)",
    user: dbConfig.user || "(empty)",
  };
}
