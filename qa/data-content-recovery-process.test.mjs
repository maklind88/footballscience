import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postgresRunner } from "../scripts/lib/data-content-recovery-process.mjs";

async function probe(script, action) {
  const root = mkdtempSync(join(tmpdir(), "synthetic-pg-process-"));
  try {
    if (script !== null) writeFileSync(join(root, "psql"), `#!/bin/sh\n${script}\n`, { mode: 0o700 });
    await action(postgresRunner(root, root));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("failed commands expose only classification, never SQL or stderr", async () => {
  await probe('echo "SECRET_SQL_VALUE" >&2; exit 3', async pg => {
    await assert.rejects(pg.run("psql", []), error => {
      assert.equal(error.message, "postgres-command-failed:psql:exit:code=3:signal=none");
      assert.ok(!String(error.stack).includes("SECRET_SQL_VALUE")); return true;
    });
  });
});
test("missing executable is distinguished from a database failure", async () => {
  await probe(null, pg => assert.rejects(pg.run("psql", []), /postgres-command-failed:psql:spawn:.*io=ENOENT/));
});
test("exceeded output budget remains a hard failure", async () => {
  await probe('printf "12345678"', pg => assert.rejects(pg.run("psql", [], { maxBytes: 4 }), /:output-limit:/));
});
test("timeout remains a hard failure", async () => {
  await probe('exec sleep 5', pg => assert.rejects(pg.run("psql", [], { timeout: 30 }), /:timeout:/));
});
test("quick version command has no database dependency", async () => {
  await probe('printf "psql (PostgreSQL) 17.synthetic\\n"', async pg => {
    for (let attempt = 0; attempt < 100; attempt++) assert.match(await pg.run("psql", ["--version"]), /17.synthetic/);
  });
});

test("SQL input is still delivered in full", async () => {
  await probe('cat', async pg => assert.equal(await pg.sql({}, "synthetic query"), "synthetic query"));
});
test("a closed input pipe cannot acknowledge undelivered SQL", async () => {
  await probe('exit 0', pg => assert.rejects(pg.sql({}, "x".repeat(2 * 1024 * 1024)), /:stdin:.*io=(EPIPE|ECONNRESET|ENOTCONN)/));
});
