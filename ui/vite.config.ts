import path from "path";
import { defineConfig } from "vite";
import type { ResolveModulePreloadDependenciesFn } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";

const issueRuntimeModuleSuffixes = [
  "/src/lib/issue-blockers.ts",
  "/src/lib/issue-detail-subissues.ts",
  "/src/lib/issue-tree.ts",
  "/src/lib/liveIssueIds.ts",
  "/src/lib/status-colors.ts",
  "/src/lib/subIssueDefaults.ts",
  "/src/lib/successful-run-handoff.ts",
  "/src/lib/workflow-sort.ts",
];

function manualIssueRuntimeChunk(id: string) {
  const normalizedId = id.replace(/\\/g, "/");
  if (issueRuntimeModuleSuffixes.some((suffix) => normalizedId.endsWith(suffix))) {
    return "issue-runtime";
  }
  return undefined;
}

const resolveModulePreloadDependencies: ResolveModulePreloadDependenciesFn = (_filename, deps, context) => {
  if (context.hostType !== "js") return deps;
  return deps.filter((dep) => dep.endsWith(".css"));
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  build: {
    minify: "esbuild",
    modulePreload: {
      resolveDependencies: resolveModulePreloadDependencies,
    },
    rollupOptions: {
      output: {
        manualChunks: manualIssueRuntimeChunk,
      },
    },
  },
  esbuild:
    mode === "production"
      ? {
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    watch: createUiDevWatchOptions(process.cwd()),
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        ws: true,
      },
    },
  },
}));
