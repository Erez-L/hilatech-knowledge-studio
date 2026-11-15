/**
 * Production readiness check. Reads the environment the app would run with and
 * inspects the database and Redis it points at.
 *
 *   pnpm check:readiness            (exit code 1 if anything FAILS)
 *
 * It makes NO call to an AI provider, S3 or a mail server, so it costs nothing
 * and proves nothing about them: those are verified with `pnpm test:live`
 * (docs/REAL_PROVIDER_VERIFICATION.md). It never prints a secret.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { createRedis } from "../packages/core/src/index.ts";
import { parseConfig } from "../packages/shared/src/index.ts";

type Level = "PASS" | "WARN" | "FAIL";
const results: { level: Level; name: string; detail: string }[] = [];
const report = (level: Level, name: string, detail = "") => {
  results.push({ level, name, detail });
  console.log(`${level}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const expect = (ok: boolean, name: string, detail = "", otherwise: Level = "FAIL") => report(ok ? "PASS" : otherwise, name, ok ? "" : detail);

let config: ReturnType<typeof parseConfig>;
try {
  config = parseConfig(process.env);
  report("PASS", "configuration parses and passes its own rules");
} catch (error) {
  report("FAIL", "configuration parses and passes its own rules", error instanceof Error ? error.message.slice(0, 400) : "invalid");
  process.exit(1);
}

/* ---- configuration ---- */
expect(config.APP_ENV === "production", "APP_ENV is production", `it is "${config.APP_ENV}"`);
expect(config.APP_BASE_URL.startsWith("https://"), "APP_BASE_URL uses https", "session and demo cookies are only marked Secure over https");
expect(Boolean(config.AUTH_SECRET) && new Set(config.AUTH_SECRET).size >= 16 && !/example|change|secret|test/i.test(config.AUTH_SECRET ?? ""), "AUTH_SECRET is set and does not look like a placeholder", "generate one: openssl rand -base64 48");
expect(config.pipelineMode === "live", "AI providers are real (no test doubles)", `pipeline mode is "${config.pipelineMode}"`);
expect(!config.SAMPLE_MODE, "SAMPLE_MODE is off");
expect(config.STORAGE_DRIVER === "s3" && Boolean(config.S3_BUCKET), "documents are stored in S3 (private bucket)", "local disk storage does not survive a redeploy and is not shared between instances");
expect(config.MAIL_TRANSPORT === "smtp", "email is sent through SMTP", `MAIL_TRANSPORT is "${config.MAIL_TRANSPORT}": verification and reset emails would not reach anyone`);
expect(config.AUTH_REQUIRE_EMAIL_VERIFICATION, "email verification is required");
expect(config.TRUSTED_PROXY_HOPS >= 1, "TRUSTED_PROXY_HOPS matches the load balancer", "with 0, every visitor behind the proxy shares one rate-limit bucket", "WARN");
expect(Boolean(config.DATABASE_URL && config.REDIS_URL), "DATABASE_URL and REDIS_URL are set");
expect(Boolean(config.DATABASE_URL) && config.DATABASE_URL !== process.env.DATABASE_MIGRATION_URL, "the app does not connect with the migration (owner) credentials");
report(config.AUTH_SIGNUP_ENABLED ? "WARN" : "PASS", "public sign-up", config.AUTH_SIGNUP_ENABLED ? "anyone can create an account and upload; confirm that this is intended" : "");
if (config.DEMO_ENABLED) {
  report("PASS", "public demo limits", `${config.LIMIT_DEMO_QUESTIONS_PER_MINUTE}/minute per address, ${config.LIMIT_DEMO_QUESTIONS_PER_SESSION}/session, ${config.LIMIT_DEMO_QUESTIONS_PER_DAY}/day in total (the daily number bounds what the demo can spend)`);
}

