import { describe, expect, it } from "vitest";
import type { DocumentAnnotationThreadWithComments } from "@paperclipai/shared";
import { getDocumentAnnotationThreadFilter } from "./DocumentAnnotationPanel";

function thread(input: {
  status: DocumentAnnotationThreadWithComments["status"];
  anchorState: DocumentAnnotationThreadWithComments["anchorState"];
}) {
  return input as DocumentAnnotationThreadWithComments;
}

describe("getDocumentAnnotationThreadFilter", () => {
  it("keeps stale open threads in the stale bucket instead of open", () => {
    expect(getDocumentAnnotationThreadFilter(thread({ status: "open", anchorState: "stale" }))).toBe("stale");
    expect(getDocumentAnnotationThreadFilter(thread({ status: "open", anchorState: "active" }))).toBe("open");
  });
});
