type MarkdownBodyModule = typeof import("./MarkdownBody");

export let loadMarkdownBody = () => import("./MarkdownBody");

export function setDeferredMarkdownBodyLoaderForTest(loader: () => Promise<MarkdownBodyModule>) {
  if (import.meta.env.MODE !== "test") return;
  loadMarkdownBody = loader;
}
