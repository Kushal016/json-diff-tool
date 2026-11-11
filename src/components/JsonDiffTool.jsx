// src/components/JsonDiffTool.jsx
import { useState, useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

function parseJSON(str) {
  try {
    return { ok: true, val: JSON.parse(str.trim()) };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

function flattenKeys(obj, prefix = "") {
  const out = {};
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  for (const k of Object.keys(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const child = obj[k];
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      Object.assign(out, flattenKeys(child, key));
    } else {
      out[key] = child;
    }
  }
  return out;
}

function valStr(v) {
  if (v === undefined) return "";
  if (typeof v === "string") return `"${v}"`;
  return JSON.stringify(v);
}

const TYPE_STYLES = {
  added: { row: "bg-[#0d2a1a]", sign: "+", signClass: "text-green-400" },
  removed: { row: "bg-[#2a0d0d]", sign: "-", signClass: "text-red-400" },
  changed: { row: "bg-[#2a1f0d]", sign: "~", signClass: "text-yellow-400" },
  same: { row: "", sign: "", signClass: "" },
  struck: { row: "bg-[#2a0d0d]", sign: "-", signClass: "text-red-400" },
  empty: { row: "", sign: "", signClass: "" },
};

function DiffLine({ type, text, lineNumber }) {
  const s = TYPE_STYLES[type];
  const isStruck = type === "struck";
  return (
    <div
      className={`flex items-start text-xs font-mono leading-6 min-h-[24px] ${s.row}`}
    >
      <span className="w-8 shrink-0 text-right pr-2 text-gray-400 select-none text-[11px] pt-[3px]">
        {type !== "empty" && text !== "" ? lineNumber : ""}
      </span>
      <span className={`w-4 shrink-0 text-[11px] pt-[3px] ${s.signClass}`}>
        {s.sign}
      </span>
      <span
        className="flex-1 px-2 break-all whitespace-pre-wrap"
        style={{
          textDecoration: isStruck ? "line-through" : "none",
          color: isStruck ? "#f85149" : "#e6edf3",
        }}
      >
        {text}
      </span>
    </div>
  );
}
function prettyLines(obj, diffMap, side, otherObj, prefix = "", indent = 0) {
  const lines = [];
  const pad = "  ".repeat(indent);

  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [{ type: "same", text: pad + JSON.stringify(obj) }];
  }

  const ownKeys = Object.keys(obj);
  const otherKeys =
    otherObj && typeof otherObj === "object" ? Object.keys(otherObj) : [];

  // build a master ordered key list that preserves original position
  // use the left side (original) as the source of truth for ordering
  const leftKeys = side === "left" ? ownKeys : otherKeys;
  const rightKeys = side === "left" ? otherKeys : ownKeys;

  // merge: walk leftKeys in order, insert rightKeys-only keys at the position
  // they appear relative to their neighbours in rightKeys
  const mergedKeys = [...leftKeys];
  rightKeys.forEach((k, ri) => {
    if (mergedKeys.includes(k)) return; // already in list
    // find the best insertion point: after the last key in mergedKeys
    // that appears before k in rightKeys
    let insertAfter = -1;
    for (let i = ri - 1; i >= 0; i--) {
      const idx = mergedKeys.indexOf(rightKeys[i]);
      if (idx !== -1) {
        insertAfter = idx;
        break;
      }
    }
    mergedKeys.splice(insertAfter + 1, 0, k);
  });

  mergedKeys.forEach((k, i) => {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    const val = obj[k];
    const otherVal = otherObj ? otherObj[k] : undefined;
    const isLast = i === mergedKeys.length - 1;
    const comma = isLast ? "" : ",";
    const diffEntry = diffMap[fullKey];
    const isNested =
      val !== null && typeof val === "object" && !Array.isArray(val);

    if (isNested) {
      lines.push({ type: "same", text: `${pad}  "${k}": {` });
      lines.push(
        ...prettyLines(val, diffMap, side, otherVal, fullKey, indent + 2),
      );
      lines.push({ type: "same", text: `${pad}  }${comma}` });
    } else {
      if (!diffEntry) {
        lines.push({
          type: "same",
          text: `${pad}  "${k}": ${valStr(val)}${comma}`,
        });
      } else if (diffEntry.type === "changed") {
        const displayVal =
          side === "left" ? valStr(diffEntry.oldVal) : valStr(diffEntry.newVal);
        lines.push({
          type: "changed",
          text: `${pad}  "${k}": ${displayVal}${comma}`,
        });
      } else if (diffEntry.type === "removed") {
        if (side === "left") {
          lines.push({
            type: "removed",
            text: `${pad}  "${k}": ${valStr(diffEntry.val)}${comma}`,
          });
        } else {
          lines.push({
            type: "struck",
            text: `${pad}  "${k}": ${valStr(diffEntry.val)}${comma}`,
          });
        }
      } else if (diffEntry.type === "added") {
        if (side === "right") {
          lines.push({
            type: "added",
            text: `${pad}  "${k}": ${valStr(diffEntry.val)}${comma}`,
          });
        } else {
          lines.push({
            type: "empty",
            text: "",
          });
        }
      }
    }
  });

  return lines;
}
function CodeEditor({ value, onChange, placeholder }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        json(),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        // EditorView.theme({
        //   "&": {
        //     height: "160px",
        //     fontSize: "12px",
        //     borderRadius: "8px",
        //     overflow: "hidden",
        //   },
        //   ".cm-scroller": {
        //     overflow: "auto",
        //     fontFamily: "ui-monospace, monospace",
        //   },
        //   ".cm-content": { padding: "10px 0" },
        // }),
        EditorView.theme({
          "&": {
            height: "320px",
            fontSize: "12px",
            borderRadius: "8px",
            overflow: "hidden",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "ui-monospace, monospace",
          },
          ".cm-content": { padding: "10px 0" },
        }),
        EditorView.contentAttributes.of({ "data-placeholder": placeholder }),
      ],
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // sync external clears
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-gray-200 overflow-hidden h-80"
    />
  );
}

