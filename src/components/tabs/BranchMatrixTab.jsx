import React, { useState, useMemo } from 'react';

const BranchMatrixTab = ({ ast }) => {
  const [selectedBranch, setSelectedBranch] = useState('main');

  // Collect all branches from AST + defaults
  const branches = useMemo(() => {
    const defaultBranches = ['main', 'develop', 'staging', 'feature/my-feature', 'hotfix/urgent-fix', 'release/v1.0'];
    const found = new Set(defaultBranches);

    if (!ast) return defaultBranches;

    const scanStages = (stages) => {
      if (!stages) return;
      for (const stage of stages) {
        if (stage.when && stage.when.type === 'branch' && stage.when.value) {
          found.add(stage.when.value);
        }
        if (stage.parallel) {
          scanStages(stage.parallel);
        }
      }
    };
    scanStages(ast.stages || []);
    return Array.from(found);
  }, [ast]);

  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 gap-4">
        <svg className="w-16 h-16 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg">Parse a Jenkinsfile to view the branch matrix</p>
      </div>
    );
  }

  const stages = ast.stages || [];

  // Match branch pattern (supports exact and glob like 'feature/*')
  function matchBranch(pattern, branch) {
    if (!pattern) return false;
    if (pattern === branch) return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return branch.startsWith(prefix + '/');
    }
    // Try regex-ish glob
    const regexStr = pattern.replace(/\*/g, '.*');
    try {
      return new RegExp(`^${regexStr}$`).test(branch);
    } catch {
      return false;
    }
  }

  // Evaluate a stage against the selected branch
  function evaluateStage(stage) {
    // No when block → always runs
    if (!stage.when) {
      return { status: 'always', reason: 'Always Active' };
    }

    const when = stage.when;

    if (when.type === 'branch') {
      if (matchBranch(when.value, selectedBranch)) {
        return { status: 'active', reason: `Matches '${when.value}'` };
      } else {
        return { status: 'skipped', reason: `Skipped on ${selectedBranch}` };
      }
    }

    if (when.type === 'expression') {
      return { status: 'conditional', reason: 'Expression condition' };
    }

    // Unknown when type
    return { status: 'conditional', reason: `Condition: ${when.type}` };
  }

  // Count active stages
  let activeCount = 0;
  let totalCount = 0;

  function countStages(stageList) {
    for (const stage of stageList) {
      if (stage.parallel) {
        countStages(stage.parallel);
      }
      totalCount++;
      const result = evaluateStage(stage);
      if (result.status !== 'skipped') activeCount++;
    }
  }
  countStages(stages);

  const getBadge = (status, text) => {
    const styles = {
      always: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      active: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
      skipped: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
      conditional: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    };
    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${styles[status] || styles.conditional}`}>
        {text}
      </span>
    );
  };

  const renderStageCard = (stage, i) => {
    const evalResult = evaluateStage(stage);
    const isDimmed = evalResult.status === 'skipped';

    return (
      <div
        key={`${stage.name}-${i}`}
        className={`group p-4 rounded-xl border transition-all duration-300 ${
          isDimmed
            ? 'opacity-30 border-slate-800/50 bg-slate-900/30'
            : 'opacity-100 border-slate-700/80 bg-slate-800/60 shadow-md hover:shadow-lg hover:border-slate-600'
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            {stage.parallel && (
              <span className="text-purple-400 text-sm">⑆</span>
            )}
            <h3 className="font-mono text-slate-200 font-bold text-sm">{stage.name}</h3>
          </div>
          {getBadge(evalResult.status, evalResult.reason)}
        </div>

        {/* Steps preview */}
        {stage.steps && stage.steps.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-700/30">
            <div className="flex flex-wrap gap-1.5">
              {stage.steps.slice(0, 4).map((step, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-slate-900/80 rounded text-xs text-slate-400 font-mono">
                  {step.type}
                </span>
              ))}
              {stage.steps.length > 4 && (
                <span className="px-2 py-0.5 text-xs text-slate-500">+{stage.steps.length - 4} more</span>
              )}
            </div>
          </div>
        )}

        {/* Parallel sub-stages */}
        {stage.parallel && (
          <div className="mt-3 pt-3 border-t border-slate-700/40">
            <span className="text-xs text-purple-400 uppercase font-semibold mb-2 block tracking-wider">Parallel Branches</span>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {stage.parallel.map((pStage, idx) => {
                const pEval = evaluateStage(pStage);
                const pDimmed = pEval.status === 'skipped';
                return (
                  <div
                    key={idx}
                    className={`bg-slate-900/60 rounded-lg px-3 py-2 border transition-all ${
                      pDimmed ? 'opacity-30 border-slate-800/50' : 'border-purple-500/20'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-mono text-sm text-slate-300 truncate">{pStage.name}</span>
                      {getBadge(pEval.status, pEval.status === 'always' ? '✓' : pEval.reason)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* When condition details */}
        {stage.when && !isDimmed && (
          <div className="mt-2 text-xs text-slate-500">
            <span className="text-slate-600">Condition: </span>
            <span className="font-mono">
              {stage.when.type === 'branch' ? `branch '${stage.when.value}'` : stage.when.raw || stage.when.value}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Branch Selector & Summary */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 p-4 border-b border-slate-800 bg-slate-900/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
            </svg>
            Simulate Branch
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-cyan-300 text-sm rounded-lg focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 block p-2.5 outline-none transition-colors"
          >
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/60 px-4 py-2 rounded-lg border border-slate-700/50">
          <span className="text-cyan-400 font-bold text-xl">{activeCount}</span>
          <span className="text-slate-400 text-sm">of</span>
          <span className="text-slate-300 font-bold text-xl">{totalCount}</span>
          <span className="text-slate-400 text-sm">stages active on</span>
          <span className="font-mono text-cyan-200 bg-cyan-500/10 px-2 py-0.5 rounded text-sm border border-cyan-500/20">
            {selectedBranch}
          </span>
        </div>
      </div>

      {/* Stages Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-3 max-w-5xl mx-auto">
          {stages.map((stage, i) => renderStageCard(stage, i))}
        </div>
      </div>
    </div>
  );
};

export default BranchMatrixTab;
