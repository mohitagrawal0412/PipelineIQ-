import React from 'react';
import Editor from '@monaco-editor/react';

const CodeEditor = ({ value, onChange, height = '100%' }) => {
  return (
    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-slate-700/60 shadow-xl bg-slate-900">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs font-mono text-cyan-400 tracking-wider ml-2">Jenkinsfile</span>
        </div>
        <span className="text-xs text-slate-500">Paste or edit your pipeline here</span>
      </div>

      {/* Editor */}
      <div className="flex-1 relative min-h-0">
        <Editor
          height={height}
          defaultLanguage="groovy"
          language="groovy"
          theme="vs-dark"
          value={value}
          onChange={onChange}
          loading={
            <div className="flex items-center justify-center w-full h-full bg-slate-900 min-h-[300px]">
              <div className="animate-pulse flex flex-col items-center">
                <div className="h-8 w-8 bg-cyan-500/40 rounded-full mb-3 animate-spin" />
                <div className="text-slate-400 text-sm font-mono">Loading Editor...</div>
              </div>
            </div>
          }
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'all',
            lineNumbersMinChars: 3,
            folding: true,
            lineHeight: 20,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
