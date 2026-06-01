import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonResponseWithLimit } from "./dev-runner-output.mjs";

test("parseJsonResponseWithLimit reports missing response bodies explicitly", async () => {
  await assert.rejects(
    () => parseJsonResponseWithLimit({
      headers: new Headers(),
      body: null,
    }),
    /Response has no body/,
  );
});
