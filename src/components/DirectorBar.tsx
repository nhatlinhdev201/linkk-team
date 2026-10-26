import React, { useState, useEffect } from 'react';
import { AgentRole } from '../types/office.js';
import { SquadManager } from '../orchestration/squad-manager.js';
import { OfficeEventBus } from '../events/event-bus.js';

export interface DirectorBarProps {
  squadManager?: SquadManager;
  bus?: OfficeEventBus;
  activeSquadCount?: number;
  currentSpend?: number;
  budgetCap?: number;
  simulationSpeed?: number;
  isPaused?: boolean;
  onOpenSettings?: () => void;
  onHireAgent?: (role: AgentRole) => void;
  onSummonWarRoom?: (reason?: string) => void;
  onSpeedChange?: (speed: number) => void;
  onTogglePause?: (paused: boolean) => void;
  className?: string;
}

const ROLES: AgentRole[] = ['ARCHITECT', 'FRONTEND', 'BACKEND', 'QA', 'DEVOPS'];
const SPEEDS = [1.0, 1.5, 2.0];

export const DirectorBar: React.FC<DirectorBarProps> = ({
  squadManager,
  bus,
  activeSquadCount,
  currentSpend = 0,
  budgetCap = 5.0,
  simulationSpeed = 1.0,
  isPaused: controlledPaused,
  onOpenSettings,
  onHireAgent,
  onSummonWarRoom,
  onSpeedChange,
  onTogglePause,
  className = '',
}) => {
  const [selectedRole, setSelectedRole] = useState<AgentRole>('FRONTEND');
  const [internalPaused, setInternalPaused] = useState<boolean>(false);
  const [currentSpeed, setCurrentSpeed] = useState<number>(simulationSpeed);
  const [, setTick] = useState<number>(0);

  const isPaused = controlledPaused !== undefined ? controlledPaused : internalPaused;

  useEffect(() => {
    setCurrentSpeed(simulationSpeed);
  }, [simulationSpeed]);

  // Keep squad count synchronized with bus events
  useEffect(() => {
    if (!bus) return;
    const unsub = bus.subscribe('AGENT_STATE_CHANGED', () => {
      setTick((t) => t + 1);
    });
    return unsub;
  }, [bus]);

  const squadCount =
    activeSquadCount !== undefined
      ? activeSquadCount
      : squadManager
      ? squadManager.getSquadSize()
      : 0;

  const handleSummonWarRoom = () => {
    const reason = 'Emergency War Room Summoned';
    if (squadManager) {
      squadManager.summonWarRoom(reason);
    }
    if (onSummonWarRoom) {
      onSummonWarRoom(reason);
    }
  };

  const handleHireAgent = () => {
    const agentId = `agent-${selectedRole.toLowerCase()}-${Date.now().toString(36)}`;
    if (squadManager) {
      squadManager.hireAgent(agentId, selectedRole);
    }
    if (onHireAgent) {
      onHireAgent(selectedRole);
    }
    setTick((t) => t + 1);
  };

  const handleSpeedChange = (speed: number) => {
    setCurrentSpeed(speed);
    if (onSpeedChange) {
      onSpeedChange(speed);
    }
  };

  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setInternalPaused(nextPaused);
    if (onTogglePause) {
      onTogglePause(nextPaused);
    }
  };

  return (
    <div
      data-testid="director-bar"
      className={`director-bar-container ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '12px 16px',
        color: '#f8fafc',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Squad & Budget Metrics */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          data-testid="squad-count"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#1e293b',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          <span>👥 Squad:</span>
          <span style={{ color: '#38bdf8' }}>{squadCount}</span>
        </div>

        <div
          data-testid="budget-display"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#1e293b',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          <span>💰 Budget:</span>
          <span style={{ color: currentSpend > budgetCap * 0.8 ? '#f87171' : '#34d399' }}>
            ${currentSpend.toFixed(2)} / ${budgetCap.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Center: Command Controls (War Room & Hire) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          data-testid="btn-summon-war-room"
          onClick={handleSummonWarRoom}
          style={{
            backgroundColor: '#b91c1c',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(185, 28, 28, 0.4)',
          }}
        >
          🚨 Summon War Room
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#1e293b',
            padding: '4px 6px',
            borderRadius: '6px',
            border: '1px solid #334155',
          }}
        >
          <select
            data-testid="select-hire-role"
            aria-label="Agent Role"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as AgentRole)}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #475569',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <button
            data-testid="btn-hire-agent"
            onClick={handleHireAgent}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ➕ Hire Agent
          </button>
        </div>
      </div>

      {/* Right: Simulation Controls & Settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Simulation Speed Toggles */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid #334155',
          }}
        >
          {SPEEDS.map((speed) => {
            const isSelected = currentSpeed === speed;
            return (
              <button
                key={speed}
                data-testid={`btn-speed-${speed}x`}
                onClick={() => handleSpeedChange(speed)}
                style={{
                  backgroundColor: isSelected ? '#3b82f6' : 'transparent',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {speed}x
              </button>
            );
          })}
        </div>

        {/* Pause / Resume Button */}
        <button
          data-testid="btn-pause-toggle"
          onClick={handleTogglePause}
          style={{
            backgroundColor: isPaused ? '#15803d' : '#475569',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: '82px',
          }}
        >
          {isPaused ? '▶️ Resume' : '⏸️ Pause'}
        </button>

        {/* Settings Modal Button */}
        <button
          data-testid="btn-open-settings"
          onClick={onOpenSettings}
          style={{
            backgroundColor: '#334155',
            color: '#e2e8f0',
            border: '1px solid #475569',
            borderRadius: '6px',
            padding: '6px 12px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ⚙️ Settings
        </button>
      </div>
    </div>
  );
};
