import { Pool as PostgresPool } from "pg";
import mysql from "mysql2/promise";
import { B2B_DB, METASEA_DB } from "./config.js";
import { logDebug, sanitizeDbConfig } from "./logger.js";

let metaseaPool;
let b2bPool;

export function getMetaseaPool() {
  if (!metaseaPool) {
    logDebug("Creating Metasea Postgres pool", sanitizeDbConfig(METASEA_DB));
    metaseaPool = new PostgresPool({
      host: METASEA_DB.host,
      port: METASEA_DB.port,
      database: METASEA_DB.database,
      user: METASEA_DB.user,
      password: METASEA_DB.password,
      ssl: METASEA_DB.sslEnabled
        ? { rejectUnauthorized: METASEA_DB.sslRejectUnauthorized }
        : false,
    });
  }

  return metaseaPool;
}

export function getB2BPool() {
  if (!b2bPool) {
    logDebug("Creating B2B MySQL pool", sanitizeDbConfig(B2B_DB));
    b2bPool = mysql.createPool({
      host: B2B_DB.host,
      port: B2B_DB.port,
      database: B2B_DB.database,
      user: B2B_DB.user,
      password: B2B_DB.password,
      waitForConnections: true,
      connectionLimit: B2B_DB.connectionLimit,
      queueLimit: 0,
    });
  }

  return b2bPool;
}

export async function checkMetaseaConnection() {
  const pool = getMetaseaPool();
  const result = await pool.query("SELECT 1 AS ok");
  return Boolean(result?.rows?.[0]?.ok);
}

export async function checkB2BConnection() {
  const pool = getB2BPool();
  const [rows] = await pool.query("SELECT 1 AS ok");
  return Boolean(rows?.[0]?.ok);
}

export async function closePools() {
  await Promise.allSettled([
    metaseaPool ? metaseaPool.end() : Promise.resolve(),
    b2bPool ? b2bPool.end() : Promise.resolve(),
  ]);
}
