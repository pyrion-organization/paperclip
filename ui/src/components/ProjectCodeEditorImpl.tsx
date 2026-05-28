import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/classnames";
import { useTheme } from "../context/ThemeContext";

function loadCodeMirrorModules() {
  return Promise.all([
    import("@codemirror/state"),
    import("@codemirror/view"),
    import("@codemirror/commands"),
    import("@codemirror/language"),
    import("@codemirror/search"),
    import("@codemirror/autocomplete"),
    import("@codemirror/lint"),
    import("@codemirror/lang-markdown"),
    import("@codemirror/lang-python"),
    import("@codemirror/lang-json"),
    import("@codemirror/lang-javascript"),
    import("@codemirror/lang-css"),
    import("@codemirror/lang-html"),
    import("@codemirror/lang-yaml"),
    import("@codemirror/lang-sql"),
    import("@codemirror/theme-one-dark"),
  ]).then(([
    state,
    view,
    commands,
    language,
    search,
    autocomplete,
    lint,
    markdownModule,
    pythonModule,
    jsonModule,
    javascriptModule,
    cssModule,
    htmlModule,
    yamlModule,
    sqlModule,
    themeOneDark,
  ]) => ({
    EditorState: state.EditorState,
    Compartment: state.Compartment,
    EditorView: view.EditorView,
    keymap: view.keymap,
    rectangularSelection: view.rectangularSelection,
    crosshairCursor: view.crosshairCursor,
    drawSelection: view.drawSelection,
    dropCursor: view.dropCursor,
    highlightActiveLine: view.highlightActiveLine,
    highlightActiveLineGutter: view.highlightActiveLineGutter,
    lineNumbers: view.lineNumbers,
    defaultKeymap: commands.defaultKeymap,
    history: commands.history,
    historyKeymap: commands.historyKeymap,
    indentWithTab: commands.indentWithTab,
    bracketMatching: language.bracketMatching,
    foldGutter: language.foldGutter,
    indentOnInput: language.indentOnInput,
    syntaxHighlighting: language.syntaxHighlighting,
    defaultHighlightStyle: language.defaultHighlightStyle,
    searchKeymap: search.searchKeymap,
    highlightSelectionMatches: search.highlightSelectionMatches,
    autocompletion: autocomplete.autocompletion,
    closeBrackets: autocomplete.closeBrackets,
    closeBracketsKeymap: autocomplete.closeBracketsKeymap,
    lintKeymap: lint.lintKeymap,
    markdown: markdownModule.markdown,
    python: pythonModule.python,
    json: jsonModule.json,
    javascript: javascriptModule.javascript,
    css: cssModule.css,
    html: htmlModule.html,
    yaml: yamlModule.yaml,
    sql: sqlModule.sql,
    oneDark: themeOneDark.oneDark,
  }));
}

type CodeMirrorModules = Awaited<ReturnType<typeof loadCodeMirrorModules>>;
type CodeMirrorView = InstanceType<CodeMirrorModules["EditorView"]>;
type CodeMirrorCompartment = InstanceType<CodeMirrorModules["Compartment"]>;

let codeMirrorModulesPromise: Promise<CodeMirrorModules> | null = null;

function getCodeMirrorModules() {
  codeMirrorModulesPromise ??= loadCodeMirrorModules();
  return codeMirrorModulesPromise;
}

function lightTheme(modules: CodeMirrorModules) {
  const { EditorView } = modules;
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--foreground)",
      fontSize: "14px",
      lineHeight: "1.6",
    },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
      padding: "12px 0",
    },
    ".cm-content": {
      minHeight: "420px",
      caretColor: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--muted-foreground)",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklab, var(--accent) 45%, transparent)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
  }, { dark: false });
}

function extensionForLanguage(language: string | null, modules: CodeMirrorModules) {
  switch (language) {
    case "markdown":
      return modules.markdown();
    case "python":
      return modules.python();
    case "json":
      return modules.json();
    case "javascript":
      return modules.javascript({ jsx: true });
    case "typescript":
      return modules.javascript({ jsx: true, typescript: true });
    case "css":
      return modules.css();
    case "html":
      return modules.html();
    case "yaml":
      return modules.yaml();
    case "sql":
      return modules.sql();
    default:
      return [];
  }
}

