import React, { useState, useMemo } from 'react';

const MigrationTab = ({ ast }) => {
  const [targetPlatform, setTargetPlatform] = useState('github');
  const [copied, setCopied] = useState(false);

  const { yaml, warnings } = useMemo(() => {
    if (!ast) return { yaml: '# No AST provided\n', warnings: [] };
    
    let yamlString = '';
    const warningsList = [];
    
    if (targetPlatform === 'github') {
      warningsList.push('withCredentials blocks have no direct GitHub Actions equivalent (use secrets context)');
      
      yamlString += '# GitHub Actions Workflow\n';
      yamlString += '# Auto-generated from Jenkinsfile\n\n';
      yamlString += 'name: CI/CD Pipeline\n\n';
      
      // Events
      yamlString += 'on:\n';
      
      let pushAdded = false;
      if (ast.stages) {
        for (const stage of ast.stages) {
          if (stage.when?.type === 'branch') {
            if (!pushAdded) {
              yamlString += '  push:\n    branches:\n';
              pushAdded = true;
            }
            yamlString += `      - '${stage.when.value}'\n`;
          }
        }
      }
      
      if (!pushAdded) {
        yamlString += '  push: { }\n';
      }

      if (ast.triggers && ast.triggers.length > 0) {
        for (const trigger of ast.triggers) {
          if (trigger.type === 'pollSCM' || trigger.type === 'cron') {
            yamlString += '  schedule:\n';
            yamlString += `    - cron: '${trigger.value.replace('H/', '*/')}'\n`;
          }
        }
      }
      yamlString += '\n';

      // Environment
      if (ast.environment && Object.keys(ast.environment).length > 0) {
        yamlString += 'env:\n';
        for (const [key, value] of Object.entries(ast.environment)) {
          yamlString += `  ${key}: '${value}'\n`;
        }
        yamlString += '\n';
      }

      // Jobs
      yamlString += 'jobs:\n';
      yamlString += '  build:\n';
      yamlString += '    runs-on: ubuntu-latest\n';
      
      if (ast.agent?.type === 'docker') {
        yamlString += `    container:\n      image: '${ast.agent.image}'\n`;
      }
      
      yamlString += '    steps:\n';
      yamlString += '      - name: Checkout Code\n        uses: actions/checkout@v4\n\n';
      
      if (ast.stages) {
        ast.stages.forEach(stage => {
          if (stage.parallel) {
            warningsList.push(`Parallel stage '${stage.name}' converted to sequential steps in single job for simplicity, consider splitting into separate GitHub jobs.`);
            stage.parallel.forEach(pStage => {
               yamlString += `      - name: '${pStage.name}'\n`;
               if (pStage.steps) {
                   pStage.steps.forEach(step => {
                       if (step.type === 'sh') {
                           yamlString += `        run: |\n          ${step.command || step.raw || 'echo "no command"'}\n`;
                       }
                   });
               }
            });
          } else {
            yamlString += `      - name: '${stage.name}'\n`;
            if (stage.steps) {
              stage.steps.forEach(step => {
                if (step.type === 'sh') {
                  yamlString += `        run: |\n          ${step.command || step.raw || 'echo "no command"'}\n`;
                } else {
                  yamlString += `        run: echo 'Unsupported step type: ${step.type}'\n`;
                }
              });
            }
          }
          yamlString += '\n';
        });
      }

      if (ast.post) {
        if (ast.post.always) {
          yamlString += '      - name: Post Always\n        if: always()\n        run: |\n';
          ast.post.always.forEach(step => yamlString += `          ${step.command || step.raw || ''}\n`);
        }
        if (ast.post.failure) {
          yamlString += '      - name: Post Failure\n        if: failure()\n        run: |\n';
          ast.post.failure.forEach(step => yamlString += `          ${step.command || step.raw || ''}\n`);
        }
      }

    } else { // GitLab CI
      warningsList.push('GitLab CI jobs run in parallel by default in the same stage. Jenkins pipeline sequential execution is mapped to distinct stages.');
      
      yamlString += '# GitLab CI Pipeline\n';
      yamlString += '# Auto-generated from Jenkinsfile\n\n';

      if (ast.agent?.type === 'docker') {
        yamlString += `image: '${ast.agent.image}'\n\n`;
      }

      if (ast.environment && Object.keys(ast.environment).length > 0) {
        yamlString += 'variables:\n';
        for (const [key, value] of Object.entries(ast.environment)) {
          yamlString += `  ${key}: '${value}'\n`;
        }
        yamlString += '\n';
      }

      const stages = [];
      if (ast.stages) {
        ast.stages.forEach(stage => {
          if (stage.parallel) {
            stage.parallel.forEach(pStage => stages.push(pStage.name));
          } else {
            stages.push(stage.name);
          }
        });
      }

      if (stages.length > 0) {
        yamlString += 'stages:\n';
        stages.forEach(s => yamlString += `  - ${s.toLowerCase().replace(/\\s+/g, '-')}\n`);
        yamlString += '\n';
      }

      if (ast.stages) {
        ast.stages.forEach(stage => {
          const processStage = (s) => {
            const jobName = s.name.toLowerCase().replace(/\\s+/g, '-');
            yamlString += `${jobName}:\n`;
            yamlString += `  stage: ${jobName}\n`;
            
            if (s.when?.type === 'branch') {
              yamlString += `  only:\n    - ${s.when.value}\n`;
            }

            yamlString += '  script:\n';
            if (s.steps) {
              s.steps.forEach(step => {
                if (step.type === 'sh') {
                  yamlString += `    - ${step.command || step.raw || 'echo "no command"'}\n`;
                }
              });
            } else {
               yamlString += '    - echo "No steps"\n';
            }
            yamlString += '\n';
          };

          if (stage.parallel) {
            stage.parallel.forEach(processStage);
          } else {
            processStage(stage);
          }
        });
      }

      if (ast.post?.always) {
        yamlString += 'after_script:\n';
        ast.post.always.forEach(step => {
           yamlString += `  - ${step.command || step.raw || ''}\n`;
        });
      }
    }
    
    return { yaml: yamlString, warnings: warningsList };
  }, [ast, targetPlatform]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const renderYaml = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.trim().startsWith('#')) {
        return <div key={i} className="text-slate-500 whitespace-pre font-mono">{line}</div>;
      }
      
      const keyValMatch = line.match(/^(\s*)([-\w\s]+):(.*)$/);
      if (keyValMatch) {
        const [, indent, key, rest] = keyValMatch;
        let coloredRest = rest;
        if (rest.trim().startsWith("'") || rest.trim().startsWith('"')) {
          coloredRest = <span className="text-emerald-400">{rest}</span>;
        } else {
          coloredRest = <span className="text-emerald-400">{rest}</span>;
        }
        return (
          <div key={i} className="whitespace-pre font-mono text-slate-300">
            <span>{indent}</span>
            <span className="text-cyan-400">{key}</span>:
            {coloredRest}
          </div>
        );
      }

      const arrayMatch = line.match(/^(\s*)-\s*(.*)$/);
      if (arrayMatch) {
          const [, indent, val] = arrayMatch;
          return (
              <div key={i} className="whitespace-pre font-mono text-slate-300">
                  <span>{indent}- </span>
                  <span className="text-emerald-400">{val}</span>
              </div>
          )
      }

      return <div key={i} className="whitespace-pre font-mono text-emerald-400">{line}</div>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 flex flex-col gap-4 p-4 border-b border-slate-800 bg-slate-950">
        <div className="flex justify-between items-center">
          <div className="flex bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setTargetPlatform('github')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                targetPlatform === 'github'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              GitHub Actions
            </button>
            <button
              onClick={() => setTargetPlatform('gitlab')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                targetPlatform === 'gitlab'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              GitLab CI
            </button>
          </div>
        </div>
        
        {warnings.length > 0 && (
          <div className="flex flex-col gap-1 p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conversion Notes</h4>
            <ul className="text-sm text-slate-300 list-disc list-inside">
              {warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Code Viewer */}
      <div className="flex-1 p-4 relative overflow-hidden flex flex-col">
        <div className="absolute top-6 right-6 z-10">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors border border-slate-700"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                Copy
              </>
            )}
          </button>
        </div>
        
        <div className="flex-1 overflow-auto bg-slate-900 rounded-xl border border-slate-800 p-6">
          <pre className="text-sm">
            {renderYaml(yaml)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default MigrationTab;
