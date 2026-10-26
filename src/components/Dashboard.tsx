import React, { useState, useEffect } from 'react';
import { OfficeConfig, Task, TaskStatus } from '../types/office.js';
import { OfficeEventBus } from '../events/event-bus.js';
import { SquadManager } from '../orchestration/squad-manager.js';
import { ConfigManager, DEFAULT_CONFIG, UpdateOfficeConfig } from '../config/config-manager.js';
import { OfficeCanvas } from '../canvas/office-canvas.js';
import { DirectorBar } from './DirectorBar.js';
import { KanbanBoard } from './KanbanBoard.js';
import { ThoughtInspector } from './ThoughtInspector.js';
import { SettingsModal } from './SettingsModal.js';

export interface DashboardProps {
  bus: OfficeEventBus;
  squadManager?: SquadManager;
  configManager?: ConfigManager;
  tasks?: Task[];
  onMoveTask?: (taskId: string, newStatus: TaskStatus) => void;
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  bus,
  squadManager,
  configManager,
  tasks: initialTasks = [],
  onMoveTask,
  className = '',
}) => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [config, setConfig] = useState<OfficeConfig>(() => {
    return configManager ? configManager.getConfig() : structuredClone(DEFAULT_CONFIG);
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [currentSpend, setCurrentSpend] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(config.simulationSpeed || 1.0);

  // Synchronize internal tasks if initialTasks prop changes
  useEffect(() => {
    if (initialTasks) {
      setTasks(initialTasks);
    }
  }, [initialTasks]);

  // Subscribe to QUOTA_WARNING and external TICKET_MOVED events
  useEffect(() => {
    const unsubQuota = bus.subscribe('QUOTA_WARNING', (payload) => {
      setCurrentSpend(payload.currentSpendUsd);
    });

    const unsubTicket = bus.subscribe('TICKET_MOVED', (payload) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === payload.taskId
            ? { ...t, status: payload.toStatus as TaskStatus }
            : t
        )
      );
    });

    return () => {
      unsubQuota();
      unsubTicket();
    };
  }, [bus]);

  const handleMoveTask = (taskId: string, newStatus: TaskStatus) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    const fromStatus = targetTask ? targetTask.status : '';

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    bus.emit('TICKET_MOVED', {
      taskId,
      epicId: targetTask?.epicId || 'GLOBAL',
      fromStatus,
      toStatus: newStatus,
      agentId: targetTask?.assignedAgentId,
    });

    if (onMoveTask) {
      onMoveTask(taskId, newStatus);
    }
  };

  const handleSaveConfig = (newCfg: Partial<OfficeConfig>) => {
    const updated: OfficeConfig = {
      ...config,
      ...newCfg,
      roleModels: {
        ...config.roleModels,
        ...(newCfg.roleModels || {}),
      },
    };

    setConfig(updated);

    if (configManager) {
      configManager.updateConfig(newCfg as UpdateOfficeConfig);
    }
  };

  return (
    <div
      data-testid="executive-dashboard"
      className={`dashboard-root ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#020617',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '16px',
        boxSizing: 'border-box',
        gap: '16px',
      }}
    >
      {/* Header Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
            🏢 2D Agent Office
          </h1>
          <span
            style={{
              backgroundColor: isPaused ? '#854d0e' : '#065f46',
              color: isPaused ? '#fef08a' : '#a7f3d0',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {isPaused ? '⏸️ Paused' : '🟢 Simulation Active'}
          </span>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          Executive Control & Intelligence Center
        </div>
      </header>

      {/* Top Director Bar */}
      <DirectorBar
        squadManager={squadManager}
        bus={bus}
        budgetCap={config.defaultBudgetCapUsd}
        currentSpend={currentSpend}
        simulationSpeed={simulationSpeed}
        isPaused={isPaused}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSpeedChange={(speed) => setSimulationSpeed(speed)}
        onTogglePause={(paused) => setIsPaused(paused)}
      />

      {/* Main Simulation & Live Inspector Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(600px, 1fr) minmax(320px, 380px)',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Phaser 2D Canvas */}
        <div
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '600px',
          }}
        >
          <OfficeCanvas bus={bus} width={800} height={600} />
        </div>

        {/* Live Thought Inspector */}
        <div style={{ height: '600px', display: 'flex' }}>
          <ThoughtInspector bus={bus} />
        </div>
      </div>

      {/* Bottom Kanban Board */}
      <KanbanBoard tasks={tasks} onMoveTask={handleMoveTask} />

      {/* Office Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
      />
    </div>
  );
};
