import { describe, expect, it } from "vitest";
import { $createLinkNode } from "@lexical/link";
import { createEditor } from "lexical";
import {
  MentionAwareLinkNode,
  getMentionAwareLinkNodeInit,
  mentionAwareLinkNodeReplacement,
} from "./mention-aware-link-node";

function createTestEditor() {
  return createEditor({
    namespace: "mention-aware-link-node-test",
    nodes: [MentionAwareLinkNode, mentionAwareLinkNodeReplacement],
    onError(error: Error) {
      throw error;
    },
  });
}

describe("getMentionAwareLinkNodeInit", () => {
  it("preserves supported custom mention schemes during URL sanitization", () => {
    const editor = createTestEditor();

    editor.update(() => {
      const node = new MentionAwareLinkNode();

      for (const href of [
        "agent://agent-123",
        "project://project-123",
        "skill://skill-123",
        "user://user-123",
        "routine://routine-123",
      ]) {
        expect(node.sanitizeUrl(href)).toBe(href);
      }

      expect(node.sanitizeUrl("javascript:alert(1)")).not.toBe("javascript:alert(1)");
    });
  });

  it("copies link attributes without carrying over a node key", () => {
    const init = getMentionAwareLinkNodeInit({
      getURL: () => "agent://agent-123",
      getRel: () => "noreferrer",
      getTarget: () => "_blank",
      getTitle: () => "Agent mention",
    });

    expect(Object.keys(init)).toEqual(["url", "attributes"]);
    expect(init).toEqual({
      url: "agent://agent-123",
      attributes: {
        rel: "noreferrer",
        target: "_blank",
        title: "Agent mention",
      },
    });
  });

  it("replaces LinkNode creation with MentionAwareLinkNode without throwing", () => {
    const editor = createTestEditor();
    let created: unknown;

    editor.update(() => {
      created = $createLinkNode("agent://agent-123");
    });

    expect(created).toBeInstanceOf(MentionAwareLinkNode);
  });
});
