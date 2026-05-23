/**
 * Sandboxed Worker bootstrap for external adapter UI parsers.
 *
 * Security boundary: parser code runs inside a dedicated Web Worker with
 * network and DOM APIs explicitly disabled.  Communication uses a narrow
 * postMessage protocol (see {@link SandboxRequest} / {@link SandboxResponse}).
 *
 * The worker is created from an inline Blob URL so no extra file needs to
 * be served.  On initialisation the main thread sends the parser source;
 * the bootstrap evaluates it in a scope where dangerous globals are shadowed
 * by `undefined`, then responds to parse requests.
 */

// ── Message protocol ────────────────────────────────────────────────────────

/** Messages sent from the main thread to the worker. */
export type SandboxRequest =
  | { type: "init"; source: string }
  | { type: "parse"; id: number; line: string; ts: string; parserId?: string }
  | { type: "reset_parser"; parserId: string };

/** Messages sent from the worker back to the main thread. */
export type SandboxResponse =
  | { type: "ready"; hasStdoutParserFactory?: boolean }
  | { type: "error"; message: string }
  | { type: "result"; id: number; entries: unknown[] };

// ── Worker bootstrap source ─────────────────────────────────────────────────

/**
 * Inline JS that runs inside the Worker.  It:
 *  1. Shadows dangerous globals (`fetch`, `XMLHttpRequest`, `WebSocket`,
 *     `importScripts`, `EventSource`, `navigator.sendBeacon`, etc.) with
 *     no-ops or `undefined`.
 *  2. Waits for an `init` message carrying the adapter's parser source.
 *  3. Evaluates the source via `new Function()` and extracts exports.
 *  4. Responds to `parse` messages with `TranscriptEntry[]` results.
 */
