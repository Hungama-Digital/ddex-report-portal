import { createClient } from "redis";
import { REDIS_CACHE } from "./config.js";
import { logDebug, logError, logInfo } from "./logger.js";

let redisClient = null;
let redisReadyPromise = null;
let redisRetryAfterMs = 0;
const localFallbackByNamespace = new Map();

function getLocalNamespaceStore(namespace) {
  if (!localFallbackByNamespace.has(namespace)) {
    localFallbackByNamespace.set(namespace, new Map());
  }
  return localFallbackByNamespace.get(namespace);
}

function readLocalFallback(namespace, cacheKey, ttlMs) {
  if (ttlMs <= 0) {
    return null;
  }
  const store = getLocalNamespaceStore(namespace);
  const cached = store.get(cacheKey);
  if (!cached) {
    return null;
  }
  const ageMs = Date.now() - cached.cachedAt;
  if (ageMs > ttlMs) {
    store.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function writeLocalFallback(namespace, cacheKey, value, ttlMs) {
  if (ttlMs <= 0) {
    return;
  }
  const store = getLocalNamespaceStore(namespace);
  store.set(cacheKey, {
    cachedAt: Date.now(),
    value,
  });
}

function buildRedisUrl() {
  if (REDIS_CACHE.url) {
    return REDIS_CACHE.url;
  }
  const passwordPart = REDIS_CACHE.password
    ? `:${encodeURIComponent(REDIS_CACHE.password)}@`
    : "";
  const dbPath = Number.isInteger(REDIS_CACHE.db) ? `/${REDIS_CACHE.db}` : "";
  return `redis://${passwordPart}${REDIS_CACHE.host}:${REDIS_CACHE.port}${dbPath}`;
}

function buildRedisKey(namespace, cacheKey) {
  return `${REDIS_CACHE.keyPrefix}:${namespace}:${cacheKey}`;
}

async function getRedisClient() {
  if (!REDIS_CACHE.enabled) {
    return null;
  }

  if (Date.now() < redisRetryAfterMs) {
    return null;
  }

  if (redisClient?.isReady) {
    return redisClient;
  }

  if (redisReadyPromise) {
    return redisReadyPromise;
  }

  const url = buildRedisUrl();
  redisClient = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries >= 3) {
          return false; // stop retrying after 3 attempts
        }
        return Math.min(retries * 500, 2000);
      },
    },
  });
  let redisErrorLogged = false;
  redisClient.on("error", (error) => {
    if (!redisErrorLogged) {
      logError("Redis cache client error", { error: error?.message });
      redisErrorLogged = true;
    }
  });

  redisReadyPromise = redisClient
    .connect()
    .then(() => {
      logInfo("Redis cache connected", {
        host: REDIS_CACHE.host,
        port: REDIS_CACHE.port,
        db: REDIS_CACHE.db,
      });
      return redisClient;
    })
    .catch((error) => {
      logError("Redis cache connection failed, using in-memory fallback", {
        error: error?.message,
      });
      redisRetryAfterMs = Date.now() + 60_000;
      try {
        redisClient?.destroy();
      } catch (_error) {
        // no-op
      }
      redisClient = null;
      return null;
    })
    .finally(() => {
      redisReadyPromise = null;
    });

  return redisReadyPromise;
}

export async function readBackendCache({ namespace, cacheKey, ttlMs }) {
  if (ttlMs <= 0) {
    return null;
  }

  const client = await getRedisClient();
  if (!client) {
    return readLocalFallback(namespace, cacheKey, ttlMs);
  }

  const redisKey = buildRedisKey(namespace, cacheKey);
  try {
    const raw = await client.get(redisKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    logError("Redis cache read failed, falling back to in-memory cache", {
      namespace,
      cacheKey,
      error: error?.message,
    });
    return readLocalFallback(namespace, cacheKey, ttlMs);
  }
}

export async function writeBackendCache({ namespace, cacheKey, value, ttlMs }) {
  if (ttlMs <= 0) {
    return;
  }

  const client = await getRedisClient();
  if (!client) {
    writeLocalFallback(namespace, cacheKey, value, ttlMs);
    return;
  }

  const redisKey = buildRedisKey(namespace, cacheKey);
  try {
    await client.set(redisKey, JSON.stringify(value), { PX: ttlMs });
  } catch (error) {
    logError("Redis cache write failed, using in-memory fallback", {
      namespace,
      cacheKey,
      error: error?.message,
    });
    writeLocalFallback(namespace, cacheKey, value, ttlMs);
  }
}

export async function checkRedisCacheConnection() {
  const client = await getRedisClient();
  if (!REDIS_CACHE.enabled) {
    return false;
  }
  if (!client) {
    return false;
  }
  const pong = await client.ping();
  return pong === "PONG";
}

export async function closeRedisCache() {
  if (!redisClient) {
    return;
  }

  try {
    if (redisClient.isOpen) {
      await redisClient.close();
    }
  } catch (error) {
    logDebug("Redis cache close failed", {
      error: error?.message,
    });
    try {
      redisClient.destroy();
    } catch (_destroyError) {
      // no-op
    }
  } finally {
    redisClient = null;
  }
}
