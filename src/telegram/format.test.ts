import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "@/telegram/format.ts";

describe("escapeHtml", () => {
  it("encodes HTML special characters", () => {
    assert.equal(escapeHtml("a&b<c>d"), "a\u0026amp;b\u0026lt;c\u0026gt;d");
  });
});
