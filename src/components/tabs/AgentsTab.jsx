import React, { useMemo } from 'react';

const AgentsTab = ({ ast }) => {
  const { agentsList, artifactsList } = useMemo(() => {
    if (!ast) return { agentsList: [], artifactsList: [] };

    const agents = [];
    const artifacts = [];
    const trackingTypes = ['archiveArtifacts', 'junit', 'publishHTML', 'stash', 'unstash', 's3Upload'];

    // Add global agent
    if (ast.agent) {
      agents.push({
        scope: 'Global',
        type: ast.agent.type || 'unknown',
        imageOrLabel: ast.agent.image || ast.agent.label || ast.agent.type || '-',
        usedIn: ['All Stages (Global)'],
      });
    }

    // Recursively scan all stages
    function scanStages(stages, parentName) {
      if (!stages) return;
      for (const stage of stages) {
        // Agent
        if (stage.agent) {
          const type = stage.agent.type || 'unknown';
          const imageOrLabel = stage.agent.image || stage.agent.label || type;
          const existing = agents.find(
            (a) => a.type === type && a.imageOrLabel === imageOrLabel && a.scope !== 'Global'
          );
          if (existing) {
            if (!existing.usedIn.includes(stage.name)) existing.usedIn.push(stage.name);
          } else {
            agents.push({
              scope: parentName ? `${parentName} → ${stage.name}` : stage.name,
              type,
              imageOrLabel,
              usedIn: [stage.name],
            });
          }
        }

        // Steps — scan for artifact/storage commands
        if (stage.steps) {
          for (const step of stage.steps) {
            const stepType = step.type || '';
            if (trackingTypes.some((kw) => stepType.includes(kw))) {
              let pattern = step.command || '-';
              let target = '-';

              // Parse archiveArtifacts pattern
              if (stepType === 'archiveArtifacts') {
                const artMatch = step.command?.match(/artifacts:\s*['"]([^'"]+)['"]/);
                if (artMatch) pattern = artMatch[1];
                else pattern = step.command || '-';
              }
              // Parse junit pattern
              else if (stepType === 'junit') {
                pattern = step.command || '-';
              }
              // Parse publishHTML
              else if (stepType === 'publishHTML') {
                const dirMatch = step.command?.match(/reportDir:\s*['"]([^'"]+)['"]/);
                const fileMatch = step.command?.match(/reportFiles:\s*['"]([^'"]+)['"]/);
                pattern = fileMatch ? fileMatch[1] : step.command || '-';
                target = dirMatch ? dirMatch[1] : '-';
              }
              // Parse stash
              else if (stepType === 'stash') {
                const nameMatch = step.command?.match(/name:\s*['"]([^'"]+)['"]/);
                const incMatch = step.command?.match(/includes:\s*['"]([^'"]+)['"]/);
                pattern = incMatch ? incMatch[1] : step.command || '-';
                target = nameMatch ? `stash: ${nameMatch[1]}` : '-';
              }
              // Parse unstash
              else if (stepType === 'unstash') {
                pattern = step.command || '-';
                target = 'Workspace restore';
              }

              artifacts.push({
                command: stepType,
                pattern,
                target,
                stage: stage.name,
              });
            }
          }
        }

        // Scan post blocks for artifacts
        if (stage.post) {
          for (const [condition, steps] of Object.entries(stage.post)) {
            if (Array.isArray(steps)) {
              for (const step of steps) {
                const stepType = step.type || '';
                if (trackingTypes.some((kw) => stepType.includes(kw))) {
                  let pattern = step.command || '-';
                  if (stepType === 'archiveArtifacts') {
                    const artMatch = step.command?.match(/artifacts:\s*['"]([^'"]+)['"]/);
                    if (artMatch) pattern = artMatch[1];
                  } else if (stepType === 'junit') {
                    pattern = step.command || '-';
                  }
                  artifacts.push({
                    command: stepType,
                    pattern,
                    target: `-  (post: ${condition})`,
                    stage: stage.name,
                  });
                }
              }
            }
          }
        }

        // Recurse parallel
        if (stage.parallel) {
          scanStages(stage.parallel, stage.name);
        }
      }
    }

    scanStages(ast.stages || [], null);
    return { agentsList: agents, artifactsList: artifacts };
  }, [ast]);

  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 gap-4">
        <svg className="w-16 h-16 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
        <p className="text-lg">Parse a Jenkinsfile to see infrastructure inventory</p>
      </div>
    );
  }

  const getAgentIcon = (type) => {
    const t = String(type).toLowerCase();
    if (t.includes('docker'))
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
          🐳 Docker
        </span>
      );
    if (t.includes('kubernetes') || t.includes('k8s'))
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
          ☸ Kubernetes
        </span>
      );
    if (t.includes('node'))
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
          🖥 Node
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/25">
        {type}
      </span>
    );
  };

  const getArtifactBadge = (cmd) => {
    const styles = {
      archiveArtifacts: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      junit: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
      publishHTML: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
      stash: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
      unstash: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
      s3Upload: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    };
    const style = styles[cmd] || 'bg-slate-500/15 text-slate-300 border-slate-500/25';
    return (
      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold border ${style}`}>
        {cmd}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-8 p-6 max-w-6xl mx-auto">
      {/* SECTION 1: Execution Environments */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
            🐳
          </div>
          <h2 className="text-lg font-bold text-slate-200">Execution Environments</h2>
          <span className="ml-auto px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-400 border border-slate-700">
            {agentsList.length} found
          </span>
        </div>

        {agentsList.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 shadow-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-semibold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Scope</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Image / Label</th>
                  <th className="px-5 py-3.5">Used In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {agentsList.map((agent, i) => (
                  <tr key={i} className="bg-slate-900/30 table-row-hover transition-colors">
                    <td className="px-5 py-3.5">
                      <span className={`font-medium ${agent.scope === 'Global' ? 'text-cyan-300' : 'text-slate-300'}`}>
                        {agent.scope}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">{getAgentIcon(agent.type)}</td>
                    <td className="px-5 py-3.5">
                      <code className="text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded text-xs font-mono">
                        {agent.imageOrLabel}
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {agent.usedIn.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-slate-800/80 rounded text-xs text-slate-400 border border-slate-700/50">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 italic text-sm py-4">No agent configurations found in the pipeline.</p>
        )}
      </section>

      {/* SECTION 2: Artifacts & Storage Tracker */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
            📦
          </div>
          <h2 className="text-lg font-bold text-slate-200">Artifacts & Storage Tracker</h2>
          <span className="ml-auto px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-400 border border-slate-700">
            {artifactsList.length} found
          </span>
        </div>

        {artifactsList.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 shadow-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs font-semibold tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Command</th>
                  <th className="px-5 py-3.5">File Pattern / Details</th>
                  <th className="px-5 py-3.5">Target / Destination</th>
                  <th className="px-5 py-3.5">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {artifactsList.map((item, i) => (
                  <tr key={i} className="bg-slate-900/30 table-row-hover transition-colors">
                    <td className="px-5 py-3.5">{getArtifactBadge(item.command)}</td>
                    <td className="px-5 py-3.5">
                      <code className="text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded text-xs font-mono">
                        {item.pattern}
                      </code>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 text-xs">{item.target}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-slate-800/80 rounded text-xs text-slate-300 border border-slate-700/50">
                        {item.stage}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 italic text-sm py-4">No artifact or storage commands detected in the pipeline.</p>
        )}
      </section>
    </div>
  );
};

export default AgentsTab;
