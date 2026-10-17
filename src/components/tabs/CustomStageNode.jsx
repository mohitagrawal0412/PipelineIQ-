import React from 'react';
import { Handle, Position } from '@xyflow/react';

// Stage type detection for icon selection
const getStageIcon = (stage) => {
  const name = (stage?.name || '').toLowerCase();
  if (name.includes('start') || name.includes('pipeline')) return '▶';
  if (name.includes('build') || name.includes('compile')) return '🔨';
  if (name.includes('test') || name.includes('unit') || name.includes('integration')) return '🧪';
  if (name.includes('sonar') || name.includes('quality') || name.includes('lint')) return '📊';
  if (name.includes('security') || name.includes('owasp') || name.includes('scan')) return '🛡️';
  if (name.includes('docker') || name.includes('container') || name.includes('image')) return '🐳';
  if (name.includes('deploy') || name.includes('release')) return '🚀';
  if (name.includes('approval') || name.includes('gate')) return '✋';
  if (name.includes('smoke') || name.includes('health')) return '💨';
  if (name.includes('notify') || name.includes('slack') || name.includes('email')) return '📣';
  if (name.includes('cache') || name.includes('depend') || name.includes('artifact')) return '📦';
  if (name.includes('tag') || name.includes('version')) return '🏷️';
  if (stage?.matrix) return '🧮';
  if (stage?.stages) return '🏗️';
  if (stage?.steps) return '⚙️';
  return '📋';
};

// Color palette per stage category
const getStageColor = (stage, isParallelContainer) => {
  if (isParallelContainer) return { ring: '#a78bfa', bg: 'rgba(167,139,250,0.15)', glow: 'rgba(167,139,250,0.3)' };
  const name = (stage?.name || '').toLowerCase();
  if (name.includes('start') || name.includes('pipeline')) return { ring: '#22d3ee', bg: 'rgba(34,211,238,0.15)', glow: 'rgba(34,211,238,0.3)' };
  if (name.includes('build') || name.includes('compile')) return { ring: '#22d3ee', bg: 'rgba(34,211,238,0.15)', glow: 'rgba(34,211,238,0.3)' };
  if (name.includes('test') || name.includes('unit') || name.includes('integration')) return { ring: '#34d399', bg: 'rgba(52,211,153,0.15)', glow: 'rgba(52,211,153,0.3)' };
  if (name.includes('security') || name.includes('owasp') || name.includes('scan')) return { ring: '#fb7185', bg: 'rgba(251,113,133,0.15)', glow: 'rgba(251,113,133,0.3)' };
  if (name.includes('sonar') || name.includes('quality') || name.includes('lint')) return { ring: '#fbbf24', bg: 'rgba(251,191,36,0.15)', glow: 'rgba(251,191,36,0.3)' };
  if (name.includes('deploy') || name.includes('release')) return { ring: '#f472b6', bg: 'rgba(244,114,182,0.15)', glow: 'rgba(244,114,182,0.3)' };
  if (name.includes('docker') || name.includes('container')) return { ring: '#38bdf8', bg: 'rgba(56,189,248,0.15)', glow: 'rgba(56,189,248,0.3)' };
  if (name.includes('notify') || name.includes('slack')) return { ring: '#a78bfa', bg: 'rgba(167,139,250,0.15)', glow: 'rgba(167,139,250,0.3)' };
  if (name.includes('approval') || name.includes('gate')) return { ring: '#fbbf24', bg: 'rgba(251,191,36,0.15)', glow: 'rgba(251,191,36,0.3)' };
  return { ring: '#94a3b8', bg: 'rgba(148,163,184,0.1)', glow: 'rgba(148,163,184,0.15)' };
};

