import { lazy, Suspense, type ComponentProps } from "react";

type MarkdownBodyModule = typeof import("./MarkdownBody");
type MarkdownBodyProps = ComponentProps<MarkdownBodyModule["MarkdownBody"]>;

let loadMarkdownBody = () => import("./MarkdownBody");
const LazyMarkdownBody = lazy(() =>
  loadMarkdownBody().then(({ MarkdownBody }) => ({ default: MarkdownBody })),
);

export function setDeferredMarkdownBodyLoaderForTest(loader: () => Promise<MarkdownBodyModule>) {
  if (import.meta.env.MODE !== "test") return;
  loadMarkdownBody = loader;
}

export function DeferredMarkdownBody({ children, className, ...props }: MarkdownBodyProps) {
  return (
    <Suspense fallback={<div className={className}>{children}</div>}>
      <LazyMarkdownBody className={className} {...props}>
        {children}
      </LazyMarkdownBody>
    </Suspense>
  );
}
