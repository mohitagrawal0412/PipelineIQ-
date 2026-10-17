import React, { useState } from 'react';

const StageNode = ({ stage, x, y, width, height, isSelected, onClick, isParallel }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Colors
  const colors = {
    slate900: '#0f172a',
    slate800: '#1e293b',
    slate700: '#334155',
    slate600: '#475569',
    slate300: '#cbd5e1',
    cyan400: '#22d3ee',
    purple400: '#c084fc',
    amber400: '#fbbf24',
    emerald400: '#34d399',
    rose400: '#fb7185',
    white: '#ffffff',
  };

  const hasWhen = stage?.when !== undefined;
  const hasTimeout = stage?.options?.some(opt => opt.name === 'timeout' || opt.timeout);
  const hasAgent = stage?.agent !== undefined;
  const hasPost = stage?.post !== undefined;
  const isParallelContainer = stage?.parallel !== undefined || isParallel;

  const bgFill = isSelected ? colors.slate700 : colors.slate800;
  
  let strokeColor = colors.slate600;
  if (isSelected) strokeColor = colors.cyan400;
  else if (isParallelContainer) strokeColor = colors.purple400;
  else if (isHovered) strokeColor = colors.slate300;

  const strokeDasharray = hasWhen ? '4,4' : 'none';



  // Truncate name
  const name = stage?.name || 'Unnamed Stage';
  const displayName = name.length > 20 ? name.substring(0, 18) + '...' : name;

  // Center coordinates
  const cx = x + width / 2;
  const cy = y + height / 2;
  
  const scale = isHovered ? 1.02 : 1;
  const transform = `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`;

  return (
    <g 
      transform={transform}
      onClick={() => onClick(stage)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <defs>
        <filter id={`glow-${stage?.name?.replace(/[^a-zA-Z0-9]/g, '') || 'node'}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id={`shadow-${stage?.name?.replace(/[^a-zA-Z0-9]/g, '') || 'node'}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Glow Layer */}
      {(isSelected || isHovered) && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={8}
          ry={8}
          fill="none"
          stroke={isSelected ? colors.cyan400 : colors.slate400}
          strokeWidth="3"
          opacity={isSelected ? "0.6" : "0.3"}
          filter={`url(#glow-${stage?.name?.replace(/[^a-zA-Z0-9]/g, '') || 'node'})`}
        />
      )}
      
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={bgFill}
        stroke={strokeColor}
        strokeWidth={isSelected ? 2 : (isHovered ? 1.5 : 1)}
        strokeDasharray={strokeDasharray}
        filter={`url(#shadow-${stage?.name?.replace(/[^a-zA-Z0-9]/g, '') || 'node'})`}
        style={{ transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
      
      <text
        x={x + width / 2}
        y={y + 35}
        fill={colors.white}
        fontSize="13"
        fontWeight="bold"
        textAnchor="middle"
        pointerEvents="none"
      >
        {displayName}
      </text>


    </g>
  );
};

export default StageNode;
