import React, { useState, useMemo } from 'react';
import { extractBranches } from '../../parser/jenkinsfileParser';

/**
 * Generates a full HTML report from the AST and opens it in a new tab
 * where the user can use the browser's Print → Save as PDF.
 */
const ExportReportTab = ({ ast, currentSource }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSections, setSelectedSections] = useState({
    overview: true,
    stages: true,
    linter: true,
    environment: true,
    parameters: true,
    timeline: true,
  });

  const toggleSection = (key) => {
    setSelectedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Linter issues
  const linterIssues = useMemo(() => {
    if (!ast) return [];
    const issues = [];
    const add = (sev, title, desc, stage = 'Global') => issues.push({ sev, title, desc, stage });

    if (ast.agent && ast.agent.type === 'any') {
      add('HIGH', 'Use of agent any', 'Pipeline uses agent any globally.', 'Global');
    }
    const scan = (stages) => {
      if (!stages) return;
      for (const s of stages) {
        if (s.agent && s.agent.type === 'any') add('HIGH', 'Use of agent any', 'Stage uses agent any.', s.name);
        let hasTimeout = ast.options?.find(o => o.name === 'timeout');
        if (!hasTimeout && !s.parallel) add('MEDIUM', 'Missing Timeout', 'No timeout specified.', s.name);
        if (s.parallel) scan(s.parallel);
      }
    };
    scan(ast.stages);
    return issues;
  }, [ast]);

  const branches = useMemo(() => ast ? extractBranches(ast) : [], [ast]);

  const stageCount = ast?.stages?.length || 0;
  const envCount = ast?.environment ? Object.keys(ast.environment).length : 0;
  const paramCount = ast?.parameters?.length || 0;
  const score = Math.max(0, 100 - linterIssues.filter(i => i.sev === 'HIGH').length * 20 - linterIssues.filter(i => i.sev === 'MEDIUM').length * 8);

  const generateReport = () => {
    setIsGenerating(true);

    const now = new Date().toLocaleString();

    // Build stages table rows
    const stageRows = (ast?.stages || []).map((s, i) => {
      const hasWhen = s.when ? `${s.when.type}: ${s.when.value || ''}` : '—';
      const stepCount = s.steps?.length || (s.parallel ? s.parallel.length + ' branches' : 0);
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${s.name || 'Unnamed'}</strong></td>
        <td>${s.parallel ? 'Parallel' : 'Sequential'}</td>
        <td><code>${hasWhen}</code></td>
        <td>${stepCount}</td>
      </tr>`;
    }).join('');

    // Linter rows
    const linterRows = linterIssues.map(issue => {
      const color = issue.sev === 'HIGH' ? '#ef4444' : issue.sev === 'MEDIUM' ? '#f59e0b' : '#06b6d4';
      return `<tr>
        <td><span style="color:${color};font-weight:800">${issue.sev}</span></td>
        <td>${issue.title}</td>
        <td>${issue.desc}</td>
        <td><code>${issue.stage}</code></td>
      </tr>`;
    }).join('');

    // Env rows
    const envRows = ast?.environment ? Object.entries(ast.environment).map(([k, v]) =>
      `<tr><td><code>${k}</code></td><td><code>${v}</code></td></tr>`
    ).join('') : '';

    // Param rows
    const paramRows = (ast?.parameters || []).map(p =>
      `<tr><td><code>${p.name}</code></td><td>${p.type}</td><td>${p.defaultValue || '—'}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Jenkinsfile Intelligence Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #fff; color: #1e293b; padding: 40px 60px; max-width: 900px; margin: 0 auto; }
  
  .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #0f172a; padding-bottom: 30px; }
  .header h1 { font-size: 28px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
  .header .subtitle { font-size: 13px; color: #64748b; margin-top: 6px; }
  .header .date { font-size: 11px; color: #94a3b8; margin-top: 10px; }
  
  .score-box { display: flex; align-items: center; justify-content: center; gap: 30px; margin: 30px 0; padding: 25px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
  .score-circle { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: #fff; }
  .stat { text-align: center; }
  .stat .num { font-size: 28px; font-weight: 900; color: #0f172a; }
  .stat .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  
  h2 { font-size: 18px; font-weight: 800; color: #0f172a; margin: 35px 0 15px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
  th { background: #f1f5f9; text-align: left; padding: 10px 14px; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:hover { background: #f8fafc; }
  code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #0f172a; }
  
  .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  
  @media print {
    body { padding: 20px 30px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="no-print" style="position:fixed;top:15px;right:20px;z-index:100">
  <button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:Inter,sans-serif">
    ⬇ Save as PDF
  </button>
</div>

<div class="header">
  <h1>🔬 Jenkinsfile Intelligence Report</h1>
  <div class="subtitle">Automated Pipeline Analysis & Security Audit</div>
  <div class="date">Generated: ${now}</div>
</div>

<div class="score-box">
  <div class="score-circle" style="background:${score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'}">
    ${score}
  </div>
  <div class="stat"><div class="num">${stageCount}</div><div class="label">Stages</div></div>
  <div class="stat"><div class="num">${envCount}</div><div class="label">Env Vars</div></div>
  <div class="stat"><div class="num">${paramCount}</div><div class="label">Parameters</div></div>
  <div class="stat"><div class="num">${linterIssues.length}</div><div class="label">Issues</div></div>
  <div class="stat"><div class="num">${branches.length || 0}</div><div class="label">Branches</div></div>
</div>

${selectedSections.stages ? `
<h2>📋 Pipeline Stages</h2>
<table>
  <thead><tr><th>#</th><th>Stage Name</th><th>Type</th><th>Condition</th><th>Steps</th></tr></thead>
  <tbody>${stageRows || '<tr><td colspan="5">No stages</td></tr>'}</tbody>
</table>
` : ''}

${selectedSections.linter ? `
<h2>🛡️ Security & Lint Report</h2>
${linterIssues.length === 0 ? '<p style="color:#10b981;font-weight:700">✅ No issues found. Pipeline follows all best practices.</p>' : `
<table>
  <thead><tr><th>Severity</th><th>Issue</th><th>Description</th><th>Location</th></tr></thead>
  <tbody>${linterRows}</tbody>
</table>
`}
` : ''}

${selectedSections.environment && envCount > 0 ? `
<h2>🔧 Environment Variables</h2>
<table>
  <thead><tr><th>Variable</th><th>Value</th></tr></thead>
  <tbody>${envRows}</tbody>
</table>
` : ''}

${selectedSections.parameters && paramCount > 0 ? `
<h2>⚙️ Pipeline Parameters</h2>
<table>
  <thead><tr><th>Name</th><th>Type</th><th>Default</th></tr></thead>
  <tbody>${paramRows}</tbody>
</table>
` : ''}

<div class="footer">
  Jenkinsfile Intelligence • Automated Report • ${now}
</div>

</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');

    setTimeout(() => {
      setIsGenerating(false);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Empty state
  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-20 h-20 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <span className="text-4xl opacity-30">📄</span>
        </div>
        <p className="text-slate-500 text-sm font-medium">Parse a Jenkinsfile to generate a report</p>
      </div>
    );
  }

  const sections = [
    { key: 'overview', label: 'Overview & Score', icon: '📊' },
    { key: 'stages', label: 'Pipeline Stages', icon: '📋' },
    { key: 'linter', label: 'Security Audit', icon: '🛡️' },
    { key: 'environment', label: 'Environment Vars', icon: '🔧', disabled: envCount === 0 },
    { key: 'parameters', label: 'Parameters', icon: '⚙️', disabled: paramCount === 0 },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-950">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/60 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Export Analysis Report</h2>
              <p className="text-sm text-slate-500 mt-1">Generate a printable PDF of your pipeline analysis</p>
            </div>
            <button
              onClick={generateReport}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 cursor-pointer"
              style={{
                background: isGenerating ? 'rgba(51,65,85,0.5)' : 'linear-gradient(135deg, #06b6d4, #10b981)',
                color: '#fff',
                boxShadow: isGenerating ? 'none' : '0 4px 20px rgba(6,182,212,0.3)',
              }}
            >
              {isGenerating ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Generate & Download PDF
                </>
              )}
            </button>
          </div>

          {/* Section Toggles */}
          <div className="flex flex-wrap gap-2">
            {sections.map(s => (
              <button
                key={s.key}
                onClick={() => !s.disabled && toggleSection(s.key)}
                disabled={s.disabled}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 cursor-pointer"
                style={{
                  opacity: s.disabled ? 0.3 : 1,
                  background: selectedSections[s.key] ? 'rgba(34,211,238,0.08)' : 'transparent',
                  borderColor: selectedSections[s.key] ? 'rgba(34,211,238,0.3)' : 'rgba(51,65,85,0.4)',
                  color: selectedSections[s.key] ? '#22d3ee' : '#94a3b8',
                }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
                {selectedSections[s.key] && !s.disabled && (
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {/* Preview Card */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(51,65,85,0.4)', background: 'rgba(15,23,42,0.6)' }}>
            {/* Fake page header */}
            <div className="p-8 text-center" style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
              <h3 className="text-lg font-black text-slate-200">🔬 Jenkinsfile Intelligence Report</h3>
              <p className="text-xs text-slate-500 mt-1">Automated Pipeline Analysis & Security Audit</p>
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-center gap-8 py-6" style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white text-xl font-black" style={{ background: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444' }}>
                  {score}
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-wider">Score</div>
              </div>
              {[
                { n: stageCount, l: 'Stages' },
                { n: envCount, l: 'Env Vars' },
                { n: paramCount, l: 'Params' },
                { n: linterIssues.length, l: 'Issues' },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl font-black text-slate-200">{s.n}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Sections preview */}
            <div className="p-6 space-y-4">
              {selectedSections.stages && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.3)' }}>
                  <h4 className="text-sm font-bold text-slate-300 mb-2">📋 Pipeline Stages</h4>
                  <div className="flex flex-wrap gap-2">
                    {(ast?.stages || []).slice(0, 8).map((s, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#94a3b8' }}>
                        {s.name || `Stage ${i + 1}`}
                      </span>
                    ))}
                    {(ast?.stages?.length || 0) > 8 && (
                      <span className="px-3 py-1.5 text-xs text-slate-500 font-bold">+{ast.stages.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}

              {selectedSections.linter && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.3)' }}>
                  <h4 className="text-sm font-bold text-slate-300 mb-2">🛡️ Security Audit</h4>
                  <p className="text-xs text-slate-500">
                    {linterIssues.length === 0
                      ? '✅ No issues found'
                      : `${linterIssues.filter(i => i.sev === 'HIGH').length} critical, ${linterIssues.filter(i => i.sev === 'MEDIUM').length} warnings found`}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-3 text-center text-[10px] text-slate-600" style={{ borderTop: '1px solid rgba(51,65,85,0.3)' }}>
              Click "Generate & Download PDF" to open the full report in a new tab
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportReportTab;
