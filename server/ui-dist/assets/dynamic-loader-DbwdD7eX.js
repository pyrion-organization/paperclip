const y=new Map,b=new Map,f=new Set;async function M(e){const t=y.get(e);if(t!==void 0)return t;if(f.has(e))return null;const s=b.get(e);if(s)return s;const n=(async()=>{try{const r=await fetch(`/api/adapters/${encodeURIComponent(e)}/config-schema`);if(!r.ok)return f.add(e),null;const a=await r.json();return y.set(e,a),a}catch{return f.add(e),null}finally{b.delete(e)}})();return b.set(e,n),n}function A(e){y.delete(e),f.delete(e)}function O(e){var t,s;if(e.default!==void 0)return e.default;switch(e.type){case"toggle":return!1;case"number":return 0;case"text":case"textarea":return"";case"select":return((s=(t=e.options)==null?void 0:t[0])==null?void 0:s.value)??""}}function E(e,t,s){var i;const n=(i=e.meta)==null?void 0:i.visibleWhen;if(!n||typeof n!="object"||Array.isArray(n))return!0;const r=n;if(typeof r.key!="string"||r.key.length===0)return!0;const a=s.fields.find(c=>c.key===r.key);if(!a)return!0;const o=String(t(a)??"");if(typeof r.value=="string")return o===r.value;if(Array.isArray(r.values)){const c=r.values.filter(u=>typeof u=="string");return c.length>0&&c.includes(o)}return Array.isArray(r.notValues)?!r.notValues.filter(u=>typeof u=="string").includes(o):!0}function W(e){var s;const t={};return(s=e.model)!=null&&s.trim()&&(t.model=e.model.trim()),e.cwd&&(t.cwd=e.cwd),e.command&&(t.command=e.command),e.instructionsFilePath&&(t.instructionsFilePath=e.instructionsFilePath),e.thinkingEffort&&(t.thinkingEffort=e.thinkingEffort),e.extraArgs&&(t.extraArgs=e.extraArgs.split(/\s+/).filter(Boolean)),e.adapterSchemaValues&&Object.assign(t,e.adapterSchemaValues),t}const k=`
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
`;function C(){const e=new Blob([k],{type:"application/javascript"}),t=URL.createObjectURL(e);try{return new Worker(t)}finally{URL.revokeObjectURL(t)}}const w=new Map,m=new Map,p=new Set,h=new Map;let g=null;function _(e){g=e}function S(e,t){e.worker.postMessage(t)}function R(e){return e.nextId++}function P(e,t){return`${t}\0${e}`}function F(){g==null||g()}function L(e,t,s,n){return new Promise(r=>{const a=R(e);e.pendingResolves.set(a,r),S(e,{type:"parse",id:a,line:t,ts:s,parserId:n})})}function G(e,t){S(e,{type:"reset_parser",parserId:t})}function d(e){for(const t of e.pendingResolves.values())t([]);e.pendingResolves.clear()}function I(e){return new Promise((t,s)=>{const n=C(),r={worker:n,ready:!1,hasStdoutParserFactory:!1,nextId:1,pendingResolves:new Map},a=setTimeout(()=>{d(r),n.terminate(),s(new Error("Parser worker init timed out"))},5e3);n.onmessage=o=>{const i=o.data;if(i.type==="ready"){clearTimeout(a),r.ready=!0,r.hasStdoutParserFactory=i.hasStdoutParserFactory===!0,n.onmessage=c=>{const u=c.data;if(u.type==="result"){const l=r.pendingResolves.get(u.id);l&&(r.pendingResolves.delete(u.id),l(u.entries))}else u.type==="error"&&d(r)},t(r);return}if(i.type==="error"){clearTimeout(a),d(r),n.terminate(),s(new Error(i.message));return}},n.onerror=o=>{clearTimeout(a),d(r),n.terminate(),s(new Error(`Worker error: ${o.message}`))},S(r,{type:"init",source:e})})}function j(e){const t=new Map,s=new Set;let n=1;function r(o,i,c,u){const l=`${u??"stateless"}\0${o}`;if(s.has(l))return;const v=t.has(o);s.add(l),L(e,i,c,u).then(x=>{s.delete(l),v||(t.set(o,x),F())})}const a=(o,i)=>{const c=P(o,i);return t.has(c)?t.get(c).slice():(r(c,o,i),[])};return e.hasStdoutParserFactory?{parseStdoutLine:a,createStdoutParser:()=>{const o=`parser-${n++}`;let i="";return{parseLine:(c,u)=>{const l=P(`${i}\0${c}`,u);return i=l,t.has(l)?(r(l,c,u,o),t.get(l).slice()):(r(l,c,u,o),[])},reset:()=>{i="",G(e,o)}}}}:{parseStdoutLine:a}}async function U(e){const t=m.get(e);if(t)return t;if(p.has(e))return null;const s=h.get(e);if(s)return s;const n=(async()=>{try{const r=await fetch(`/api/adapters/${encodeURIComponent(e)}/ui-parser.js`);if(!r.ok)return p.add(e),null;const a=await r.text(),o=await I(a);w.set(e,o);const i=j(o);return m.set(e,i),i}catch{return p.add(e),null}finally{h.delete(e)}})();return h.set(e,n),n}function $(e){const t=m.has(e);m.delete(e),p.delete(e),h.delete(e);const s=w.get(e);return s&&(d(s),s.worker.terminate(),w.delete(e)),t}export{A as a,M as b,W as c,_ as d,E as f,O as g,$ as i,U as l,y as s};
