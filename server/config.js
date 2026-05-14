const TABLE_IDENTIFIER_REGEX = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?$/;

const DEFAULT_METASEA_RETAILER_IDS = {
  amazon: 3044,
  bytedance: 3632,
  facebook: 13640,
  jiosaavn: 3564,
  spotify: 3634,
  virgin: 13676,
};

const DEFAULT_B2B_AUDIO_PARTNER_TABLES = {
  amazon: {
    contents: "AMAZON_DDEX_BATCH_WISE_CONTENTS",
    push: "AMAZON_DDEX_BATCH_PUSH",
  },
  bytedance: {
    contents: "BYTEDANCE_DDEX_BATCH_WISE_CONTENTS",
    push: "BYTEDANCE_DDEX_BATCH_PUSH",
  },
  facebook: {
    contents: "FACEBOOK_DDEX_BATCH_WISE_CONTENTS",
    push: "FACEBOOK_DDEX_BATCH_PUSH",
  },
  jiosaavn: {
    contents: "JIOSAAVN_DDEX_BATCH_WISE_CONTENTS",
    push: "JIOSAAVN_DDEX_BATCH_PUSH",
  },
  spotify: {
    contents: "SPOTIFY_DDEX_BATCH_WISE_CONTENTS",
    push: "SPOTIFY_DDEX_BATCH_PUSH",
  },
  virgin: {
    contents: "VIRGIN_DDEX_BATCH_WISE_CONTENTS",
    push: "VIRGIN_DDEX_BATCH_PUSH",
  },
};

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function parseJsonObjectEnv(envName, fallback) {
  const value = process.env[envName];
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${envName} must be a JSON object.`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON for ${envName}: ${error.message}`, {
      cause: error,
    });
  }
}

function normalizeRetailerIdMap(inputMap) {
  const normalized = {};

  for (const [partnerKey, retailerValue] of Object.entries(inputMap)) {
    const retailerId = parseInteger(retailerValue, NaN);
    if (!Number.isInteger(retailerId) || retailerId <= 0) {
      throw new Error(
        `Invalid retailer_id for partner "${partnerKey}". Expected a positive integer.`,
      );
    }
    normalized[partnerKey.toLowerCase()] = retailerId;
  }

  return normalized;
}

function normalizeAudioPartnerTables(inputMap) {
  const normalized = {};

  for (const [partnerKey, value] of Object.entries(inputMap)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(
        `Invalid table config for partner "${partnerKey}". Expected an object.`,
      );
    }

    const contents = value.contents ?? value.contentsTable;
    const push = value.push ?? value.pushTable;

    if (!contents || !push) {
      throw new Error(
        `Missing contents/push table names for partner "${partnerKey}".`,
      );
    }

    if (
      !TABLE_IDENTIFIER_REGEX.test(contents) ||
      !TABLE_IDENTIFIER_REGEX.test(push)
    ) {
      throw new Error(
        `Invalid table name(s) for partner "${partnerKey}". Use only letters, numbers, underscore, and optional single dot for schema.`,
      );
    }

    normalized[partnerKey.toLowerCase()] = { contents, push };
  }

  return normalized;
}

const retailerIdOverrides = parseJsonObjectEnv(
  "METASEA_AUDIO_PARTNER_RETAILER_IDS",
  {},
);

if (process.env.METASEA_AMAZON_RETAILER_ID) {
  retailerIdOverrides.amazon = process.env.METASEA_AMAZON_RETAILER_ID;
}

const b2bTableOverrides = parseJsonObjectEnv("B2B_AUDIO_PARTNER_TABLES", {});
if (process.env.B2B_AMAZON_CONTENTS_TABLE) {
  b2bTableOverrides.amazon = {
    ...(b2bTableOverrides.amazon || {}),
    contents: process.env.B2B_AMAZON_CONTENTS_TABLE,
  };
}
if (process.env.B2B_AMAZON_PUSH_TABLE) {
  b2bTableOverrides.amazon = {
    ...(b2bTableOverrides.amazon || {}),
    push: process.env.B2B_AMAZON_PUSH_TABLE,
  };
}

export const API_PORT = parseInteger(
  process.env.API_PORT ?? process.env.PORT,
  3001,
);

export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://127.0.0.1:5173";
export const API_DEBUG = parseBoolean(process.env.API_DEBUG, false);
export const TOTAL_CONTENT_LIVE_CACHE_TTL_MS = parseInteger(
  process.env.TOTAL_CONTENT_LIVE_CACHE_TTL_MS,
  1800000,
);

export const REDIS_CACHE = {
  enabled: parseBoolean(process.env.REDIS_ENABLED, true),
  url: process.env.REDIS_URL || "",
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInteger(process.env.REDIS_PORT, 6379),
  password: process.env.REDIS_PASSWORD || "",
  db: parseInteger(process.env.REDIS_DB, 0),
  keyPrefix: process.env.REDIS_KEY_PREFIX || "ddex-report-portal",
};

export const METASEA_DB = {
  host: process.env.METASEA_DB_HOST || "127.0.0.1",
  port: parseInteger(process.env.METASEA_DB_PORT, 5432),
  database: process.env.METASEA_DB_NAME || "",
  user: process.env.METASEA_DB_USER || "",
  password: process.env.METASEA_DB_PASSWORD || "",
  sslEnabled: parseBoolean(process.env.METASEA_DB_SSL, false),
  sslRejectUnauthorized: parseBoolean(
    process.env.METASEA_DB_SSL_REJECT_UNAUTHORIZED,
    false,
  ),
};

export const B2B_DB = {
  host: process.env.B2B_DB_HOST || "127.0.0.1",
  port: parseInteger(process.env.B2B_DB_PORT, 3306),
  database: process.env.B2B_DB_NAME || "",
  user: process.env.B2B_DB_USER || "",
  password: process.env.B2B_DB_PASSWORD || "",
  connectionLimit: parseInteger(process.env.B2B_DB_CONNECTION_LIMIT, 10),
};

export const METASEA_AUDIO_PARTNER_RETAILER_IDS = normalizeRetailerIdMap({
  ...DEFAULT_METASEA_RETAILER_IDS,
  ...retailerIdOverrides,
});

export const B2B_AUDIO_PARTNER_TABLES = normalizeAudioPartnerTables({
  ...DEFAULT_B2B_AUDIO_PARTNER_TABLES,
  ...b2bTableOverrides,
});

export const SUPPORTED_AUDIO_PARTNERS = Object.keys(
  METASEA_AUDIO_PARTNER_RETAILER_IDS,
).filter((partnerKey) => Boolean(B2B_AUDIO_PARTNER_TABLES[partnerKey]));
