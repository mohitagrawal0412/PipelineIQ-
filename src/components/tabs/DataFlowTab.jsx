import React, { useMemo, useState } from 'react';

const DataFlowTab = ({ ast }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVar, setExpandedVar] = useState(null);

  const dataMap = useMemo(() => {
    if (!ast) return [];

    const variables = new Map(); // key -> { type: 'env' | 'param', usages: [{stageName, stepRaw}] }

    // 1. Collect global parameters
    if (ast.parameters) {
      ast.parameters.forEach(p => {
        if (p.name) variables.set(p.name, { type: 'parameter', defaultValue: p.defaultValue, description: p.description, usages: [] });
      });
    }

    // 2. Collect global environment variables
    if (ast.environment) {
      Object.entries(ast.environment).forEach(([key, value]) => {
        variables.set(key, { type: 'environment', value, usages: [] });
      });
    }

    // 3. Scan all stages for usages of ANY variables (known or unknown)
    // Usages usually look like ${VAR} or $VAR or params.VAR
    const scanStages = (stages) => {
      if (!stages) return;
      for (const stage of stages) {
        if (stage.steps) {
          stage.steps.forEach(step => {
            if (!step.raw) return;
            
            // Regex to find ${VAR}, $VAR, or params.VAR
            const usageRegex = /(?:\$\{([a-zA-Z_0-9]+)\})|(?:\$([a-zA-Z_0-9]+)\b)|(?:params\.([a-zA-Z_0-9]+)\b)|(?:env\.([a-zA-Z_0-9]+)\b)/g;
            let match;
            while ((match = usageRegex.exec(step.raw)) !== null) {
              const varName = match[1] || match[2] || match[3] || match[4];
              
              if (!variables.has(varName)) {
                // Found an implicitly used variable (e.g. built-in like BUILD_NUMBER, or defined inside a step)
                variables.set(varName, { type: 'implicit', usages: [] });
              }
              
              const vData = variables.get(varName);
              // avoid duplicate usages in the same step
              if (!vData.usages.find(u => u.stageName === stage.name && u.stepRaw === step.raw)) {
                vData.usages.push({ stageName: stage.name, stepRaw: step.raw });
              }
            }
          });
        }
        
        // Also check `when` block expressions for usages
        if (stage.when && stage.when.raw) {
             const usageRegex = /(?:params\.([a-zA-Z_0-9]+)\b)|(?:env\.([a-zA-Z_0-9]+)\b)/g;
             let match;
             while ((match = usageRegex.exec(stage.when.raw)) !== null) {
                const varName = match[1] || match[2];
                if (!variables.has(varName)) {
                  variables.set(varName, { type: 'implicit', usages: [] });
                }
                const vData = variables.get(varName);
                if (!vData.usages.find(u => u.stageName === stage.name && u.stepRaw === `when: ${stage.when.raw}`)) {
                  vData.usages.push({ stageName: stage.name, stepRaw: `when: ${stage.when.raw}` });
                }
             }
        }

        if (stage.parallel) scanStages(stage.parallel);
      }
    };

    scanStages(ast.stages);

    return Array.from(variables.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => a.name.localeCompare(b.name));
  }, [ast]);

  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 gap-4">
        <svg className="w-16 h-16 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-lg">Parse a Jenkinsfile to visualize data flow and variables</p>
      </div>
    );
  }

  const filteredMap = dataMap.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const getTypeBadge = (type) => {
    switch(type) {
      case 'parameter': return <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Parameter</span>;
      case 'environment': return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Environment</span>;
      case 'implicit': return <span className="bg-slate-700/50 text-slate-300 border border-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Implicit</span>;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full">
        {/* Header & Search */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <span>Data Flow & Variables</span>
            </h2>
            <p className="text-slate-400 mt-1 text-sm">Track where parameters and environment variables are used across stages.</p>
          </div>
          
          <div className="relative w-full md:w-72">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search variables..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Table / List */}
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl backdrop-blur-sm">
          {filteredMap.length === 0 ? (
             <div className="p-8 text-center text-slate-500 italic">No variables match your search.</div>
          ) : (
            <table className="w-full text-sm text-left relative">
              <thead className="bg-slate-950/80 backdrop-blur text-slate-400 uppercase text-xs font-semibold tracking-wider sticky top-0 z-10 shadow-sm border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 w-1/4">Variable Name</th>
                  <th className="px-6 py-4 w-1/6">Type</th>
                  <th className="px-6 py-4 w-1/4">Definition / Value</th>
                  <th className="px-6 py-4 w-1/3">Usages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMap.map((item, idx) => {
                  const isExpanded = expandedVar === item.name;
                  const hasUsages = item.usages.length > 0;

                  return (
                    <React.Fragment key={idx}>
                      <tr 
                        className={`group transition-all duration-200 
                          ${hasUsages ? 'cursor-pointer hover:bg-slate-800/60' : 'opacity-60'}
                          ${isExpanded ? 'bg-slate-800/80 shadow-md' : 'bg-transparent'}
                        `}
                        onClick={() => hasUsages && setExpandedVar(isExpanded ? null : item.name)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold transition-colors ${isExpanded ? 'text-cyan-400' : 'text-slate-200 group-hover:text-cyan-300'}`}>
                              {item.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">{getTypeBadge(item.type)}</td>
                        <td className="px-6 py-4">
                          {item.type === 'implicit' ? (
                            <span className="text-slate-500 italic text-xs">Defined externally</span>
                          ) : (
                            <code className="text-slate-400 bg-slate-950 px-2 py-1 rounded text-xs font-mono border border-slate-800 max-w-[200px] truncate inline-block" title={item.value || item.defaultValue}>
                              {item.value || item.defaultValue || '""'}
                            </code>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {hasUsages ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                                {item.usages.length}
                              </span>
                              <span className="text-slate-400 text-xs">stages</span>
                              
                              <svg className={`w-4 h-4 text-slate-500 ml-auto transition-transform duration-300 ${isExpanded ? 'rotate-180 text-cyan-400' : 'group-hover:text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs italic">Unused in pipeline</span>
                          )}
                        </td>
                      </tr>
                      
                      {/* Expanded Details Row */}
                      {isExpanded && hasUsages && (
                        <tr>
                          <td colSpan={4} className="p-0 border-b border-cyan-500/20">
                            <div className="bg-slate-950/50 p-6 border-l-2 border-cyan-500 shadow-inner">
                              <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-3">Usage Contexts</h4>
                              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {item.usages.map((usage, uidx) => {
                                  // Highlight the variable in the text
                                  const parts = usage.stepRaw.split(new RegExp(`(\\b${item.name}\\b)`, 'g'));
                                  return (
                                    <div key={uidx} className="bg-slate-900 rounded-lg p-3 border border-slate-800/80 hover:border-slate-700 transition-colors">
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{usage.stageName}</span>
                                      </div>
                                      <code className="text-slate-400 font-mono text-xs block pl-3 border-l border-slate-700 whitespace-pre-wrap">
                                        {parts.map((part, pidx) => 
                                          part === item.name ? (
                                            <span key={pidx} className="text-cyan-300 font-bold bg-cyan-500/10 px-1 rounded">{part}</span>
                                          ) : (
                                            <span key={pidx}>{part}</span>
                                          )
                                        )}
                                      </code>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataFlowTab;
