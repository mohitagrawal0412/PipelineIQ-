import React from 'react';

const InspectorDrawer = ({ stage, onClose }) => {
  if (!stage) return null;

  const hasOptions = stage.options && (
    (Array.isArray(stage.options) && stage.options.length > 0) ||
    (!Array.isArray(stage.options) && Object.keys(stage.options).length > 0)
  );

  return (
    <div className="fixed top-0 right-0 h-full w-[420px] bg-slate-900 border-l border-slate-700/80 shadow-2xl drawer-enter overflow-y-auto z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full bg-cyan-500 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
          <h2 className="text-lg font-bold text-slate-100 truncate">{stage.name || 'Unnamed Stage'}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors p-1.5 hover:bg-slate-800 rounded-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 flex-1 space-y-5">
        {/* Source Code */}
        {stage.sourceCode && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="text-cyan-400">{'</>'}</span> Source Code
            </h3>
            <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-auto max-h-[300px]">
              <pre className="p-3 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                {stage.sourceCode}
              </pre>
            </div>
          </section>
        )}

        {/* Agent / Container */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            🐳 Agent / Container
          </h3>
          {stage.agent ? (
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/60">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/25">
                  {stage.agent.type || 'custom'}
                </span>
                {stage.agent.image && (
                  <code className="text-sm text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded font-mono">
                    {stage.agent.image}
                  </code>
                )}
                {stage.agent.label && (
                  <code className="text-sm text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded font-mono">
                    {stage.agent.label}
                  </code>
                )}
              </div>
              {stage.agent.args && (
                <div className="mt-2 text-xs text-slate-500 font-mono">
                  args: {stage.agent.args}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-600 italic bg-slate-800/30 rounded-lg p-3 border border-slate-800/50">
              Inherits global agent
            </div>
          )}
        </section>

        {/* Options */}
        {hasOptions && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              ⚙ Options
            </h3>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/60 space-y-2">
              {Array.isArray(stage.options)
                ? stage.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-amber-400 font-semibold">{opt.name}:</span>
                      <span className="text-slate-300 font-mono text-xs">{opt.value || '()'}</span>
                    </div>
                  ))
                : Object.entries(stage.options).map(([key, value], i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-amber-400 font-semibold">{key}:</span>
                      <span className="text-slate-300 font-mono text-xs">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                    </div>
                  ))}
            </div>
          </section>
        )}

        {/* Conditions (when) */}
        {stage.when && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              🔀 Conditions
            </h3>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/60">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                  stage.when.type === 'branch'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                }`}>
                  {stage.when.type}
                </span>
              </div>
              <code className="text-sm text-slate-300 font-mono">
                {stage.when.type === 'branch'
                  ? `branch '${stage.when.value}'`
                  : stage.when.value || stage.when.raw || JSON.stringify(stage.when)}
              </code>
            </div>
          </section>
        )}

        {/* Steps */}
        {stage.steps && stage.steps.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              ▶ Steps ({stage.steps.length})
            </h3>
            <div className="space-y-1.5">
              {stage.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 bg-slate-800/40 rounded-lg p-2 border border-slate-800/60">
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                    {step.type}
                  </span>
                  <span className="text-xs text-slate-400 font-mono truncate" title={step.command || step.raw}>
                    {step.command || step.raw || ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Post Actions */}
        {stage.post && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              📋 Post Actions
            </h3>
            <div className="space-y-2">
              {Object.entries(stage.post).map(([condition, steps], i) => {
                const colorMap = {
                  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
                  failure: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
                  always: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
                  unstable: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
                  cleanup: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
                };
                const badgeClass = colorMap[condition] || colorMap.always;

                return (
                  <div key={i} className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/40">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border mb-2 ${badgeClass}`}>
                      {condition}
                    </span>
                    <ul className="space-y-1 ml-1">
                      {Array.isArray(steps)
                        ? steps.map((step, idx) => (
                            <li key={idx} className="text-xs text-slate-400 font-mono flex items-start gap-1.5">
                              <span className="text-slate-600">•</span>
                              <span>{step.type}: {step.command || step.raw || ''}</span>
                            </li>
                          ))
                        : <li className="text-xs text-slate-400 font-mono">{JSON.stringify(steps)}</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default InspectorDrawer;