export default function JsonDiffTool() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runDiff();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [left, right]);

  function runDiff() {
    setError("");
    setResult(null);

    if (!left.trim() && !right.trim()) {
      setError("Paste JSON into both panels.");
      return;
    }

    const L = parseJSON(left || "{}");
    const R = parseJSON(right || "{}");

    if (!L.ok) {
      setError("Original: " + L.err);
      return;
    }
    if (!R.ok) {
      setError("Modified: " + R.err);
      return;
    }

    const lFlat = flattenKeys(L.val);
    const rFlat = flattenKeys(R.val);
    const allKeys = Array.from(
      new Set([...Object.keys(lFlat), ...Object.keys(rFlat)]),
    ).sort();

    let added = 0,
      removed = 0,
      changed = 0;
    const diffMap = {};

    for (const key of allKeys) {
      const inL = Object.prototype.hasOwnProperty.call(lFlat, key);
      const inR = Object.prototype.hasOwnProperty.call(rFlat, key);

      if (inL && inR) {
        if (JSON.stringify(lFlat[key]) !== JSON.stringify(rFlat[key])) {
          changed++;
          diffMap[key] = {
            type: "changed",
            oldVal: lFlat[key],
            newVal: rFlat[key],
          };
        }
      } else if (inL) {
        removed++;
        diffMap[key] = { type: "removed", val: lFlat[key] };
      } else {
        added++;
        diffMap[key] = { type: "added", val: rFlat[key] };
      }
    }

    // merge both objects for full key coverage
    const merged = { ...L.val, ...R.val };

    const leftLines = [
      { type: "same", text: "{" },
      ...prettyLines(L.val, diffMap, "left", R.val),
      { type: "same", text: "}" },
    ];

    const rightLines = [
      { type: "same", text: "{" },
      ...prettyLines(R.val, diffMap, "right", L.val),
      { type: "same", text: "}" },
    ];
    // pad shorter side with empty lines so both columns have equal row count
    const maxLen = Math.max(leftLines.length, rightLines.length);
    while (leftLines.length < maxLen)
      leftLines.push({ type: "empty", text: "" });
    while (rightLines.length < maxLen)
      rightLines.push({ type: "empty", text: "" });

    setResult({ added, removed, changed, leftLines, rightLines });
  }

  async function explainDiff() {
    if (!result) return;
    setExplaining(true);
    setExplanation("");

    const changes = [];

    result.leftLines.forEach((line, i) => {
      const rightLine = result.rightLines[i];
      if (line.type === "removed") {
        changes.push(`REMOVED: ${line.text.trim()}`);
      } else if (rightLine?.type === "added") {
        changes.push(`ADDED: ${rightLine.text.trim()}`);
      } else if (line.type === "changed") {
        changes.push(`CHANGED (original): ${line.text.trim()}`);
        changes.push(`CHANGED (modified): ${rightLine.text.trim()}`);
      }
    });

    const prompt = `You are a JSON diff analyzer. Given the following changes between two JSON objects, provide:

1. **Technical Summary** — a concise bullet list of every field-level change (use dot notation for nested keys).
2. **Plain English** — a short paragraph explaining what these changes mean in plain language, as if explaining to someone unfamiliar with the data structure.

Changes:
${changes.join("\n")}

Format your response exactly like this:
**Technical Summary**
- [bullet points]

**Plain English**
[paragraph]`;

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Request failed (${response.status}): ${details}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.replace("data: ", "").trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const text =
              parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) setExplanation((prev) => prev + text);
          } catch {}
        }
      }
    } catch (err) {
      setExplanation(`Failed to get explanation. ${err.message}`);
    } finally {
      setExplaining(false);
    }
  }
  function clearAll() {
    setLeft("");
    setRight("");
    setResult(null);
    setError("");
    setExplanation(null);
    setExplaining(false);
  }
  function beautify(side) {
    const value = side === "left" ? left : right;
    const setValue = side === "left" ? setLeft : setRight;
    const label = side === "left" ? "Original" : "Modified";

    if (!value.trim()) return;

    const parsed = parseJSON(value);
    if (!parsed.ok) {
      setError(`${label}: ${parsed.err}`);
      return;
    }

    setError("");
    setValue(JSON.stringify(parsed.val, null, 2));
  }

  const hasDiff = result && result.added + result.removed + result.changed > 0;

  return (
    <div
      className="min-h-screen p-6 font-sans"
      style={{ background: "#0d1117" }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div
          className="relative mb-8 rounded-2xl overflow-hidden"
          style={{ background: "#050810" }}
        >
          {/* Aurora blobs */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 320,
              height: 320,
              background: "#1a4a8a",
              filter: "blur(60px)",
              opacity: 0.8,
              top: 20,
              left: 40,
              animation: "drift1 16s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 280,
              height: 280,
              background: "#0d5c3a",
              filter: "blur(60px)",
              opacity: 0.8,
              top: 60,
              right: 80,
              animation: "drift2 20s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 260,
              height: 260,
              background: "#2d1060",
              filter: "blur(60px)",
              opacity: 0.8,
              bottom: 40,
              left: 180,
              animation: "drift3 24s ease-in-out infinite",
            }}
          />

          {/* Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 30%, rgba(5,8,16,0.6) 100%)",
            }}
          />

          {/* Content */}
          <div className="relative z-10 px-8 py-8">
            <div className="flex items-start justify-between mb-6">
              {/* Title group */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "#38bdf8",
                      animation: "pulse-dot 2s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="text-[11px] font-medium tracking-widest uppercase"
                    style={{ color: "#38bdf8" }}
                  >
                    Developer tool
                  </span>
                </div>
                <h1
                  className="text-4xl font-semibold tracking-tight leading-none"
                  style={{ color: "#f0f6fc" }}
                >
                  JSON <span style={{ color: "#38bdf8" }}>Diff</span>
                </h1>
                <p className="text-sm mt-2" style={{ color: "#8b949e" }}>
                  Paste two objects. See exactly what changed, key by key.
                </p>
              </div>

              {/* Validity chips */}
              <div className="flex flex-col gap-2 mt-1">
                {[
                  { label: "original.json", value: left },
                  { label: "modified.json", value: right },
                ].map(({ label, value }) => {
                  const isEmpty = !value.trim();
                  const isValid = !isEmpty && parseJSON(value).ok;
                  return (
                    <div
                      key={label}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "0.5px solid rgba(255,255,255,0.1)",
                        color: "#8b949e",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{
                          background: isEmpty
                            ? "#3d444d"
                            : isValid
                              ? "#3fb950"
                              : "#f85149",
                          boxShadow: isValid
                            ? "0 0 6px rgba(63,185,80,0.7)"
                            : isEmpty
                              ? "none"
                              : "0 0 6px rgba(248,81,73,0.7)",
                          transition: "background 0.3s, box-shadow 0.3s",
                        }}
                      />
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Compare button with tooltip */}
              <div className="relative group">
                <button
                  onClick={runDiff}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ background: "#1f6feb" }}
                >
                  ⇄ Compare
                </button>
                {/* Tooltip */}
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                  style={{
                    background: "#161b22",
                    border: "0.5px solid #30363d",
                    color: "#8b949e",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ⌘ Enter
                  {/* Arrow */}
                  <div
                    className="absolute top-full left-1/2 -translate-x-1/2"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: "5px solid #30363d",
                    }}
                  />
                </div>
              </div>
              <button
                onClick={clearAll}
                className="px-4 py-2 rounded-lg text-sm cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  color: "#8b949e",
                }}
              >
                Clear
              </button>
              {error && (
                <span className="text-sm" style={{ color: "#f85149" }}>
                  {error}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Input panels */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            {
              side: "left",
              label: "Original",
              value: left,
              onChange: setLeft,
              placeholder: '{"name": "Alice"}',
            },
            {
              side: "right",
              label: "Modified",
              value: right,
              onChange: setRight,
              placeholder: '{"name": "Alice", "active": true}',
            },
          ].map(({ side, label, value, onChange, placeholder }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="text-xs font-medium tracking-wide uppercase"
                  style={{ color: "#8b949e" }}
                >
                  {label}
                </label>
                <button
                  onClick={() => beautify(side)}
                  disabled={!value.trim()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    background: "rgba(56,189,248,0.08)",
                    border: "0.5px solid rgba(56,189,248,0.2)",
                    color: "#38bdf8",
                  }}
                >
                  ✦ Beautify
                </button>
              </div>
              <CodeEditor
                value={value}
                onChange={onChange}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        {/* Summary bar */}
        {result && (
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <span className="text-xs mr-1" style={{ color: "#6e7681" }}>
              Changes
            </span>
            {result.added > 0 && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-green-100 text-green-700">
                + {result.added} added
              </span>
            )}
            {result.removed > 0 && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-red-100 text-red-600">
                − {result.removed} removed
              </span>
            )}
            {result.changed > 0 && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
                ~ {result.changed} changed
              </span>
            )}
            {!hasDiff && (
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                ✓ No differences
              </span>
            )}
          </div>
        )}

        {/* Diff view */}
        {hasDiff && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "0.5px solid #30363d" }}
          >
            {/* Diff column headers */}
            <div
              className="grid grid-cols-2"
              style={{ borderBottom: "0.5px solid #30363d" }}
            >
              {["Original", "Modified"].map((label, i) => (
                <div
                  key={label}
                  className="text-[11px] font-medium uppercase tracking-widest px-4 py-2.5"
                  style={{
                    background: "#0d1117",
                    color: "#6e7681",
                    borderLeft: i === 1 ? "0.5px solid #30363d" : "none",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Diff columns */}
            <div className="grid grid-cols-2">
              {[{ lines: result.leftLines }, { lines: result.rightLines }].map(
                ({ lines }, colIdx) => (
                  <div
                    key={colIdx}
                    className="overflow-x-auto"
                    style={{
                      borderLeft: colIdx === 1 ? "0.5px solid #30363d" : "none",
                      background: "#0d1117",
                    }}
                  >
                    {lines.map((line, i) => (
                      <DiffLine key={i} {...line} lineNumber={i + 1} />
                    ))}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
        {/* Explain with AI button */}
        {hasDiff && !explanation && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={explainDiff}
              disabled={explaining}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: explaining
                  ? "rgba(56,189,248,0.08)"
                  : "rgba(56,189,248,0.1)",
                border: "0.5px solid rgba(56,189,248,0.25)",
                color: "#38bdf8",
              }}
            >
              {explaining ? (
                <>
                  <span
                    className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                    style={{
                      borderColor: "#38bdf8",
                      borderTopColor: "transparent",
                    }}
                  />
                  Analyzing...
                </>
              ) : (
                <>✦ Explain with AI</>
              )}
            </button>
          </div>
        )}

        {/* AI Explanation panel */}
        {explanation !== null && (
          <div
            className="mt-4 rounded-xl p-5"
            style={{
              background: "#0d1117",
              border: "0.5px solid #30363d",
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(56,189,248,0.1)",
                    border: "0.5px solid rgba(56,189,248,0.2)",
                    color: "#38bdf8",
                  }}
                >
                  ✦ AI
                </span>
                <span
                  className="text-xs font-medium"
                  style={{ color: "#8b949e" }}
                >
                  Diff Explanation
                </span>
              </div>
              <button
                onClick={() => setExplanation(null)}
                className="text-xs px-2 py-1 rounded cursor-pointer"
                style={{ color: "#6e7681" }}
              >
                ✕ Close
              </button>
            </div>

            {/* Explanation text */}
            <div
              className="text-sm leading-7 whitespace-pre-wrap"
              style={{ color: "#e6edf3", fontFamily: "var(--font-sans)" }}
            >
              {explanation.split(/(\*\*.*?\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i} style={{ color: "#f0f6fc" }}>
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </div>

            {/* Re-explain button */}
            {!explaining && (
              <button
                onClick={explainDiff}
                className="mt-4 text-xs"
                style={{ color: "#6e7681" }}
              >
                ↺ Re-explain
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
