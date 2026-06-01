const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-C8hupzgx.css"])))=>i.map(i=>d[i]);
import{_ as k,H as w}from"./index-uOJBu2Uk.js";import{registerPluginReactComponent as K,registerPluginWebComponent as T,clearPluginComponentRegistry as $}from"./slots-registry-Cy4YZiJy.js";import"./sidebar-runtime-D57EFm4H.js";const c=new Map,u=new Map,d={};let S=null;function f(e){const t=e.updatedAt??e.version??"0";return`${e.pluginId}:${t}`}function B(e){const t=encodeURIComponent(e.updatedAt??e.version??"0");return`/_plugins/${encodeURIComponent(e.pluginId)}/ui/${e.uiEntryFile}?v=${t}`}function R(e,t){return t===void 0?e??{}:{...e??{},key:t}}function h(e){return`
        const R = globalThis.__paperclipPluginBridge__?.react;
        if (!R) {
          throw new Error("Paperclip plugin React runtime is not initialized.");
        }
        export default R;
${Object.keys(e).filter(n=>n!=="default"&&/^[A-Za-z_$][\w$]*$/.test(n)).sort().map(n=>`        export const ${n} = R.${n};`).join(`
`)}
      `}function i(e){if(d[e])return d[e];let t;switch(e){case"react":t=h(w);break;case"react/jsx-runtime":t=`
        const R = globalThis.__paperclipPluginBridge__?.react;
        const withKey = ${R.toString()};
        export const jsx = (type, props, key) => R.createElement(type, withKey(props, key));
        export const jsxs = (type, props, key) => R.createElement(type, withKey(props, key));
        export const Fragment = R.Fragment;
      `;break;case"react-dom":case"react-dom/client":t=`
        const RD = globalThis.__paperclipPluginBridge__?.reactDom;
        export default RD;
        const { createRoot, hydrateRoot, createPortal, flushSync } = RD ?? {};
        export { createRoot, hydrateRoot, createPortal, flushSync };
      `;break;case"sdk-ui":t=`
        const SDK = globalThis.__paperclipPluginBridge__?.sdkUi ?? {};
        function missing(name) {
          return function MissingPaperclipSdkUiComponent() {
            throw new Error('Paperclip plugin UI runtime is not initialized for "' + name + '". Ensure the host loaded the plugin bridge before rendering this UI module.');
          };
        }
        const { usePluginData, usePluginAction, useHostContext, useHostLocation, useHostNavigation, usePluginStream, usePluginToast } = SDK;
        const MetricCard = SDK.MetricCard ?? missing("MetricCard");
        const StatusBadge = SDK.StatusBadge ?? missing("StatusBadge");
        const DataTable = SDK.DataTable ?? missing("DataTable");
        const TimeseriesChart = SDK.TimeseriesChart ?? missing("TimeseriesChart");
        const MarkdownBlock = SDK.MarkdownBlock ?? missing("MarkdownBlock");
        const MarkdownEditor = SDK.MarkdownEditor ?? missing("MarkdownEditor");
        const KeyValueList = SDK.KeyValueList ?? missing("KeyValueList");
        const ActionBar = SDK.ActionBar ?? missing("ActionBar");
        const LogView = SDK.LogView ?? missing("LogView");
        const JsonTree = SDK.JsonTree ?? missing("JsonTree");
        const Spinner = SDK.Spinner ?? missing("Spinner");
        const ErrorBoundary = SDK.ErrorBoundary ?? missing("ErrorBoundary");
        const FileTree = SDK.FileTree ?? missing("FileTree");
        const IssuesList = SDK.IssuesList ?? missing("IssuesList");
        const AssigneePicker = SDK.AssigneePicker ?? missing("AssigneePicker");
        const ProjectPicker = SDK.ProjectPicker ?? missing("ProjectPicker");
        const ManagedRoutinesList = SDK.ManagedRoutinesList ?? missing("ManagedRoutinesList");
        export { usePluginData, usePluginAction, useHostContext, useHostLocation, useHostNavigation, usePluginStream, usePluginToast, MetricCard, StatusBadge, DataTable, TimeseriesChart, MarkdownBlock, MarkdownEditor, KeyValueList, ActionBar, LogView, JsonTree, Spinner, ErrorBoundary, FileTree, IssuesList, AssigneePicker, ProjectPicker, ManagedRoutinesList };
      `;break}const o=new Blob([t],{type:"application/javascript"}),n=URL.createObjectURL(o);return d[e]=n,n}async function M(){globalThis.__paperclipPluginBridge__||(S??(S=Promise.all([k(()=>import("./bridge-init-BJLH2dxH.js"),__vite__mapDeps([0])),k(()=>import("./index-BAcxAyUn.js").then(e=>e.i),__vite__mapDeps([0]))]).then(([{initPluginBridge:e},t])=>{e(w,t)})),await S)}function _(e){const t={'"@paperclipai/plugin-sdk/ui"':`"${i("sdk-ui")}"`,"'@paperclipai/plugin-sdk/ui'":`'${i("sdk-ui")}'`,'"@paperclipai/plugin-sdk/ui/hooks"':`"${i("sdk-ui")}"`,"'@paperclipai/plugin-sdk/ui/hooks'":`'${i("sdk-ui")}'`,'"react/jsx-runtime"':`"${i("react/jsx-runtime")}"`,"'react/jsx-runtime'":`'${i("react/jsx-runtime")}'`,'"react-dom/client"':`"${i("react-dom/client")}"`,"'react-dom/client'":`'${i("react-dom/client")}'`,'"react-dom"':`"${i("react-dom")}"`,"'react-dom'":`'${i("react-dom")}'`,'"react"':`"${i("react")}"`,"'react'":`'${i("react")}'`};let o=e;for(const[n,s]of Object.entries(t))o=o.replaceAll(` from ${n}`,` from ${s}`),o=o.replaceAll(`import ${n}`,`import ${s}`);return o}async function E(e){await M();const t=await fetch(e);if(!t.ok)throw new Error(`Failed to fetch plugin module: ${t.status} ${t.statusText}`);const o=await t.text(),n=_(o),s=new Blob([n],{type:"application/javascript"}),a=URL.createObjectURL(s);try{return await import(a)}finally{URL.revokeObjectURL(a)}}function j(e){return e.action.type==="openModal"||e.action.type==="openDrawer"||e.action.type==="openPopover"}function U(e){return typeof e=="function"||typeof e=="string"}function x(e,t){const o=new Set(t);for(const[n,s]of Object.entries(e))n!=="default"&&U(s)&&o.add(n);return o}async function L(e){const{pluginId:t,pluginKey:o,slots:n,launchers:s}=e,a=f(e),m=c.get(a);if(m==="loaded"||m==="loading"){const l=u.get(t);l&&await l;return}const y=u.get(t);if(y&&(await y,c.get(a)==="loaded"))return;c.set(a,"loading");const b=B(e),P=(async()=>{try{const l=await E(b),g=new Set;for(const r of n)g.add(r.exportName);for(const r of s)r.exportName&&g.add(r.exportName),j(r)&&g.add(r.action.target);const D=x(l,g);for(const r of D){const p=l[r];p!==void 0&&(typeof p=="function"?K(o,r,p):typeof p=="string"&&T(o,r,p))}c.set(a,"loaded")}catch{c.set(a,"error")}finally{u.delete(t)}})();u.set(t,P),await P}async function A(e){await Promise.all(e.map(t=>L(t)))}async function N(e){await L(e)}function F(e){for(const t of e){const o=c.get(f(t));if(o==="loading"||o==="idle"||o===void 0)return"loading"}return"loaded"}function O(e){return c.get(f(e))}function V(e){return u.get(e)}function H(){if(c.clear(),u.clear(),$(),typeof URL.revokeObjectURL=="function")for(const e of Object.values(d))URL.revokeObjectURL(e);for(const e of Object.keys(d))delete d[e]}const J=R,z=h,W=_,Z=x;export{J as _applyJsxRuntimeKeyForTests,Z as _collectRegisterableExportNamesForTests,z as _createReactShimSourceForTests,H as _resetPluginModuleLoader,W as _rewriteBareSpecifiersForTests,F as aggregateLoadState,N as ensurePluginContributionLoaded,A as ensurePluginModulesLoaded,V as getInflightPluginImport,O as getPluginLoadState};
