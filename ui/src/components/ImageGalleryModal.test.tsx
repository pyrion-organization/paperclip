// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IssueAttachment } from "@paperclipai/shared";
import { ImageGalleryModal } from "./ImageGalleryModal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function attachment(id: string, filename: string): IssueAttachment {
  return {
    id,
    companyId: "company-1",
    issueId: "issue-1",
    issueCommentId: null,
    assetId: `asset-${id}`,
    provider: "local",
    objectKey: `attachments/${filename}`,
    contentType: "image/png",
    byteSize: 10,
    sha256: `sha-${id}`,
    originalFilename: filename,
    createdByAgentId: null,
    createdByUserId: "user-1",
    createdAt: new Date("2026-04-08T12:00:00.000Z"),
    updatedAt: new Date("2026-04-08T12:00:00.000Z"),
    contentPath: `/assets/${filename}`,
  };
}

describe("ImageGalleryModal", () => {
  let container: HTMLDivElement;
  let root: Root;
  const images = [
    attachment("1", "first.png"),
    attachment("2", "second.png"),
    attachment("3", "third.png"),
  ];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("syncs the current image when reopened with a different initialIndex", () => {
    act(() => {
      root.render(
        <ImageGalleryModal images={images} initialIndex={0} open onOpenChange={() => {}} />,
      );
    });
    expect(document.body.textContent).toContain("first.png");
    expect(document.body.textContent).toContain("1 / 3");

    act(() => {
      root.render(
        <ImageGalleryModal images={images} initialIndex={0} open={false} onOpenChange={() => {}} />,
      );
    });

    act(() => {
      root.render(
        <ImageGalleryModal images={images} initialIndex={2} open onOpenChange={() => {}} />,
      );
    });

    expect(document.body.textContent).toContain("third.png");
    expect(document.body.textContent).toContain("3 / 3");
  });
});
