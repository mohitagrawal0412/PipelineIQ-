import React from 'react';

const Header = ({ ast, parseStatus }) => {
  const getStatusColor = () => {
    switch (parseStatus) {
      case 'parsed': return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]';
      case 'error': return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]';
      case 'idle':
      default: return 'bg-slate-500';
    }
  };

  const getStatusText = () => {
    switch (parseStatus) {
      case 'parsed': return 'Parsed';
      case 'error': return 'Error';
      case 'idle':
      default: return 'Idle';
    }
  };

  const pipeline = ast?.pipeline || ast;
  const stageCount = pipeline?.stages?.length || 0;

  return (
    <header className="flex items-center justify-between w-full h-12 px-5 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/80">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-7 h-7">
          <div className="absolute inset-0 bg-cyan-500/20 rounded-lg blur-sm" />
          <svg className="w-5 h-5 text-cyan-400 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
          </svg>
        </div>
        <h1 className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-emerald-400">
          Jenkinsfile Intelligence
        </h1>
      </div>

      {/* Right: Status + Stage count */}
      <div className="flex items-center gap-4">
        {parseStatus === 'parsed' && stageCount > 0 && (
          <span className="text-xs text-slate-500 font-medium">
            {stageCount} stages
          </span>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()} transition-colors duration-300`} />
          <span className="text-xs font-medium text-slate-400">{getStatusText()}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
