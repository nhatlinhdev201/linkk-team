// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { OfficeEventBus } from '../src/events/event-bus.js';
import { SquadManager } from '../src/orchestration/squad-manager.js';
import { ConfigManager, DEFAULT_CONFIG } from '../src/config/config-manager.js';
import { Task, TaskStatus, AgentRole, OfficeConfig } from '../src/types/office.js';
import { KanbanBoard } from '../src/components/KanbanBoard.js';
import { ThoughtInspector } from '../src/components/ThoughtInspector.js';
import { DirectorBar } from '../src/components/DirectorBar.js';
import { SettingsModal } from '../src/components/SettingsModal.js';
import { Dashboard } from '../src/components/Dashboard.js';

// Mock Phaser module so OfficeCanvas mounts safely in jsdom
vi.mock('phaser', () => {
  class MockGameObject {
    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public text?: string;
    public active: boolean = true;
    public destroyed: boolean = false;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }

    setOrigin(_x?: number, _y?: number) {
      return this;
    }

    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }

    destroy() {
      this.active = false;
      this.destroyed = true;
    }
  }

  class MockContainer extends MockGameObject {
    public children: any[] = [];

    add(child: any) {
      this.children.push(child);
      return this;
    }

    remove(child: any) {
      this.children = this.children.filter((c) => c !== child);
      return this;
    }

    override destroy() {
      super.destroy();
      for (const child of this.children) {
        if (child.destroy) child.destroy();
      }
      this.children = [];
    }
  }

  class MockScene {
    public key: string;
    public sys = {
      settings: { data: {} },
      events: {
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      },
    };

    public add = {
      rectangle: vi.fn((x: number, y: number, w: number, h: number) => {
        return new MockGameObject(x, y, w, h);
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const obj = new MockGameObject(x, y);
        obj.text = text;
        return obj;
      }),
      container: vi.fn((x: number, y: number) => {
        return new MockContainer(x, y);
      }),
    };

    public tweens = {
      killTweensOf: vi.fn(),
      add: vi.fn(() => ({ stop: vi.fn(), remove: vi.fn() })),
    };

    public time = {
      delayedCall: vi.fn((delay: number, callback: Function) => {
        const id = setTimeout(callback, delay);
        return { remove: () => clearTimeout(id) };
      }),
    };

    constructor(config?: any) {
      this.key = typeof config === 'string' ? config : config?.key || 'MockScene';
    }
  }

  const mockGameDestroy = vi.fn();
  const MockGame = vi.fn().mockImplementation(function (this: any, config: any) {
    this.config = config;
    this.destroy = mockGameDestroy;
    return this;
  });

  return {
    default: {
      Scene: MockScene,
      Game: MockGame,
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 1 },
      GameObjects: {
        GameObject: MockGameObject,
        Rectangle: MockGameObject,
        Text: MockGameObject,
        Container: MockContainer,
      },
    },
    Scene: MockScene,
    Game: MockGame,
    AUTO: 0,
    Scale: { FIT: 1, CENTER_BOTH: 1 },
    GameObjects: {
      GameObject: MockGameObject,
      Rectangle: MockGameObject,
      Text: MockGameObject,
      Container: MockContainer,
    },
  };
});

