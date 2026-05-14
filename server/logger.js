import { API_DEBUG } from "./config.js";

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
  const timestamp = new Date().toISOString();
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
