import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

let pool: Pool | null = null;
let db: any = null;

if (databaseUrl) {
  const globalForDb = globalThis as typeof globalThis & {
    __arenaNextJsPostgresqlPool?: Pool;
  };

  pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }

  try {
    db = drizzle(pool);
  } catch (err) {
    console.error("[AI Studio] Drizzle initialization failed:", err);
  }
}

if (!db) {
  console.warn("[AI Studio] DATABASE_URL is not set or DB initialization failed. Using in-memory mock proxy.");
  
  const makeNoOpProxy = (): any => {
    const fn = () => fnProxy;
    const fnProxy = new Proxy(fn, {
      get: (target, prop) => {
        if (prop === "then") {
          return (resolve: any) => resolve([]);
        }
        if (prop === "catch") {
          return (reject: any) => Promise.resolve();
        }
        if (prop === "query") {
          return new Proxy({}, {
            get: () => ({
              findMany: () => Promise.resolve([]),
              findFirst: () => Promise.resolve(null),
              findUnique: () => Promise.resolve(null),
            }),
          });
        }
        if (prop === "transaction") {
          return (cb: any) => cb(fnProxy);
        }
        return fnProxy;
      }
    });
    return fnProxy;
  };
  
  db = makeNoOpProxy();
}

export { pool, db };