const WORKER_BOOTSTRAP = `
"use strict";

// ── 1. Lock down dangerous globals ──────────────────────────────────────────
// Workers have no DOM, but they still have network and import APIs.

const _undefined = void 0;
const NativeFunction = Function;
const NativeAsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const NativeGeneratorFunction = Object.getPrototypeOf(function* () {}).constructor;
const NativeAsyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor;

function disableGlobal(name) {
  try { Object.defineProperty(self, name, { value: _undefined, writable: false, configurable: false }); } catch {
    try { self[name] = _undefined; } catch {}
  }
}

function disableFunctionConstructor(Ctor) {
  try { Object.defineProperty(Ctor.prototype, "constructor", { value: _undefined, writable: false, configurable: false }); } catch {}
}

function isIdentifierChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function nextCodeTokenIndex(source, start) {
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (/\\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\\n" && source[i] !== "\\r") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    return i;
  }
  return i;
}

function skipQuotedString(source, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return i;
}

function assertParserSourceAllowed(source) {
  if (typeof source !== "string") throw new Error("Parser source must be a string");

  for (let i = 0; i < source.length;) {
    const ch = source[i];

    if (ch === "\\"" || ch === "'") {
      i = skipQuotedString(source, i, ch);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = nextCodeTokenIndex(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = nextCodeTokenIndex(source, i);
      continue;
    }
    if (!/[A-Za-z_$]/.test(ch)) {
      i++;
      continue;
    }

    const start = i;
    i++;
    while (i < source.length && isIdentifierChar(source[i])) i++;
    const ident = source.slice(start, i);
    const next = nextCodeTokenIndex(source, i);

    if (ident === "import" && source[next] === "(") {
      throw new Error("Parser source uses forbidden dynamic import");
    }
    if ((ident === "eval" || ident === "Function") && source[next] === "(") {
      throw new Error("Parser source uses forbidden eval or Function constructor");
    }
    if (ident === "constructor") {
      let j = start - 1;
      while (j >= 0 && /\\s/.test(source[j])) j--;
      if (j >= 0 && source[j] === ".") {
        throw new Error("Parser source uses forbidden constructor escape hatch");
      }
    }
  }
}

disableGlobal("eval");
disableGlobal("Function");
disableFunctionConstructor(NativeFunction);
disableFunctionConstructor(NativeAsyncFunction);
disableFunctionConstructor(NativeGeneratorFunction);
disableFunctionConstructor(NativeAsyncGeneratorFunction);

// Network
disableGlobal("fetch");
disableGlobal("XMLHttpRequest");
disableGlobal("WebSocket");
disableGlobal("EventSource");
disableGlobal("RTCPeerConnection");
disableGlobal("RTCDataChannel");
disableGlobal("Request");
disableGlobal("Response");
disableGlobal("Headers");
disableGlobal("Cache");
disableGlobal("CacheStorage");
disableGlobal("caches");

// Import / eval escape hatches
disableGlobal("importScripts");
disableGlobal("Worker");
disableGlobal("SharedWorker");
disableGlobal("Blob");
if (self.URL) {
  try { Object.defineProperty(self.URL, "createObjectURL", { value: _undefined, writable: false, configurable: false }); } catch {}
  try { Object.defineProperty(self.URL, "revokeObjectURL", { value: _undefined, writable: false, configurable: false }); } catch {}
}

// Beacon / reporting
if (self.navigator) {
  try { Object.defineProperty(self.navigator, "sendBeacon", { value: _undefined, writable: false, configurable: false }); } catch {}
}

// Service worker / broadcast channel
disableGlobal("BroadcastChannel");

// IndexedDB (prevents persistent state exfiltration)
disableGlobal("indexedDB");
disableGlobal("IDBFactory");

// ── 2. Parser state ─────────────────────────────────────────────────────────

let parseStdoutLine = null;
let createStdoutParser = null;
const parserSessions = new Map();

// ── 3. Message handler ──────────────────────────────────────────────────────

self.onmessage = function (e) {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      assertParserSourceAllowed(msg.source);

      // Evaluate the parser source in a constrained scope.
      // We use a Function constructor to avoid giving the source access to
      // our local variables.  The only value we inject is a module-like
      // \`exports\` object so both CJS-style and ESM-compiled code works.
      //
      // ESM sources compiled to IIFE typically assign to an \`exports\` param
      // or use \`export\`.  Since we can't use real ESM import() here (the
      // source is a string, not a URL), we wrap it.
      const exports = {};
      const module = { exports };

      // Build a function that receives common CJS shims.
      // \`self\` is shadowed to prevent the parser from un-deleting globals.
      const factory = new NativeFunction(
        "exports", "module", "self", "globalThis",
        // Wrap in a block to prevent hoisted declarations from leaking.
        "\\"use strict\\";\\n{\\n" + msg.source + "\\n}"
      );
      factory(exports, module, _undefined, _undefined);

      // Resolve exports — try module.exports first (CJS), then named exports.
      const resolved = module.exports && typeof module.exports === "object" && Object.keys(module.exports).length > 0
        ? module.exports
        : exports;

      if (typeof resolved.parseStdoutLine === "function") {
        parseStdoutLine = resolved.parseStdoutLine;
      }
      if (typeof resolved.createStdoutParser === "function") {
        createStdoutParser = resolved.createStdoutParser;
      }

      if (!parseStdoutLine && !createStdoutParser) {
        self.postMessage({ type: "error", message: "Parser module exports no usable parseStdoutLine or createStdoutParser" });
        return;
      }

      self.postMessage({ type: "ready", hasStdoutParserFactory: !!createStdoutParser });
    } catch (err) {
      self.postMessage({ type: "error", message: "Parser init failed: " + (err && err.message || String(err)) });
    }
    return;
  }

  if (msg.type === "parse") {
    try {
      let entries = [];
      if (msg.parserId && createStdoutParser) {
        let parser = parserSessions.get(msg.parserId);
        if (!parser) {
          parser = createStdoutParser();
          parserSessions.set(msg.parserId, parser);
        }
        entries = parser && typeof parser.parseLine === "function" ? parser.parseLine(msg.line, msg.ts) : [];
      } else if (parseStdoutLine) {
        entries = parseStdoutLine(msg.line, msg.ts);
      } else if (createStdoutParser) {
        const parser = createStdoutParser();
        entries = parser && typeof parser.parseLine === "function" ? parser.parseLine(msg.line, msg.ts) : [];
        if (parser && typeof parser.reset === "function") parser.reset();
      }
      self.postMessage({ type: "result", id: msg.id, entries: entries || [] });
    } catch (err) {
      if (msg.parserId) {
        const parser = parserSessions.get(msg.parserId);
        if (parser && typeof parser.reset === "function") parser.reset();
      }
      self.postMessage({ type: "result", id: msg.id, entries: [] });
    }
    return;
  }

  if (msg.type === "reset_parser") {
    const parser = parserSessions.get(msg.parserId);
    if (parser && typeof parser.reset === "function") parser.reset();
    parserSessions.delete(msg.parserId);
    return;
  }

};
`;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the inline Worker bootstrap source.
 * Exported for testing (so test code can verify the lockdown behaviour).
 */
export function getWorkerBootstrapSource(): string {
  return WORKER_BOOTSTRAP;
}

/**
 * Create a sandboxed Web Worker from the inline bootstrap.
 * The caller must send an `init` message with the parser source before
 * sending parse requests.
 */
export function createSandboxedWorker(): Worker {
  const blob = new Blob([WORKER_BOOTSTRAP], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    return new Worker(url);
  } finally {
    // Revoke after construction; the Worker has already captured the Blob URL source.
    URL.revokeObjectURL(url);
  }
}