describe('Dashboard Component Suite', () => {
  let bus: OfficeEventBus;

  beforeEach(() => {
    bus = new OfficeEventBus();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('KanbanBoard', () => {
    const mockTasks: Task[] = [
      { id: 'TASK-1', epicId: 'EPIC-1', title: 'Setup auth proxy', status: 'BACKLOG', assignedAgentId: 'agent-devops-1' },
      { id: 'TASK-2', epicId: 'EPIC-1', title: 'Design database schema', status: 'TODO', assignedAgentId: 'agent-arch-1' },
      { id: 'TASK-3', epicId: 'EPIC-1', title: 'Implement login API', status: 'IN_PROGRESS', assignedAgentId: 'agent-be-1' },
      { id: 'TASK-4', epicId: 'EPIC-1', title: 'Review PR for login', status: 'IN_REVIEW', assignedAgentId: 'agent-qa-1' },
      { id: 'TASK-5', epicId: 'EPIC-1', title: 'Deploy frontend assets', status: 'DONE', assignedAgentId: 'agent-fe-1' },
    ];

    it('should render all 5 status columns and task items', () => {
      render(React.createElement(KanbanBoard, { tasks: mockTasks }));

      // Verify all 5 columns exist
      expect(screen.getByTestId('kanban-column-BACKLOG')).toBeDefined();
      expect(screen.getByTestId('kanban-column-TODO')).toBeDefined();
      expect(screen.getByTestId('kanban-column-IN_PROGRESS')).toBeDefined();
      expect(screen.getByTestId('kanban-column-IN_REVIEW')).toBeDefined();
      expect(screen.getByTestId('kanban-column-DONE')).toBeDefined();

      // Verify task titles and IDs are displayed
      expect(screen.getByText('Setup auth proxy')).toBeDefined();
      expect(screen.getByText('TASK-1')).toBeDefined();
      expect(screen.getByText('agent-devops-1')).toBeDefined();

      expect(screen.getByText('Implement login API')).toBeDefined();
      expect(screen.getByText('TASK-3')).toBeDefined();
      expect(screen.getByText('agent-be-1')).toBeDefined();
    });

    it('should call onMoveTask callback when a task status is changed', () => {
      const onMoveTask = vi.fn();
      render(React.createElement(KanbanBoard, { tasks: mockTasks, onMoveTask }));

      const select = screen.getByTestId('task-move-select-TASK-1') as HTMLSelectElement;
      expect(select).toBeDefined();

      fireEvent.change(select, { target: { value: 'IN_PROGRESS' } });
      expect(onMoveTask).toHaveBeenCalledWith('TASK-1', 'IN_PROGRESS');
    });

    it('should handle unassigned tasks gracefully', () => {
      const tasksWithUnassigned: Task[] = [
        { id: 'TASK-6', epicId: 'EPIC-1', title: 'Write unit tests', status: 'TODO' },
      ];
      render(React.createElement(KanbanBoard, { tasks: tasksWithUnassigned }));

      expect(screen.getByText('Write unit tests')).toBeDefined();
      expect(screen.getByText('Unassigned')).toBeDefined();
    });
  });

  describe('DirectorBar', () => {
    it('should trigger War Room summon when Summon War Room button is clicked', () => {
      const squadManager = new SquadManager(bus);
      const summonSpy = vi.spyOn(squadManager, 'summonWarRoom');
      const onSummonWarRoom = vi.fn();

      render(
        React.createElement(DirectorBar, {
          squadManager,
          bus,
          onSummonWarRoom,
        })
      );

      const summonBtn = screen.getByTestId('btn-summon-war-room');
      fireEvent.click(summonBtn);

      expect(summonSpy).toHaveBeenCalled();
      expect(onSummonWarRoom).toHaveBeenCalled();
    });

    it('should emit WAR_ROOM_SUMMONED to bus when squadManager is omitted', () => {
      const warRoomSpy = vi.fn();
      bus.subscribe('WAR_ROOM_SUMMONED', warRoomSpy);

      render(React.createElement(DirectorBar, { bus }));

      const summonBtn = screen.getByTestId('btn-summon-war-room');
      fireEvent.click(summonBtn);

      expect(warRoomSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Emergency War Room Summoned',
        })
      );
    });

    it('should hire agent when Hire Agent button is clicked with chosen role', () => {
      const squadManager = new SquadManager(bus);
      const hireSpy = vi.spyOn(squadManager, 'hireAgent');
      const onHireAgent = vi.fn();

      render(
        React.createElement(DirectorBar, {
          squadManager,
          bus,
          onHireAgent,
        })
      );

      const roleSelect = screen.getByTestId('select-hire-role') as HTMLSelectElement;
      fireEvent.change(roleSelect, { target: { value: 'DEVOPS' } });

      const hireBtn = screen.getByTestId('btn-hire-agent');
      fireEvent.click(hireBtn);

      expect(hireSpy).toHaveBeenCalledWith(expect.any(String), 'DEVOPS');
      expect(onHireAgent).toHaveBeenCalledWith('DEVOPS');
    });

    it('should trigger Settings modal opening when Settings button is clicked', () => {
      const onOpenSettings = vi.fn();
      render(React.createElement(DirectorBar, { onOpenSettings }));

      const settingsBtn = screen.getByTestId('btn-open-settings');
      fireEvent.click(settingsBtn);

      expect(onOpenSettings).toHaveBeenCalled();
    });

    it('should display active squad count and budget/spend', () => {
      const squadManager = new SquadManager(bus);
      squadManager.hireAgent('agent-1', 'ARCHITECT');
      squadManager.hireAgent('agent-2', 'BACKEND');

      render(
        React.createElement(DirectorBar, {
          squadManager,
          currentSpend: 1.25,
          budgetCap: 5.0,
        })
      );

      expect(screen.getByTestId('squad-count').textContent).toContain('2');
      expect(screen.getByTestId('budget-display').textContent).toContain('$1.25');
      expect(screen.getByTestId('budget-display').textContent).toContain('$5.00');
    });

    it('should toggle simulation speed (1x, 1.5x, 2x)', () => {
      const onSpeedChange = vi.fn();
      render(React.createElement(DirectorBar, { onSpeedChange, simulationSpeed: 1.0 }));

      const speedBtn15 = screen.getByTestId('btn-speed-1.5x');
      fireEvent.click(speedBtn15);

      expect(onSpeedChange).toHaveBeenCalledWith(1.5);
    });

    it('should toggle pause and resume simulation', () => {
      const onTogglePause = vi.fn();
      render(React.createElement(DirectorBar, { onTogglePause, isPaused: false }));

      const pauseBtn = screen.getByTestId('btn-pause-toggle');
      expect(pauseBtn.textContent).toContain('Pause');

      fireEvent.click(pauseBtn);
      expect(onTogglePause).toHaveBeenCalledWith(true);
    });
  });

  describe('SettingsModal', () => {
    const initialConfig: OfficeConfig = structuredClone(DEFAULT_CONFIG);

    it('should not render anything when isOpen is false', () => {
      const { container } = render(
        React.createElement(SettingsModal, {
          isOpen: false,
          onClose: vi.fn(),
          config: initialConfig,
          onSaveConfig: vi.fn(),
        })
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render all configuration fields when isOpen is true', () => {
      render(
        React.createElement(SettingsModal, {
          isOpen: true,
          onClose: vi.fn(),
          config: initialConfig,
          onSaveConfig: vi.fn(),
        })
      );

      expect(screen.getByTestId('settings-modal')).toBeDefined();
      expect(screen.getByTestId('input-proxy-url')).toBeDefined();
      expect(screen.getByTestId('input-api-key')).toBeDefined();
      expect(screen.getByTestId('input-model-ARCHITECT')).toBeDefined();
      expect(screen.getByTestId('input-model-FRONTEND')).toBeDefined();
      expect(screen.getByTestId('input-model-BACKEND')).toBeDefined();
      expect(screen.getByTestId('input-model-QA')).toBeDefined();
      expect(screen.getByTestId('input-model-DEVOPS')).toBeDefined();
      expect(screen.getByTestId('input-sound-enabled')).toBeDefined();
      expect(screen.getByTestId('input-sound-volume')).toBeDefined();
      expect(screen.getByTestId('input-budget-cap')).toBeDefined();
    });

    it('should edit proxy URL and other fields, then save configuration', () => {
      const onSaveConfig = vi.fn();
      const onClose = vi.fn();

      render(
        React.createElement(SettingsModal, {
          isOpen: true,
          onClose,
          config: initialConfig,
          onSaveConfig,
        })
      );

      const proxyInput = screen.getByTestId('input-proxy-url') as HTMLInputElement;
      fireEvent.change(proxyInput, { target: { value: 'https://custom-proxy.internal/v1' } });

      const apiKeyInput = screen.getByTestId('input-api-key') as HTMLInputElement;
      fireEvent.change(apiKeyInput, { target: { value: 'sk-secret-1234' } });

      const budgetInput = screen.getByTestId('input-budget-cap') as HTMLInputElement;
      fireEvent.change(budgetInput, { target: { value: '15.5' } });

      const saveBtn = screen.getByTestId('btn-save-settings');
      fireEvent.click(saveBtn);

      expect(onSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyBaseUrl: 'https://custom-proxy.internal/v1',
          apiKey: 'sk-secret-1234',
          defaultBudgetCapUsd: 15.5,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('should close when cancel button is clicked without saving', () => {
      const onSaveConfig = vi.fn();
      const onClose = vi.fn();

      render(
        React.createElement(SettingsModal, {
          isOpen: true,
          onClose,
          config: initialConfig,
          onSaveConfig,
        })
      );

      const cancelBtn = screen.getByTestId('btn-cancel-settings');
      fireEvent.click(cancelBtn);

      expect(onClose).toHaveBeenCalled();
      expect(onSaveConfig).not.toHaveBeenCalled();
    });

    it('should close when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(
        React.createElement(SettingsModal, {
          isOpen: true,
          onClose,
          config: initialConfig,
          onSaveConfig: vi.fn(),
        })
      );

      const modalBackdrop = screen.getByTestId('settings-modal');
      fireEvent.click(modalBackdrop);

      expect(onClose).toHaveBeenCalled();
    });

    it('should close when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(
        React.createElement(SettingsModal, {
          isOpen: true,
          onClose,
          config: initialConfig,
          onSaveConfig: vi.fn(),
        })
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('ThoughtInspector', () => {
    it('should display incoming speech bubbles from event bus', () => {
      render(React.createElement(ThoughtInspector, { bus }));

      act(() => {
        bus.emit('BUBBLE_SPEECH', {
          agentId: 'agent-qa-1',
          text: 'Running regression tests for payment gateway...',
          durationMs: 4000,
        });
      });

      expect(screen.getAllByText('agent-qa-1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Running regression tests for payment gateway...')).toBeDefined();
    });

    it('should display agent state changes from event bus', () => {
      render(React.createElement(ThoughtInspector, { bus }));

      act(() => {
        bus.emit('AGENT_STATE_CHANGED', {
          agentId: 'agent-fe-2',
          role: 'FRONTEND',
          from: 'IDLE',
          to: 'CODING',
          reason: 'Implementing Kanban Board component',
        });
      });

      expect(screen.getAllByText('agent-fe-2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/CODING/)).toBeDefined();
      expect(screen.getByText(/Implementing Kanban Board component/)).toBeDefined();
    });

    it('should support filtering thoughts by agent', () => {
      render(React.createElement(ThoughtInspector, { bus }));

      act(() => {
        bus.emit('BUBBLE_SPEECH', {
          agentId: 'agent-be',
          text: 'Refactoring database models',
        });
        bus.emit('BUBBLE_SPEECH', {
          agentId: 'agent-fe',
          text: 'Styling dashboard components',
        });
      });

      expect(screen.getByText('Refactoring database models')).toBeDefined();
      expect(screen.getByText('Styling dashboard components')).toBeDefined();

      const filterSelect = screen.getByTestId('select-agent-filter') as HTMLSelectElement;
      fireEvent.change(filterSelect, { target: { value: 'agent-be' } });

      expect(screen.getByText('Refactoring database models')).toBeDefined();
      expect(screen.queryByText('Styling dashboard components')).toBeNull();
    });

    it('should reset filter to ALL when Clear button is clicked', () => {
      render(React.createElement(ThoughtInspector, { bus }));

      act(() => {
        bus.emit('BUBBLE_SPEECH', {
          agentId: 'agent-be',
          text: 'Querying database',
        });
      });

      const filterSelect = screen.getByTestId('select-agent-filter') as HTMLSelectElement;
      fireEvent.change(filterSelect, { target: { value: 'agent-be' } });
      expect(filterSelect.value).toBe('agent-be');

      const clearBtn = screen.getByTestId('btn-clear-thoughts');
      fireEvent.click(clearBtn);

      expect(filterSelect.value).toBe('ALL');
      expect(screen.queryByText('Querying database')).toBeNull();
    });

    it('should clean up subscriptions when unmounted', () => {
      const { unmount } = render(React.createElement(ThoughtInspector, { bus }));
      unmount();

      // Emitting after unmount should not throw or update anything
      expect(() => {
        bus.emit('BUBBLE_SPEECH', {
          agentId: 'agent-after-unmount',
          text: 'No one is listening',
        });
      }).not.toThrow();
    });
  });

  describe('Dashboard Integration', () => {
    it('should mount with all subcomponents integrated cleanly', () => {
      const squadManager = new SquadManager(bus);
      const tasks: Task[] = [
        { id: 'TASK-100', epicId: 'EPIC-1', title: 'Executive Launch Task', status: 'TODO', assignedAgentId: 'agent-arch' },
      ];

      const { container } = render(
        React.createElement(Dashboard, {
          bus,
          squadManager,
          tasks,
        })
      );

      // Verify DirectorBar is present
      expect(screen.getByTestId('director-bar')).toBeDefined();
      // Verify OfficeCanvas is present
      expect(screen.getByTestId('office-canvas-container')).toBeDefined();
      // Verify KanbanBoard is present
      expect(screen.getByTestId('kanban-board')).toBeDefined();
      // Verify ThoughtInspector is present
      expect(screen.getByTestId('thought-inspector')).toBeDefined();
      // Verify SettingsModal is closed initially
      expect(screen.queryByTestId('settings-modal')).toBeNull();
    });

    it('should open SettingsModal from DirectorBar and update config', () => {
      // Mock temporary config file path for ConfigManager if needed
      const tasks: Task[] = [];
      render(
        React.createElement(Dashboard, {
          bus,
          tasks,
        })
      );

      // Open settings
      const settingsBtn = screen.getByTestId('btn-open-settings');
      fireEvent.click(settingsBtn);

      expect(screen.getByTestId('settings-modal')).toBeDefined();

      // Edit proxy URL
      const proxyInput = screen.getByTestId('input-proxy-url') as HTMLInputElement;
      fireEvent.change(proxyInput, { target: { value: 'http://custom-host:9999/v1' } });

      // Save
      const saveBtn = screen.getByTestId('btn-save-settings');
      fireEvent.click(saveBtn);

      // Modal should be closed now
      expect(screen.queryByTestId('settings-modal')).toBeNull();
    });

    it('should move task in KanbanBoard, trigger callback, and emit TICKET_MOVED on bus', () => {
      const onMoveTask = vi.fn();
      const ticketMovedSpy = vi.fn();
      bus.subscribe('TICKET_MOVED', ticketMovedSpy);

      const tasks: Task[] = [
        { id: 'TASK-200', epicId: 'EPIC-MAIN', title: 'Task to move', status: 'TODO', assignedAgentId: 'agent-1' },
      ];

      render(
        React.createElement(Dashboard, {
          bus,
          tasks,
          onMoveTask,
        })
      );

      const select = screen.getByTestId('task-move-select-TASK-200') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'IN_PROGRESS' } });

      expect(onMoveTask).toHaveBeenCalledWith('TASK-200', 'IN_PROGRESS');
      expect(ticketMovedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'TASK-200',
          fromStatus: 'TODO',
          toStatus: 'IN_PROGRESS',
        })
      );
    });

    it('should dynamically update budget and spend display when QUOTA_WARNING is emitted on bus', () => {
      render(React.createElement(Dashboard, { bus }));

      expect(screen.getByTestId('budget-display').textContent).toContain('$0.00');

      act(() => {
        bus.emit('QUOTA_WARNING', {
          epicId: 'EPIC-1',
          currentSpendUsd: 4.25,
          budgetCapUsd: 5.0,
        });
      });

      expect(screen.getByTestId('budget-display').textContent).toContain('$4.25');
    });
  });
});
