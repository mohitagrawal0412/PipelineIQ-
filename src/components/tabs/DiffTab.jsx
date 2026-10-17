import React, { useState, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { parseJenkinsfile } from '../../parser/jenkinsfileParser';

function matchBranch(pattern, branch) {
  if (!pattern) return false;
  if (pattern === branch) return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return branch.startsWith(prefix + '/');
  }
  const regexStr = pattern.replace(/\*/g, '.*');
  try {
    return new RegExp(`^${regexStr}$`).test(branch);
  } catch {
    return false;
  }
}

function flattenStages(stages) {
  const result = [];
  if (!stages) return result;
  for (const stage of stages) {
    result.push(stage);
    if (stage.parallel) {
      result.push(...flattenStages(stage.parallel));
    }
  }
  return result;
}

function diffStages(stagesA, stagesB) {
  const result = [];
  const allNames = new Set([
    ...stagesA.map((s) => s.name),
    ...stagesB.map((s) => s.name),
  ]);

  for (const name of allNames) {
    const inA = stagesA.find((s) => s.name === name);
    const inB = stagesB.find((s) => s.name === name);
    if (inA && inB) {
      const stepsA = JSON.stringify(inA.steps);
      const stepsB = JSON.stringify(inB.steps);
      result.push({
        name,
        status: stepsA === stepsB ? 'unchanged' : 'modified',
        left: inA,
        right: inB,
      });
    } else if (inA) {
      result.push({ name, status: 'removed', left: inA, right: null });
    } else {
      result.push({ name, status: 'added', left: null, right: inB });
    }
  }
  return result;
}

