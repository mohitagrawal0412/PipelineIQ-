import React, { useMemo } from 'react';

// Heuristic time estimates (in seconds) for common pipeline steps
const STEP_DURATIONS = {
  'mvn clean compile': 45,
  'mvn test': 90,
  'mvn verify': 120,
  'mvn sonar': 150,
  'mvn dependency-check': 180,
  'npm install': 60,
  'npm test': 45,
  'docker build': 120,
  'docker push': 45,
  'kubectl': 15,
  'helm upgrade': 180,
  'jmeter': 300,
  'curl': 5,
  'git': 10,
  'archiveArtifacts': 10,
  'junit': 5,
  'stash': 15,
  'unstash': 10,
  'default_sh': 30, // Any other shell command
};

const EstimatorTab = ({ ast }) => {
  const { stagesData, totalTime, criticalPathTime } = useMemo(() => {
    if (!ast || !ast.stages) return { stagesData: [], totalTime: 0, criticalPathTime: 0 };

    const estimateStepTime = (step) => {
      if (step.type === 'sh') {
        const cmd = step.command.toLowerCase();
        if (cmd.includes('mvn sonar')) return STEP_DURATIONS['mvn sonar'];
        if (cmd.includes('dependency-check')) return STEP_DURATIONS['mvn dependency-check'];
        if (cmd.includes('mvn clean compile') || cmd.includes('mvn compile')) return STEP_DURATIONS['mvn clean compile'];
        if (cmd.includes('mvn test')) return STEP_DURATIONS['mvn test'];
        if (cmd.includes('mvn verify')) return STEP_DURATIONS['mvn verify'];
        if (cmd.includes('npm i') || cmd.includes('npm install')) return STEP_DURATIONS['npm install'];
        if (cmd.includes('npm test')) return STEP_DURATIONS['npm test'];
        if (cmd.includes('docker build')) return STEP_DURATIONS['docker build'];
        if (cmd.includes('docker push')) return STEP_DURATIONS['docker push'];
        if (cmd.includes('kubectl')) return STEP_DURATIONS['kubectl'];
        if (cmd.includes('helm')) return STEP_DURATIONS['helm upgrade'];
        if (cmd.includes('jmeter')) return STEP_DURATIONS['jmeter'];
        if (cmd.includes('curl')) return STEP_DURATIONS['curl'];
        if (cmd.includes('git')) return STEP_DURATIONS['git'];
        return STEP_DURATIONS['default_sh'];
      }
      return STEP_DURATIONS[step.type] || 5; // Default 5 seconds for echo, etc.
    };

    const processStages = (stagesArray) => {
      let total = 0; // Total sum of all steps
      let critical = 0; // Longest path through parallel blocks
      const data = [];

      for (const stage of stagesArray) {
        if (stage.parallel) {
          const { data: pData, total: pTotal, critical: pCritical } = processStages(stage.parallel);
          total += pTotal;
          critical += pCritical; // The longest branch in parallel
          data.push({
            name: stage.name,
            isParallelContainer: true,
            time: pCritical, // visually, container takes as long as its longest child
            children: pData
          });
        } else {
          let stageTime = 0;
          if (stage.steps) {
            stage.steps.forEach(s => stageTime += estimateStepTime(s));
          }
          if (stage.post) {
            Object.values(stage.post).forEach(steps => {
              steps.forEach(s => stageTime += estimateStepTime(s));
            });
          }
          
          // Minimum 5 seconds for visual purposes
          stageTime = Math.max(5, stageTime);
          
          total += stageTime;
          critical += stageTime;
          data.push({
            name: stage.name,
            isParallelContainer: false,
            time: stageTime,
          });
        }
      }
      
      // If these stages were in a parallel block, the critical path is the MAX of the branches, not the sum
      return { data, total, critical: stagesArray.every(s => !s.parallel) && stagesArray.length > 1 ? Math.max(...data.map(d => d.time)) : critical };
    };

    // We process the root stages. Because the root stages are sequential, we need a slightly modified wrapper
    let overallTotal = 0;
    let overallCritical = 0;
    const rootData = [];
    
    for (const stage of ast.stages) {
      if (stage.parallel) {
        // Evaluate the parallel branches
        const branchTimes = stage.parallel.map(pStage => {
           let time = 0;
           if (pStage.steps) pStage.steps.forEach(s => time += estimateStepTime(s));
           if (pStage.post) Object.values(pStage.post).forEach(steps => steps.forEach(s => time += estimateStepTime(s)));
           return { name: pStage.name, time: Math.max(5, time) };
        });
        const maxBranchTime = Math.max(...branchTimes.map(b => b.time));
        const sumBranchTime = branchTimes.reduce((a,b) => a+b.time, 0);
        
        overallTotal += sumBranchTime;
        overallCritical += maxBranchTime;
        
        rootData.push({
          name: stage.name,
          isParallelContainer: true,
          time: maxBranchTime,
          children: branchTimes
        });
      } else {
        let stageTime = 0;
        if (stage.steps) stage.steps.forEach(s => stageTime += estimateStepTime(s));
        if (stage.post) Object.values(stage.post).forEach(steps => steps.forEach(s => stageTime += estimateStepTime(s)));
        
        stageTime = Math.max(5, stageTime);
        overallTotal += stageTime;
        overallCritical += stageTime;
        
        rootData.push({
          name: stage.name,
          isParallelContainer: false,
          time: stageTime
        });
      }
    }

    return { stagesData: rootData, totalTime: overallTotal, criticalPathTime: overallCritical };
  }, [ast]);

  if (!ast) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-500 gap-4">
        <svg className="w-16 h-16 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg">Parse a Jenkinsfile to estimate execution time</p>
      </div>
    );
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const savedTime = totalTime - criticalPathTime;
  const timeSavedPercentage = Math.round((savedTime / totalTime) * 100) || 0;

  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto w-full">
        {/* Header Summary */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-sm">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <span>Time Estimator</span>
            </h2>
            <p className="text-slate-400 mt-1 text-sm max-w-md">Estimated pipeline execution duration based on heuristics of standard DevOps tooling.</p>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center flex-1 md:min-w-[140px]">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Critical Path</div>
              <div className="text-3xl font-bold text-emerald-400 font-mono tracking-tight">{formatTime(criticalPathTime)}</div>
            </div>
            
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center flex-1 md:min-w-[140px] relative overflow-hidden group">
              <div className="absolute inset-0 bg-cyan-500/5 group-hover:bg-cyan-500/10 transition-colors" />
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1 relative">Time Saved (Parallel)</div>
              <div className="text-2xl font-bold text-cyan-400 font-mono tracking-tight relative">
                {formatTime(savedTime)}
                <span className="text-xs text-cyan-500/60 ml-2">({timeSavedPercentage}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Visualization */}
        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-6 shadow-xl">
          <h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider mb-6 pb-4 border-b border-slate-800">Critical Path Analysis</h3>
          
          <div className="space-y-4">
            {stagesData.map((stage, idx) => {
              const percentageOfTotal = Math.max(2, (stage.time / criticalPathTime) * 100);
              
              if (stage.isParallelContainer) {
                return (
                  <div key={idx} className="relative pt-2 pb-2">
                    <div className="flex justify-between text-xs font-semibold text-slate-400 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        Parallel Block: {stage.name}
                      </span>
                      <span className="text-cyan-400 font-mono">{formatTime(stage.time)}</span>
                    </div>
                    
                    <div className="bg-slate-950 rounded-lg p-3 border border-slate-800/80 space-y-3">
                      {stage.children.map((child, cIdx) => {
                        const childPercent = Math.max(2, (child.time / stage.time) * 100);
                        const isLongest = child.time === stage.time;
                        return (
                          <div key={cIdx} className="relative">
                            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
                              <span className={isLongest ? 'text-amber-400' : ''}>{child.name} {isLongest && '(Bottleneck)'}</span>
                              <span>{formatTime(child.time)}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                              <div 
                                className={`h-full rounded-full transition-all duration-1000 ${isLongest ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-slate-600'}`}
                                style={{ width: `${childPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="relative group">
                  <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
                    <span>{stage.name}</span>
                    <span className="font-mono text-emerald-500/80">{formatTime(stage.time)}</span>
                  </div>
                  <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000 relative"
                      style={{ width: `${percentageOfTotal}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite] -translate-x-full" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-6 text-center text-xs text-slate-500 italic">
          Note: These are simulated heuristics. Actual execution times depend on your CI/CD runner compute capacity and network latency.
        </div>
      </div>
    </div>
  );
};

export default EstimatorTab;