const CustomStageNode = ({ data, selected, targetPosition, sourcePosition }) => {
  const stage = data.stage;
  const isParallelContainer = data.isParallelContainer;
  const shape = data.nodeShape || 'circle';
  const isSkipped = data.isSkipped || false;
  const isStart = data.isStart || false;

  const name = stage?.name || (isParallelContainer ? 'Parallel Block' : 'Unnamed Stage');
  const isMatrix = !!stage?.matrix;
  const isNested = !!stage?.stages;
  const icon = isStart ? '▶' : (isParallelContainer ? '⑆' : (isMatrix ? '🧮' : (isNested ? '🏗️' : getStageIcon(stage))));
  const colors = getStageColor(stage, isParallelContainer);

  const selectedRing = '#22d3ee';
  const ringColor = selected ? selectedRing : colors.ring;
  const bgColor = selected ? 'rgba(34,211,238,0.12)' : colors.bg;
  const glowColor = selected ? 'rgba(34,211,238,0.5)' : colors.glow;

  const handleStyleVisible = {
    background: ringColor,
    border: '2px solid #0f172a',
    width: 10,
    height: 10,
  };
  const handleStyleHidden = { background: 'transparent', border: 'none', width: 1, height: 1 };

  // ─── CIRCLE MODE (Blue Ocean) ───
  if (shape === 'circle') {
    const circleSize = 100;

    return (
      <div
        className="relative flex flex-col items-center cursor-pointer group"
        style={{
          opacity: isSkipped ? 0.25 : 1,
          filter: isSkipped ? 'grayscale(0.9)' : 'none',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          width: circleSize + 80,
        }}
      >
        <Handle type="target" position={targetPosition || Position.Top} style={handleStyleHidden} />

        {/* Glow backdrop */}
        <div
          style={{
            position: 'absolute',
            width: circleSize + 40,
            height: circleSize + 40,
            top: -20,
            left: '50%',
            transform: 'translateX(-50%)',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 65%)`,
            opacity: selected ? 1 : 0.5,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          }}
        />

        {/* Main circle */}
        <div
          className="relative flex items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110"
          style={{
            width: circleSize,
            height: circleSize,
            background: `radial-gradient(ellipse at 30% 20%, ${bgColor}, rgba(15,23,42,0.95) 80%)`,
            border: `3px solid ${ringColor}`,
            boxShadow: selected
              ? `0 0 30px ${glowColor}, 0 0 60px ${glowColor}, inset 0 0 25px ${bgColor}`
              : `0 0 15px ${glowColor}, inset 0 0 12px ${bgColor}`,
          }}
        >
          <span style={{ fontSize: 36, lineHeight: 1, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>{icon}</span>
        </div>

        {/* Stage label */}
        <div className="mt-4 text-center" style={{ width: circleSize + 80 }}>
          <span
            className="font-bold leading-snug block"
            style={{
              fontSize: 15,
              color: selected ? '#22d3ee' : '#e2e8f0',
              textShadow: selected ? '0 0 12px rgba(34,211,238,0.5)' : '0 1px 4px rgba(0,0,0,0.6)',
              letterSpacing: '0.01em',
            }}
          >
            {name}
          </span>
        </div>

        <Handle type="source" position={sourcePosition || Position.Bottom} style={handleStyleHidden} />
      </div>
    );
  }

  // ─── PILL MODE ───
  return (
    <div
      className="relative rounded-2xl cursor-pointer group transition-all duration-300"
      style={{
        minWidth: 240,
        opacity: isSkipped ? 0.25 : 1,
        filter: isSkipped ? 'grayscale(0.9)' : 'none',
        background: `linear-gradient(145deg, ${bgColor}, rgba(15,23,42,0.95))`,
        border: `2px solid ${ringColor}`,
        boxShadow: selected
          ? `0 0 25px ${glowColor}, 0 4px 20px rgba(0,0,0,0.4)`
          : `0 0 10px ${glowColor}, 0 2px 10px rgba(0,0,0,0.3)`,
        padding: '18px 22px',
      }}
    >
      <Handle type="target" position={targetPosition || Position.Top} style={handleStyleVisible} />

      <div className="flex items-center gap-4">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110"
          style={{
            width: 48,
            height: 48,
            background: bgColor,
            border: `2px solid ${ringColor}`,
            boxShadow: `inset 0 0 10px ${glowColor}`,
          }}
        >
          <span style={{ fontSize: 22 }}>{icon}</span>
        </div>

        <span
          className="font-bold leading-snug break-words"
          style={{
            fontSize: 16,
            maxWidth: 160,
            color: selected ? '#22d3ee' : '#e2e8f0',
            textShadow: selected ? '0 0 8px rgba(34,211,238,0.3)' : 'none',
          }}
        >
          {name}
        </span>
      </div>

      <Handle type="source" position={sourcePosition || Position.Bottom} style={handleStyleVisible} />
    </div>
  );
};

export default CustomStageNode;