export default function DiffTab({ ast, currentSource }) {
  const [mode, setMode] = useState('file');

  // Mode A state
  const [compareSource, setCompareSource] = useState('');
  const [compareAst, setCompareAst] = useState(null);
  const [hasCompared, setHasCompared] = useState(false);
  const [parseError, setParseError] = useState('');

  // Mode B state
  const [branchA, setBranchA] = useState('main');
  const [branchB, setBranchB] = useState('develop');

  const baseStages = useMemo(() => flattenStages(ast?.stages), [ast]);

  const handleCompare = () => {
    try {
      setParseError('');
      const parsed = parseJenkinsfile(compareSource);
      setCompareAst(parsed);
      setHasCompared(true);
    } catch (err) {
      setParseError(err.message || 'Failed to parse Jenkinsfile');
    }
  };

  const fileDiffResult = useMemo(() => {
    if (!hasCompared || !compareAst) return [];
    return diffStages(baseStages, flattenStages(compareAst.stages));
  }, [baseStages, compareAst, hasCompared]);

  const branches = useMemo(() => {
    const defaults = ['main', 'develop', 'staging', 'feature/my-feature', 'release/v1.0', 'hotfix/urgent-fix'];
    const found = new Set(defaults);
    for (const stage of baseStages) {
      if (stage.when?.type === 'branch' && stage.when.value) {
        found.add(stage.when.value);
      }
    }
    return Array.from(found);
  }, [baseStages]);

  const getActiveStagesForBranch = (branch) => {
    return baseStages.filter((stage) => {
      if (!stage.when) return true;
      if (stage.when.type === 'branch') {
        return matchBranch(stage.when.value, branch);
      }
      return true; // non-branch conditions: assume active
    });
  };

  const branchDiffResult = useMemo(() => {
    const stagesA = getActiveStagesForBranch(branchA);
    const stagesB = getActiveStagesForBranch(branchB);
    return diffStages(stagesA, stagesB);
  }, [branchA, branchB, baseStages]);

  const renderStepsList = (steps) => {
    if (!steps || steps.length === 0) return <p className="text-slate-600 text-xs italic">No steps</p>;
    return (
      <ul className="space-y-1 mt-2">
        {steps.map((step, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <span className="font-mono text-cyan-400 text-xs bg-cyan-500/10 px-1.5 py-0.5 rounded shrink-0">
              {step.type || '?'}
            </span>
            <span className="text-slate-400 truncate text-xs font-mono">{step.command || step.raw || ''}</span>
          </li>
        ))}
      </ul>
    );
  };

  const getStatusBg = (status) => {
    const map = {
      added: 'bg-emerald-500/10 border-emerald-500/30',
      removed: 'bg-rose-500/10 border-rose-500/30',
      modified: 'bg-amber-500/10 border-amber-500/30',
      unchanged: 'bg-slate-800/50 border-slate-700/50',
    };
    return map[status] || map.unchanged;
  };

  const getBadge = (status) => {
    const map = {
      added: { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: '+ Added' },
      removed: { bg: 'bg-rose-500/20 text-rose-400 border-rose-500/30', label: '− Removed' },
      modified: { bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: '~ Modified' },
    };
    if (!map[status]) return null;
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${map[status].bg}`}>
        {map[status].label}
      </span>
    );
  };

  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 gap-4">
        <svg className="w-16 h-16 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-lg">Parse a Jenkinsfile first to use the comparison engine.</p>
      </div>
    );
  }

  const currentDiff = mode === 'file' ? fileDiffResult : branchDiffResult;
  const counts = {
    added: currentDiff.filter((d) => d.status === 'added').length,
    removed: currentDiff.filter((d) => d.status === 'removed').length,
    modified: currentDiff.filter((d) => d.status === 'modified').length,
  };
  const showDiffSummary = mode === 'branch' || (mode === 'file' && hasCompared);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Controls */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/30 backdrop-blur-sm flex flex-col gap-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          {/* Mode Toggle */}
          <div className="inline-flex bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setMode('file')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'file'
                  ? 'bg-cyan-500/15 text-cyan-400 shadow-sm border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Compare Two Jenkinsfiles
            </button>
            <button
              onClick={() => setMode('branch')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'branch'
                  ? 'bg-cyan-500/15 text-cyan-400 shadow-sm border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Compare Branch Contexts
            </button>
          </div>

          {/* Diff Summary Badges */}
          {showDiffSummary && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-300 font-medium">{counts.added}</span>
                <span className="text-slate-500">additions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-300 font-medium">{counts.removed}</span>
                <span className="text-slate-500">removals</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-300 font-medium">{counts.modified}</span>
                <span className="text-slate-500">modifications</span>
              </div>
            </div>
          )}
        </div>

        {/* Branch selectors for Mode B */}
        {mode === 'branch' && (
          <div className="flex gap-4 items-end p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Branch A</label>
              <select
                value={branchA}
                onChange={(e) => setBranchA(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 p-2.5 outline-none"
              >
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-center text-slate-600 pb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Branch B</label>
              <select
                value={branchB}
                onChange={(e) => setBranchB(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 p-2.5 outline-none"
              >
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Mode A: File comparison before comparing */}
        {mode === 'file' && !hasCompared ? (
          <div className="flex-1 flex gap-0 h-full">
            {/* Left: Base pipeline */}
            <div className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
              <div className="bg-slate-900/60 p-3 text-sm font-semibold text-slate-300 border-b border-slate-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                Current Parsed Pipeline
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {baseStages.map((stage, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                    <h4 className="font-semibold text-slate-200 text-sm">{stage.name}</h4>
                    {renderStepsList(stage.steps)}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Second Jenkinsfile editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-slate-900/60 p-3 text-sm font-semibold border-b border-slate-800 flex justify-between items-center">
                <span className="text-slate-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  Paste Second Jenkinsfile
                </span>
                <button
                  onClick={handleCompare}
                  disabled={!compareSource.trim()}
                  className="px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  ⚡ Run Compare
                </button>
              </div>
              {parseError && (
                <div className="p-2.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-sm font-medium">
                  ⚠ {parseError}
                </div>
              )}
              <div className="flex-1 relative">
                <Editor
                  height="100%"
                  defaultLanguage="groovy"
                  theme="vs-dark"
                  value={compareSource}
                  onChange={(val) => setCompareSource(val || '')}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    wordWrap: 'on',
                    padding: { top: 12 },
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Diff results view (both modes) */
          <div className="flex-1 overflow-auto p-4">
            {mode === 'file' && (
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-200">Structural Diff Results</h3>
                <button
                  onClick={() => {
                    setHasCompared(false);
                    setCompareAst(null);
                  }}
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                >
                  ← New Comparison
                </button>
              </div>
            )}

            {/* Column headers */}
            <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
              <div>{mode === 'file' ? 'Base Pipeline' : `Branch: ${branchA}`}</div>
              <div>{mode === 'file' ? 'Compared Pipeline' : `Branch: ${branchB}`}</div>
            </div>

            {/* Diff rows */}
            <div className="space-y-3">
              {currentDiff.map((diff, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-4">
                  {/* Left */}
                  <div
                    className={`p-4 border rounded-xl transition-all ${
                      diff.status === 'added'
                        ? 'opacity-20 bg-slate-900/20 border-slate-800/30'
                        : getStatusBg(diff.status === 'removed' ? 'removed' : diff.status === 'modified' ? 'modified' : 'unchanged')
                    }`}
                  >
                    {diff.left ? (
                      <>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-sm text-slate-200">{diff.left.name}</h4>
                          {(diff.status === 'removed' || diff.status === 'modified') && getBadge(diff.status)}
                        </div>
                        {renderStepsList(diff.left.steps)}
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-16 text-slate-600 italic text-sm">
                        Not present
                      </div>
                    )}
                  </div>

                  {/* Right */}
                  <div
                    className={`p-4 border rounded-xl transition-all ${
                      diff.status === 'removed'
                        ? 'opacity-20 bg-slate-900/20 border-slate-800/30'
                        : getStatusBg(diff.status === 'added' ? 'added' : diff.status === 'modified' ? 'modified' : 'unchanged')
                    }`}
                  >
                    {diff.right ? (
                      <>
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-sm text-slate-200">{diff.right.name}</h4>
                          {(diff.status === 'added' || diff.status === 'modified') && getBadge(diff.status)}
                        </div>
                        {renderStepsList(diff.right.steps)}
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-16 text-slate-600 italic text-sm">
                        Not present
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {currentDiff.length === 0 && (
                <div className="text-center py-16 text-slate-500 bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
                  <p className="text-lg mb-1">No differences found</p>
                  <p className="text-sm text-slate-600">
                    {mode === 'file' ? 'Both pipelines have identical stage structures.' : 'Both branches execute the same stages.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