export function ProjectCodeEditor({
  value,
  readOnly,
  language,
  onChange,
  className,
}: {
  value: string;
  readOnly: boolean;
  language: string | null;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { theme } = useTheme();
  const [modules, setModules] = useState<CodeMirrorModules | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<CodeMirrorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const themeRef = useRef(theme);
  const languageRef = useRef(language);
  const readOnlyRef = useRef(readOnly);
  const compartmentsRef = useRef<{
    theme: CodeMirrorCompartment;
    language: CodeMirrorCompartment;
    readOnly: CodeMirrorCompartment;
    editable: CodeMirrorCompartment;
  } | null>(null);

  valueRef.current = value;
  themeRef.current = theme;
  languageRef.current = language;
  readOnlyRef.current = readOnly;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void getCodeMirrorModules().then((loadedModules) => {
      if (!cancelled) setModules(loadedModules);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const baseExtensions = useMemo(() => {
    if (!modules) return null;
    return [
      modules.lineNumbers(),
      modules.highlightActiveLineGutter(),
      modules.history(),
      modules.foldGutter(),
      modules.drawSelection(),
      modules.dropCursor(),
      modules.EditorState.allowMultipleSelections.of(true),
      modules.indentOnInput(),
      modules.syntaxHighlighting(modules.defaultHighlightStyle, { fallback: true }),
      modules.bracketMatching(),
      modules.closeBrackets(),
      modules.autocompletion(),
      modules.rectangularSelection(),
      modules.crosshairCursor(),
      modules.highlightActiveLine(),
      modules.highlightSelectionMatches(),
      modules.keymap.of([
        modules.indentWithTab,
        ...modules.defaultKeymap,
        ...modules.historyKeymap,
        ...modules.closeBracketsKeymap,
        ...modules.searchKeymap,
        ...modules.lintKeymap,
      ]),
      modules.EditorView.lineWrapping,
      modules.EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];
  }, [modules]);

  useEffect(() => {
    if (!hostRef.current || !modules || !baseExtensions) return;
    const compartments = {
      theme: new modules.Compartment(),
      language: new modules.Compartment(),
      readOnly: new modules.Compartment(),
      editable: new modules.Compartment(),
    };
    compartmentsRef.current = compartments;
    const state = modules.EditorState.create({
      doc: valueRef.current,
      extensions: [
        ...baseExtensions,
        compartments.theme.of(themeRef.current === "dark" ? modules.oneDark : lightTheme(modules)),
        compartments.language.of(extensionForLanguage(languageRef.current, modules)),
        compartments.readOnly.of(modules.EditorState.readOnly.of(readOnlyRef.current)),
        compartments.editable.of(modules.EditorView.editable.of(!readOnlyRef.current)),
      ],
    });
    const view = new modules.EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      compartmentsRef.current = null;
    };
  }, [baseExtensions, modules]);

  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments || !modules) return;
    view.dispatch({
      effects: compartments.theme.reconfigure(theme === "dark" ? modules.oneDark : lightTheme(modules)),
    });
  }, [modules, theme]);

  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments || !modules) return;
    view.dispatch({
      effects: compartments.language.reconfigure(extensionForLanguage(language, modules)),
    });
  }, [language, modules]);

  useEffect(() => {
    const view = viewRef.current;
    const compartments = compartmentsRef.current;
    if (!view || !compartments || !modules) return;
    view.dispatch({
      effects: [
        compartments.readOnly.reconfigure(modules.EditorState.readOnly.of(readOnly)),
        compartments.editable.reconfigure(modules.EditorView.editable.of(!readOnly)),
      ],
    });
  }, [modules, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;
    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      aria-busy={modules ? undefined : true}
      className={cn("min-h-[420px] rounded-lg border border-border bg-card overflow-hidden", className)}
    />
  );
}