/* ---- database ---- */
if (config.DATABASE_URL) {
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  try {
    await client.connect();
    const one = async <T extends pg.QueryResultRow>(text: string, values: unknown[] = []) => (await client.query<T>(text, values)).rows;

    const [role] = await one<{ rolsuper: boolean; rolbypassrls: boolean; name: string }>("select rolsuper, rolbypassrls, rolname as name from pg_roles where rolname = current_user");
    expect(!role!.rolsuper && !role!.rolbypassrls, "the app's database role cannot bypass row-level security", `role "${role!.name}" is a superuser or has BYPASSRLS`);
    const owned = await one("select 1 from pg_tables where schemaname = 'public' and tableowner = current_user limit 1");
    expect(owned.length === 0, "the app's database role does not own the tables", "a table owner is exempt from row-level security unless it is forced");

    const files = (await readdir(path.resolve(import.meta.dirname, "../packages/database/migrations"))).filter((f) => f.endsWith(".sql")).sort();
    // The app role is deliberately not allowed to read the migration record; use the migration credentials when present.
    const migrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!migrationUrl) report("WARN", "all migrations are applied", "not checked: set DATABASE_MIGRATION_URL for this check, or run pnpm db:migrate (it only applies what is missing)");
    else {
      const owner = new pg.Client({ connectionString: migrationUrl });
      try {
        await owner.connect();
        const applied = new Set((await owner.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
        const missing = files.filter((f) => !applied.has(f));
        expect(missing.length === 0, "all migrations are applied", `missing: ${missing.join(", ")}`);
      } catch (error) {
        report("FAIL", "all migrations are applied", (error as Error).message.slice(0, 200));
      } finally {
        await owner.end().catch(() => {});
      }
    }

    expect((await one("select 1 from pg_extension where extname = 'vector'")).length === 1, "pgvector is installed");
    const unprotected = await one<{ table_name: string }>(
      `select c.table_name from information_schema.columns c join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace
       where c.table_schema = 'public' and c.column_name = 'organization_id' and k.relkind = 'r' and not k.relrowsecurity
         and c.table_name <> 'memberships'`, // by design: a user's memberships are looked up before a tenant is chosen (docs/DATABASE_SCHEMA.md),
    );
    expect(unprotected.length === 0, "every tenant table has row-level security enabled", unprotected.map((r) => r.table_name).join(", "));

    const active = await one<{ kind: string; provider: string; model_id: string; dimensions: number }>("select kind, provider, model_id, dimensions from embedding_indexes where status = 'active'");
    const liveIndex = active.find((i) => i.kind === "live");
    if (!liveIndex) report("WARN", "a live embedding index exists", "none yet: it is created by the first ingestion with the real embeddings model");
    else expect(liveIndex.dimensions === 1024 && liveIndex.model_id === config.EMBEDDINGS_MODEL_ID, "the active live index matches the configured embeddings model", `index is ${liveIndex.provider}/${liveIndex.model_id} (${liveIndex.dimensions}), configured ${config.EMBEDDINGS_MODEL_ID}`);
    const doubles = active.find((i) => i.kind === "test_double");
    report(doubles ? "WARN" : "PASS", "no test-double embedding index in this database", doubles ? "one exists; it is never searched in live mode, but a production database should not contain it" : "");

    if (config.DEMO_ENABLED) {
      // Organizations are not tenant-scoped rows; documents are, so count them as the demo tenant.
      const [demo] = await one<{ id: string }>("select id from organizations where kind = 'demo'");
      if (!demo) report("WARN", "the public demo is seeded", "DEMO_ENABLED is true but there is no demo organization: /demo shows the scripted preview. Run pnpm demo:seed, or set DEMO_ENABLED=false");
      else {
        await client.query("begin");
        await client.query("select set_config('app.organization_id', $1, true)", [demo.id]);
        const [counts] = await one<{ ready: number; members: number }>(
          "select (select count(*)::int from documents where status = 'ready') as ready, (select count(*)::int from memberships where organization_id = $1) as members", [demo.id]);
        await client.query("commit");
        expect(counts!.ready > 0, "the public demo has indexed documents", "run pnpm demo:seed");
        expect(counts!.members === 0, "the demo organization has no members", `${counts!.members} membership(s): members could upload to or delete from the public demo`);
      }
    }
  } catch (error) {
    report("FAIL", "database is reachable with the app's credentials", (error as Error).message.slice(0, 200));
  } finally {
    await client.end().catch(() => {});
  }
}

/* ---- Redis ---- */
if (config.REDIS_URL) {
  const redis = createRedis(config.REDIS_URL);
  redis.on("error", () => {});
  try {
    expect((await redis.ping()) === "PONG", "Redis is reachable");
    const policy = (await redis.config("GET", "maxmemory-policy").catch(() => [])) as string[];
    if (policy[1]) expect(policy[1] === "noeviction", "Redis does not evict keys (required by the job queue)", `maxmemory-policy is "${policy[1]}"`, "WARN");
  } catch (error) {
    report("FAIL", "Redis is reachable", (error as Error).message.slice(0, 200));
  } finally {
    redis.disconnect();
  }
}

const count = (level: Level) => results.filter((r) => r.level === level).length;
console.log(`\n${count("PASS")} passed, ${count("WARN")} warnings, ${count("FAIL")} failed.`);
console.log("Not covered here: provider access, model output, S3 permissions and mail delivery. See docs/REAL_PROVIDER_VERIFICATION.md.");
process.exit(count("FAIL") ? 1 : 0);
