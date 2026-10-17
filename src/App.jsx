import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import CodeEditor from './components/CodeEditor';
import FlowchartTab from './components/tabs/FlowchartTab';
import AgentsTab from './components/tabs/AgentsTab';
import BranchMatrixTab from './components/tabs/BranchMatrixTab';
import DiffTab from './components/tabs/DiffTab';
import LinterTab from './components/tabs/LinterTab';
import DataFlowTab from './components/tabs/DataFlowTab';
import EstimatorTab from './components/tabs/EstimatorTab';
import MigrationTab from './components/tabs/MigrationTab';
import ExportReportTab from './components/tabs/ExportReportTab';
import { parseJenkinsfile } from './parser/jenkinsfileParser';
import SAMPLE_JENKINSFILE from './parser/sampleJenkinsfile';

const TABS = [
  { id: 'flowchart', label: 'Stages Flowchart', icon: '🔀', description: 'Visual pipeline flow' },
  { id: 'linter', label: 'Security Linter', icon: '🛡️', description: 'Best practices & security' },
  { id: 'dataflow', label: 'Data Flow', icon: '🔄', description: 'Variable & credential map' },
  { id: 'estimator', label: 'Time Estimator', icon: '⏱️', description: 'Execution timeline' },
  { id: 'agents', label: 'Agents & Infra', icon: '🐳', description: 'Infrastructure inventory' },
  { id: 'branches', label: 'Branch Matrix', icon: '🌿', description: 'Branch condition simulator' },
  { id: 'diff', label: 'Pipeline Diff', icon: '📊', description: 'Compare pipelines' },
  { id: 'migration', label: 'Migration', icon: '🔄', description: 'Convert to GH Actions / GitLab' },
  { id: 'export', label: 'Export PDF', icon: '📄', description: 'Export analysis report' },
];

function App() {
  const [source, setSource] = useState(SAMPLE_JENKINSFILE);
  const [ast, setAst] = useState(null);
  const [parseStatus, setParseStatus] = useState('idle'); // 'idle' | 'parsed' | 'error'
  const [activeTab, setActiveTab] = useState('flowchart');
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [parseTime, setParseTime] = useState(0);

  const handleParse = useCallback(() => {
    try {
      const start = performance.now();
      const result = parseJenkinsfile(source);
      const elapsed = performance.now() - start;
      setParseTime(elapsed);

      if (result && result.stages && result.stages.length > 0) {
        setAst(result);
        setParseStatus('parsed');
      } else {
        setAst(result);
        setParseStatus('parsed');
      }
    } catch (err) {
      console.error('Parse error:', err);
      setParseStatus('error');
    }
  }, [source]);

  // Automatically parse sample pipeline on initial load
  useEffect(() => {
    handleParse();
  }, [handleParse]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'flowchart':
        return <FlowchartTab ast={ast} />;
      case 'agents':
        return <AgentsTab ast={ast} />;
      case 'branches':
        return <BranchMatrixTab ast={ast} />;
      case 'diff':
        return <DiffTab ast={ast} currentSource={source} />;
      case 'linter':
        return <LinterTab ast={ast} />;
      case 'dataflow':
        return <DataFlowTab ast={ast} />;
      case 'estimator':
        return <EstimatorTab ast={ast} />;
      case 'migration':
        return <MigrationTab ast={ast} />;
      case 'export':
        return <ExportReportTab ast={ast} currentSource={source} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950">
      {/* Header */}
      <Header ast={ast} parseStatus={parseStatus} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Code Editor */}
        <div
          className={`flex flex-col border-r border-slate-800 bg-slate-950 transition-all duration-500 ease-in-out ${
            isEditorCollapsed ? 'w-12' : 'w-[520px]'
          }`}
        >
          {/* Collapse / Expand Toggle */}
          <button
            onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
            className="flex items-center justify-center h-10 border-b border-slate-800 hover:bg-slate-800/50 transition-colors text-slate-400 hover:text-cyan-400"
            title={isEditorCollapsed ? 'Expand Editor' : 'Collapse Editor'}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${isEditorCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {!isEditorCollapsed && <span className="ml-2 text-xs font-medium">Editor</span>}
          </button>

          {!isEditorCollapsed && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor */}
              <div className="flex-1 overflow-hidden p-3">
                <CodeEditor
                  value={source}
                  onChange={(val) => {
                    setSource(val || '');
                    if (parseStatus !== 'idle') setParseStatus('idle');
                  }}
                  height="100%"
                />
              </div>

              {/* Parse Button Bar */}
              <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                <button
                  onClick={handleParse}
                  className="w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-300
                    bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500
                    text-white shadow-lg hover:shadow-cyan-500/25 pulse-glow
                    active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Parse & Analyze
                </button>
                {parseStatus === 'parsed' && (
                  <div className="mt-2 text-center text-xs text-slate-500">
                    Parsed in {parseTime.toFixed(1)}ms • {ast?.stages?.length || 0} stages detected
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Tab Navigation + Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center border-b border-slate-800 bg-slate-900/30 backdrop-blur-sm px-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all duration-200
                  ${
                    activeTab === tab.id
                      ? 'text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
                {/* Active indicator */}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full" />
                )}
              </button>
            ))}
            
            {/* Right side: parsed stats */}
            {parseStatus === 'parsed' && (
              <div className="ml-auto flex items-center gap-3 pr-4">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{ast?.stages?.length || 0} stages</span>
                </div>
                {ast?.options && ast.options.length > 0 && (
                  <div className="text-xs text-slate-500">
                    {ast.options.length} options
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto bg-slate-950" key={activeTab}>
            <div className="tab-content h-full">
              {ast ? (
                renderActiveTab()
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                  <div className="relative">
                    <svg className="w-20 h-20 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 rounded-full blur-xl" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-400">No Pipeline Loaded</h2>
                  <p className="text-sm text-slate-600 max-w-md text-center">
                    Paste a Declarative Jenkinsfile in the editor and click <strong className="text-cyan-400">Parse & Analyze</strong> to explore your pipeline's architecture.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
