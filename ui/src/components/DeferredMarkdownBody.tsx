import { lazy, Suspense, type ComponentProps } from "react";
import { loadMarkdownBody } from "./deferred-markdown-body-loader";

type MarkdownBodyModule = typeof import("./MarkdownBody");
type MarkdownBodyProps = ComponentProps<MarkdownBodyModule["MarkdownBody"]>;

const LazyMarkdownBody = lazy(() =>
  loadMarkdownBody().then(({ MarkdownBody }) => ({ default: MarkdownBody })),
);

export function DeferredMarkdownBody({ children, className, ...props }: MarkdownBodyProps) {
  return (
    <Suspense fallback={<div className={className}>{children}</div>}>
      <LazyMarkdownBody className={className} {...props}>
        {children}
      </LazyMarkdownBody>
    </Suspense>
  );
}
