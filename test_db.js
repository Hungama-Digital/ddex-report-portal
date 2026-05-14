import "dotenv/config";
import { checkB2BConnection, checkMetaseaConnection } from "./server/db.js";

async function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function test() {
  console.log("Testing Metasea connection (30s timeout)...");
  try {
    const metasea = await withTimeout(checkMetaseaConnection(), 30000, "Metasea");
    console.log("Metasea connection status:", metasea);
  } catch (err) {
    console.error("Metasea connection failed:", err.message);
  }

  console.log("\nTesting B2B connection (30s timeout)...");
  try {
    const b2b = await withTimeout(checkB2BConnection(), 30000, "B2B");
    console.log("B2B connection status:", b2b);
  } catch (err) {
    console.error("B2B connection failed:", err.message);
  }

  process.exit(0);
}

test();
