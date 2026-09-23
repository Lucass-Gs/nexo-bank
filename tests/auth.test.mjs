import test from "node:test";
import assert from "node:assert/strict";
import { passwordHash, digest } from "../dist/auth.js";
test("passwords have independent salts and tokens are hashed", async () => {
  const a = await passwordHash("Example123!"),
    b = await passwordHash("Example123!");
  assert.notEqual(a, b);
  assert.equal(a.split(":")[1].length, 128);
  assert.equal(digest("token").length, 64);
  assert.notEqual(digest("token"), "token");
});
