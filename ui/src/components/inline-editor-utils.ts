type InlineMarkdownEditorModule = typeof import("./InlineMarkdownEditor");

export let loadMarkdownEditor = () => import("./InlineMarkdownEditor");

export function setInlineMarkdownEditorLoaderForTest(loader: () => Promise<InlineMarkdownEditorModule>) {
  if (import.meta.env.MODE !== "test") return;
  loadMarkdownEditor = loader;
}

export function queueContainedBlurCommit(container: HTMLElement, onCommit: () => void) {
  let frameId = requestAnimationFrame(() => {
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      const active = document.activeElement;
      if (active instanceof Node && container.contains(active)) return;
      onCommit();
    });
  });

  return () => {
    if (frameId === 0) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  };
}
