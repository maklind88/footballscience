import assert from "node:assert/strict";
import test from "node:test";
import { SessionAuthority } from "../candidates/shared/session-authority.mjs";

test("concurrent consumers share one refresh operation", async () => {
  let refreshCalls = 0;
  const authority = new SessionAuthority({
    now: () => 10_000,
    refresh: async ({ refreshToken }) => {
      refreshCalls += 1;
      assert.equal(refreshToken, "refresh-1");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { accessToken: "access-2", refreshToken: "refresh-2", expiresAt: 100_000 };
    },
  });
  authority.replaceSession({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: 10_001 });
  const tokens = await Promise.all(Array.from({ length: 12 }, () => authority.getAccessToken()));
  assert.equal(refreshCalls, 1);
  assert.deepEqual(new Set(tokens), new Set(["access-2"]));
});

test("consumer snapshot never contains the refresh token", () => {
  const authority = new SessionAuthority({ refresh: async () => null });
  authority.replaceSession({ accessToken: "access", refreshToken: "refresh-secret", expiresAt: Date.now() + 60_000 });
  const snapshot = authority.accessTokenSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), ["accessToken", "expiresAt"]);
  assert.equal(JSON.stringify(snapshot).includes("refresh-secret"), false);
});
