import React, { useMemo, useState } from 'react';

const SEVERITY_CONFIG = {
  high: {
    color: '#fb7185',
    bg: 'rgba(251,113,133,0.08)',
    border: 'rgba(251,113,133,0.25)',
    glow: 'rgba(251,113,133,0.15)',
    icon: '🚨',
    label: 'Critical',
  },
  medium: {
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.25)',
    glow: 'rgba(251,191,36,0.15)',
    icon: '⚠️',
    label: 'Warning',
  },
  low: {
    color: '#22d3ee',
    bg: 'rgba(34,211,238,0.08)',
    border: 'rgba(34,211,238,0.25)',
    glow: 'rgba(34,211,238,0.15)',
    icon: '💡',
    label: 'Info',
  },
};

const LinterTab = ({ ast }) => {
  const [filter, setFilter] = useState('all');
  const [expandedIdx, setExpandedIdx] = useState(null);

  const issues = useMemo(() => {
    if (!ast) return [];

    const foundIssues = [];

    const addIssue = (severity, title, description, stageName = 'Global', recommendation = '') => {
      foundIssues.push({ severity, title, description, stageName, recommendation });
    };

    // 1. Check for `agent any`
    if (ast.agent && ast.agent.type === 'any') {
      addIssue('high', 'Use of `agent any`',
        'The pipeline uses `agent any` globally. In production, this can lead to builds running on unpredictable nodes.',
        'Global',
        'Use specific Docker images or labeled nodes: agent { docker { image "node:18" } }');
    }

    const scanStages = (stages) => {
      if (!stages) return;

      for (const stage of stages) {
        if (stage.agent && stage.agent.type === 'any') {
          addIssue('high', 'Use of `agent any`',
            'This stage uses `agent any`. Specify a dedicated agent to ensure isolated and repeatable builds.',
            stage.name,
            'Define a specific agent for this stage or inherit from the pipeline-level agent.');
        }

        let hasTimeout = false;
        if (ast.options && ast.options.find(o => o.name === 'timeout')) hasTimeout = true;
        if (stage.options && stage.options.find(o => o.name === 'timeout')) hasTimeout = true;

        if (!hasTimeout && !stage.parallel) {
          addIssue('medium', 'Missing Timeout',
            'No timeout specified for this stage or globally. Hung processes could block CI runners indefinitely.',
            stage.name,
            'Add timeout(time: 30, unit: "MINUTES") in the stage options or pipeline options block.');
        }

        const secretRegex = /(password|secret|token|key|pwd|api_key)['"']?\s*[:=]\s*['"][a-zA-Z0-9]+['"]/i;
        if (stage.steps) {
          for (const step of stage.steps) {
            if (secretRegex.test(step.raw)) {
              addIssue('high', 'Potential Hardcoded Secret',
                `A potential hardcoded secret was found: \`${step.raw.substring(0, 50)}...\``,
                stage.name,
                'Use Jenkins Credentials binding: withCredentials([string(credentialsId: "my-secret", variable: "SECRET")]) { ... }');
            }

            if (step.type === 'sh' && step.command && step.command.includes('curl ') && !step.command.includes('-f') && !step.command.includes('--fail')) {
              addIssue('low', 'Unsafe Curl Command',
                `The \`curl\` command doesn't use \`--fail\`. HTTP errors (4xx/5xx) will silently succeed.`,
                stage.name,
                'Add the -f or --fail flag: curl -fsSL https://example.com');
            }
          }
        }

        if (stage.parallel) {
          scanStages(stage.parallel);
        }
      }
    };

    scanStages(ast.stages);
    return foundIssues;
  }, [ast]);

  // Empty state
  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-20 h-20 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <span className="text-4xl opacity-30">🛡️</span>
        </div>
        <p className="text-slate-500 text-sm font-medium">Parse a Jenkinsfile to run the Security Linter</p>
      </div>
    );
  }

  const high = issues.filter(i => i.severity === 'high');
  const medium = issues.filter(i => i.severity === 'medium');
  const low = issues.filter(i => i.severity === 'low');
  const filteredIssues = filter === 'all' ? issues : issues.filter(i => i.severity === filter);

  const totalScore = Math.max(0, 100 - (high.length * 20) - (medium.length * 8) - (low.length * 2));
  const scoreColor = totalScore >= 80 ? '#34d399' : totalScore >= 50 ? '#fbbf24' : '#fb7185';

  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-950">
      {/* ── Top Bar: Score + Filter Cards ── */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/60 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-6">

          {/* Score Ring */}
          <div className="flex-shrink-0 relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke={scoreColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(totalScore / 100) * 213.6} 213.6`}
                style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.3s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black" style={{ color: scoreColor }}>{totalScore}</span>
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Score</span>
            </div>
          </div>

          {/* Severity Filter Cards */}
          <div className="flex gap-2 flex-1">
            {[
              { key: 'all', count: issues.length, label: 'All Issues', color: '#94a3b8' },
              { key: 'high', count: high.length, label: 'Critical', color: SEVERITY_CONFIG.high.color },
              { key: 'medium', count: medium.length, label: 'Warning', color: SEVERITY_CONFIG.medium.color },
              { key: 'low', count: low.length, label: 'Info', color: SEVERITY_CONFIG.low.color },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setFilter(filter === item.key ? 'all' : item.key)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer"
                style={{
                  background: filter === item.key ? `${item.color}11` : 'transparent',
                  borderColor: filter === item.key ? `${item.color}55` : 'rgba(51,65,85,0.4)',
                  boxShadow: filter === item.key ? `0 0 15px ${item.color}20` : 'none',
                }}
              >
                <span className="text-2xl font-black" style={{ color: item.color }}>{item.count}</span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: `${item.color}99` }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Issues List ── */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div className="text-6xl mb-5">✅</div>
              <h3 className="text-2xl font-black text-emerald-400 mb-2">Clean Pipeline</h3>
              <p className="text-emerald-500/60 text-sm max-w-md text-center">
                Your Jenkinsfile follows all best practices tracked by the linter. Excellent work!
              </p>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              No <span className="font-bold">{filter}</span> severity issues found.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map((issue, idx) => {
                const cfg = SEVERITY_CONFIG[issue.severity];
                const isExpanded = expandedIdx === idx;

                return (
                  <div
                    key={idx}
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
                    style={{
                      background: isExpanded ? cfg.bg : 'rgba(15,23,42,0.6)',
                      border: `1px solid ${isExpanded ? cfg.border : 'rgba(51,65,85,0.4)'}`,
                      boxShadow: isExpanded ? `0 0 20px ${cfg.glow}` : 'none',
                    }}
                  >
                    {/* Severity accent bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ background: cfg.color }}
                    />

                    {/* Main row */}
                    <div className="flex items-center gap-4 px-5 py-4 pl-6">
                      <span className="text-2xl flex-shrink-0">{cfg.icon}</span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-bold text-slate-100 truncate">
                            {issue.title.split('`').map((part, i) =>
                              i % 2 === 1 ? <code key={i} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700/50">{part}</code> : part
                            )}
                          </h3>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 truncate">
                          {issue.description.split('`').map((part, i) =>
                            i % 2 === 1 ? <code key={i} className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">{part}</code> : part
                          )}
                        </p>
                      </div>

                      {/* Tags */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-800/80 border border-slate-700/50 text-slate-300">
                          {issue.stageName}
                        </span>
                        <span
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
                          style={{
                            background: cfg.bg,
                            border: `1px solid ${cfg.border}`,
                            color: cfg.color,
                          }}
                        >
                          {cfg.label}
                        </span>
                        <svg
                          className="w-4 h-4 text-slate-500 transition-transform duration-300"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && issue.recommendation && (
                      <div className="px-6 pb-4 pl-16 animate-[fadeIn_0.2s_ease-out]">
                        <div
                          className="rounded-lg p-4"
                          style={{
                            background: 'rgba(15,23,42,0.6)',
                            border: `1px solid ${cfg.border}`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-black uppercase tracking-wider" style={{ color: cfg.color }}>
                              Recommendation
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 font-mono leading-relaxed">
                            {issue.recommendation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinterTab;
