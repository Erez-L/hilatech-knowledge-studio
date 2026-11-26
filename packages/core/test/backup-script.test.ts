import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * infrastructure/deploy/backup-db.sh, run for real with stand-ins for `docker` and `aws` on the
 * PATH. It lives here because this is where the service-free tests are collected; it touches no
 * database, no Docker and no AWS account.
 */
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../infrastructure/deploy/backup-db.sh");

const bashWorks = (() => {
  try {
    return execFileSync("bash", ["-c", "echo ok"], { encoding: "utf8" }).trim() === "ok";
  } catch {
    return false;
  }
})();

const DOCKER_STUB = `#!/usr/bin/env bash
# Stand-in for docker: answers the two commands the backup script runs inside ks-postgres.
echo "docker $*" >> "$STUB_LOG"
case "$*" in
  *pg_dump*) [ "\${STUB_DUMP:-ok}" = fail ] && exit 1; [ "\${STUB_DUMP:-ok}" = empty ] && exit 0; printf 'PGDMP stand-in dump\\n'; exit 0 ;;
  *pg_restore*) grep -q '^PGDMP' && [ "\${STUB_LIST:-ok}" = ok ] && exit 0; exit 1 ;;
esac
exit 1
`;
const AWS_STUB = `#!/usr/bin/env bash
echo "aws $*" >> "$STUB_LOG"
[ "\${STUB_AWS:-ok}" = ok ] || exit 1
`;

describe.skipIf(!bashWorks)("backup-db.sh", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

  /** A copy of the script in an empty "server directory", with the stand-ins first on the PATH. */
  const setup = (envFile = "BACKUP_S3_URI=s3://example-backups/db-backups/\n") => {
    const root = mkdtempSync(path.join(os.tmpdir(), "hks-backup-"));
    roots.push(root);
    const bin = path.join(root, "bin");
    const home = path.join(root, "opt");
    mkdirSync(bin);
    mkdirSync(home);
    // The script is checked out with CRLF on Windows; bash needs LF.
    writeFileSync(path.join(home, "backup-db.sh"), readFileSync(script, "utf8").replace(/\r\n/g, "\n"));
    writeFileSync(path.join(bin, "docker"), DOCKER_STUB);
    writeFileSync(path.join(bin, "aws"), AWS_STUB);
    for (const file of [path.join(bin, "docker"), path.join(bin, "aws"), path.join(home, "backup-db.sh")]) chmodSync(file, 0o755);
    writeFileSync(path.join(home, ".env"), envFile);
    writeFileSync(path.join(home, "docker-compose.prod.yml"), "services: {}\n");
    const log = path.join(root, "calls.log");
    const run = (args: string[] = [], env: Record<string, string> = {}) => {
      const result = spawnSync("bash", [path.join(home, "backup-db.sh"), ...args], {
        encoding: "utf8",
        env: { ...process.env, BACKUP_S3_URI: "", BACKUP_LOCAL_DIR: "", BACKUP_KEEP_LOCAL: "", ...env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, STUB_LOG: log },
      });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    };
    const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
    const dumps = () => (existsSync(path.join(home, "backups")) ? readdirSync(path.join(home, "backups")).sort() : []);
    return { home, run, calls, dumps };
  };

  it("dumps the database, checks the dump, and copies it to the configured S3 prefix", () => {
    const { run, calls, dumps } = setup();
    const result = run();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const [name] = dumps();
    expect(name).toMatch(/^hks-\d{8}T\d{6}Z\.dump$/);
    expect(result.stdout.trim()).toBe(`BACKUP OK ${name} 20 bytes -> s3://example-backups/db-backups/${name}`);
    const log = calls();
    expect(log[0]).toContain("exec -T ks-postgres pg_dump -U postgres -d hks --format=custom");
    expect(log[1]).toContain("exec -T ks-postgres pg_restore --list");
    expect(log[2]).toMatch(new RegExp(`^aws s3 cp --only-show-errors --sse AES256 \\S*backups/${name} s3://example-backups/db-backups/${name}$`));
    expect(log).toHaveLength(3);
  });

  it("copies nothing when the dump fails, is empty, or cannot be read back", () => {
    const failures: Record<string, string>[] = [{ STUB_DUMP: "fail" }, { STUB_DUMP: "empty" }, { STUB_LIST: "fail" }];
    for (const env of failures) {
      const { run, calls, dumps } = setup();
      const result = run([], env);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^BACKUP FAILED: /);
      expect(result.stdout).toBe("");
      expect(calls().some((line) => line.startsWith("aws "))).toBe(false);
      expect(dumps()).toEqual([]); // no partial file is left behind
    }
  });

  it("fails loudly when the copy to S3 fails, and keeps the local dump", () => {
    const { run, dumps } = setup();
    const result = run([], { STUB_AWS: "fail" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BACKUP FAILED: the copy to s3://example-backups/db-backups did not finish");
    expect(dumps()).toHaveLength(1);
  });

  it("refuses to run without a valid target, before touching the database", () => {
    for (const envFile of ["", "BACKUP_S3_URI=/var/backups\n"]) {
      const { run, calls } = setup(envFile);
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/BACKUP FAILED: BACKUP_S3_URI/);
      expect(calls()).toEqual([]);
    }
    const { run, calls } = setup();
    expect(run(["--everything"]).status).toBe(1);
    expect(calls()).toEqual([]);
  });

  it("makes a local dump only with --local-only, and needs no target for it", () => {
    const { run, calls, dumps } = setup("");
    const result = run(["--local-only"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("local only, not copied to S3");
    expect(dumps()).toHaveLength(1);
    expect(calls().some((line) => line.startsWith("aws "))).toBe(false);
  });

  it("keeps only the newest local dumps", () => {
    const { home, run, dumps } = setup();
    mkdirSync(path.join(home, "backups"));
    ["20200101T000000Z", "20200102T000000Z", "20200103T000000Z"].forEach((stamp, i) => {
      const file = path.join(home, "backups", `hks-${stamp}.dump`);
      writeFileSync(file, "PGDMP old");
      const when = new Date(Date.UTC(2020, 0, i + 1));
      utimesSync(file, when, when);
    });
    writeFileSync(path.join(home, "backups", "notes.txt"), "not a dump");
    expect(run([], { BACKUP_KEEP_LOCAL: "2" }).status).toBe(0);
    const left = dumps();
    expect(left).toHaveLength(3); // the new dump, the newest old one, and the unrelated file
    expect(left).toContain("hks-20200103T000000Z.dump");
    expect(left).toContain("notes.txt");
    expect(left).not.toContain("hks-20200101T000000Z.dump");
    expect(run([], { BACKUP_KEEP_LOCAL: "many" }).status).toBe(1);
  });
});
