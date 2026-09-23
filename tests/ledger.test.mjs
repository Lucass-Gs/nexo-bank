import test from "node:test";
import assert from "node:assert/strict";
import { amountSchema } from "../dist/ledger.js";
test("money accepts only positive integer cents and bounds precision", () => {
  for (const v of ["0", "-1", "1.5", "1e3", "9999999999999", 100])
    assert.throws(() => amountSchema.parse(v));
  assert.equal(amountSchema.parse("12345"), "12345");
});
