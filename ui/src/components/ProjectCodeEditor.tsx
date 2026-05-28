import { lazy, Suspense } from "react";

const ProjectCodeEditorImpl = lazy(() =>
  import("./ProjectCodeEditorImpl").then(({ ProjectCodeEditor }) => ({ default: ProjectCodeEditor })),
);

export type ProjectCodeEditorProps = {
  value: string;
  readOnly: boolean;
  language: string | null;
  onChange: (value: string) => void;
  className?: string;
};

export function ProjectCodeEditor(props: ProjectCodeEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[420px] rounded-lg border border-border bg-card" />
      }
    >
      <ProjectCodeEditorImpl {...props} />
    </Suspense>
  );
}
