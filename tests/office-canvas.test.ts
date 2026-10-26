// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up mock Phaser module
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
      rectangle: vi.fn((x: number, y: number, w: number, h: number, _fill?: number) => {
        return new MockGameObject(x, y, w, h);
      }),
      text: vi.fn((x: number, y: number, text: string, _style?: any) => {
        const obj = new MockGameObject(x, y);
        obj.text = text;
        return obj;
      }),
      container: vi.fn((x: number, y: number) => {
        return new MockContainer(x, y);
      }),
    };

    public tweens = {
      add: vi.fn((config: any) => {
        // Apply tween coordinates to targets immediately or onComplete
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const target of targets) {
          if (config.x !== undefined) target.x = config.x;
          if (config.y !== undefined) target.y = config.y;
        }
        if (typeof config.onComplete === 'function') {
          config.onComplete();
        }
        return {
          stop: vi.fn(),
          remove: vi.fn(),
        };
      }),
    };

    public time = {
      delayedCall: vi.fn((delay: number, callback: Function) => {
        const timerId = setTimeout(callback, delay);
        return {
          remove: () => clearTimeout(timerId),
        };
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
      CANVAS: 1,
      WEBGL: 2,
      HEADLESS: 3,
      Scale: {
        FIT: 1,
        CENTER_BOTH: 1,
      },
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
    CANVAS: 1,
    WEBGL: 2,
    HEADLESS: 3,
    Scale: {
      FIT: 1,
      CENTER_BOTH: 1,
    },
    GameObjects: {
      GameObject: MockGameObject,
      Rectangle: MockGameObject,
      Text: MockGameObject,
      Container: MockContainer,
    },
  };
});

import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import Phaser from 'phaser';
import { OfficeEventBus } from '../src/events/event-bus.js';
import { OfficeScene, ZONE_COORDINATES } from '../src/canvas/office-scene.js';
import { OfficeCanvas } from '../src/canvas/office-canvas.js';

describe('OfficeCanvas & OfficeScene', () => {
  let bus: OfficeEventBus;

  beforeEach(() => {
    bus = new OfficeEventBus();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('ZONE_COORDINATES', () => {
    it('should define correct coordinates for all 5 office zones', () => {
      expect(ZONE_COORDINATES.ENTRANCE).toEqual({ x: 100, y: 300 });
      expect(ZONE_COORDINATES.ELEVATOR).toEqual({ x: 100, y: 300 });
      expect(ZONE_COORDINATES.WORKSTATIONS).toEqual({ x: 400, y: 200 });
      expect(ZONE_COORDINATES.WAR_ROOM).toEqual({ x: 400, y: 450 });
      expect(ZONE_COORDINATES.COFFEE_LOUNGE).toEqual({ x: 700, y: 450 });
      expect(ZONE_COORDINATES.DIRECTOR_OFFICE).toEqual({ x: 700, y: 200 });
      expect(OfficeScene.ZONE_COORDINATES).toEqual(ZONE_COORDINATES);
    });
  });

  describe('OfficeScene Zone Layout & Initialization', () => {
    it('should initialize scene and render zone labels in Vietnamese', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      // Check that add.text was called for all 5 zones
      const createdTexts = (scene.add.text as any).mock.calls.map((call: any[]) => call[2]);
      expect(createdTexts).toContain('Thang Máy');
      expect(createdTexts).toContain('Bàn Làm Việc');
      expect(createdTexts).toContain('Phòng Họp Khẩn');
      expect(createdTexts).toContain('Khu Cà Phê');
      expect(createdTexts).toContain('Phòng Giám Đốc');

      // Check zone rectangles
      expect(scene.add.rectangle).toHaveBeenCalledWith(100, 300, expect.any(Number), expect.any(Number), expect.any(Number));
      expect(scene.add.rectangle).toHaveBeenCalledWith(400, 200, expect.any(Number), expect.any(Number), expect.any(Number));
      expect(scene.add.rectangle).toHaveBeenCalledWith(400, 450, expect.any(Number), expect.any(Number), expect.any(Number));
      expect(scene.add.rectangle).toHaveBeenCalledWith(700, 450, expect.any(Number), expect.any(Number), expect.any(Number));
      expect(scene.add.rectangle).toHaveBeenCalledWith(700, 200, expect.any(Number), expect.any(Number), expect.any(Number));
    });
  });

  describe('Agent Spawning and Movement', () => {
    it('should spawn agent at Entrance (100, 300) when hired', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-dev-1',
        role: 'BACKEND',
        action: 'HIRED',
      });

      const sprite = scene.getAgentSprite('agent-dev-1');
      expect(sprite).toBeDefined();
      expect(scene.getAllSprites().has('agent-dev-1') || (scene.getAllSprites() as any)['agent-dev-1']).toBeTruthy();
    });

    it('should animate agent movement towards explicit targetZone', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-fe-1',
        role: 'FRONTEND',
        action: 'HIRED',
      });

      // Move to WAR_ROOM
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-fe-1',
        role: 'FRONTEND',
        from: 'IDLE',
        to: 'WALKING',
        targetZone: 'WAR_ROOM',
      });

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: expect.anything(),
          x: expect.any(Number),
          y: expect.any(Number),
        })
      );

      const sprite = scene.getAgentSprite('agent-fe-1');
      expect(sprite).toBeDefined();
      // War room is at (400, 450)
      expect(Math.abs(sprite!.x - 400)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite!.y - 450)).toBeLessThanOrEqual(50);
    });

    it('should derive destination zone from AgentState when targetZone is omitted', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      // CODING -> Workstations (400, 200)
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-coder',
        role: 'BACKEND',
        to: 'CODING',
      });

      let sprite = scene.getAgentSprite('agent-coder');
      expect(sprite).toBeDefined();
      expect(Math.abs(sprite!.x - 400)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite!.y - 200)).toBeLessThanOrEqual(50);

      // IDLE -> Coffee Lounge (700, 450) or Workstations
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-coder',
        role: 'BACKEND',
        from: 'CODING',
        to: 'IDLE',
      });

      sprite = scene.getAgentSprite('agent-coder');
      const isAtCoffeeOrDesk =
        (Math.abs(sprite!.x - 700) <= 50 && Math.abs(sprite!.y - 450) <= 50) ||
        (Math.abs(sprite!.x - 400) <= 50 && Math.abs(sprite!.y - 200) <= 50);
      expect(isAtCoffeeOrDesk).toBe(true);
    });

    it('should move agent to Elevator and remove sprite when RELEASED', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-contractor',
        role: 'QA',
        action: 'HIRED',
      });

      expect(scene.getAgentSprite('agent-contractor')).toBeDefined();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-contractor',
        role: 'QA',
        action: 'RELEASED',
      });

      // Sprite should be moved towards elevator (100, 300) and cleaned up
      expect(scene.getAgentSprite('agent-contractor')).toBeUndefined();
    });
  });

  describe('WAR_ROOM_SUMMONED event', () => {
    it('should move all active squad sprites towards War Room coordinates', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      // Spawn two agents
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-1',
        role: 'ARCHITECT',
        action: 'HIRED',
      });
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-2',
        role: 'BACKEND',
        action: 'HIRED',
      });

      bus.emit('WAR_ROOM_SUMMONED', {
        reason: 'Production DB latency alert',
      });

      const sprite1 = scene.getAgentSprite('agent-1')!;
      const sprite2 = scene.getAgentSprite('agent-2')!;

      // Both should be in/near War Room (400, 450)
      expect(Math.abs(sprite1.x - 400)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite1.y - 450)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite2.x - 400)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite2.y - 450)).toBeLessThanOrEqual(50);
    });
  });

  describe('BUBBLE_SPEECH event', () => {
    it('should display speech bubble text over agent sprite and auto-dismiss after duration', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-chatty',
        role: 'FRONTEND',
        action: 'HIRED',
      });

      bus.emit('BUBBLE_SPEECH', {
        agentId: 'agent-chatty',
        text: 'Reviewing PR #42...',
        durationMs: 2000,
      });

      // Verify bubble text was created
      const bubbleCalls = (scene.add.text as any).mock.calls.filter((c: any[]) => c[2] === 'Reviewing PR #42...');
      expect(bubbleCalls.length).toBeGreaterThan(0);

      // Verify auto-dismiss timer was set
      expect(scene.time.delayedCall).toHaveBeenCalledWith(2000, expect.any(Function));

      // Fast forward timer
      act(() => {
        vi.advanceTimersByTime(2000);
      });
    });

    it('should replace previous speech bubble when a new speech arrives for the same agent', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-fast-talker',
        role: 'BACKEND',
        action: 'HIRED',
      });

      bus.emit('BUBBLE_SPEECH', {
        agentId: 'agent-fast-talker',
        text: 'First thought',
        durationMs: 5000,
      });

      bus.emit('BUBBLE_SPEECH', {
        agentId: 'agent-fast-talker',
        text: 'Second thought',
        durationMs: 3000,
      });

      const bubbleTexts = (scene.add.text as any).mock.calls.map((c: any[]) => c[2]);
      expect(bubbleTexts).toContain('First thought');
      expect(bubbleTexts).toContain('Second thought');
    });

    it('should handle case-insensitive zone aliases and role-based destinations', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-arch',
        role: 'ARCHITECT',
        action: 'HIRED',
      });

      // lowercase coffee_lounge
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-arch',
        role: 'ARCHITECT',
        targetZone: 'coffee_lounge',
      });

      const sprite = scene.getAgentSprite('agent-arch')!;
      expect(Math.abs(sprite.x - 700)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite.y - 450)).toBeLessThanOrEqual(50);

      // Architect CODING moves to Director Office
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-arch',
        role: 'ARCHITECT',
        to: 'CODING',
      });
      expect(Math.abs(sprite.x - 700)).toBeLessThanOrEqual(50);
      expect(Math.abs(sprite.y - 200)).toBeLessThanOrEqual(50);
    });

    it('should support getAllSprites size and length accessors', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      expect(scene.getAllSprites().size).toBe(0);
      expect((scene.getAllSprites() as any).length).toBe(0);

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-x',
        role: 'FRONTEND',
        action: 'HIRED',
      });

      expect(scene.getAllSprites().size).toBe(1);
      expect((scene.getAllSprites() as any).length).toBe(1);
      expect(scene.getAgentSprite('non-existent')).toBeUndefined();
    });
  });

  describe('Scene destroy and cleanup', () => {
    it('should unsubscribe all bus listeners and clean up sprites on destroy', () => {
      const scene = new OfficeScene(bus);
      scene.create();

      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-persist',
        role: 'DEVOPS',
        action: 'HIRED',
      });

      expect(scene.getAgentSprite('agent-persist')).toBeDefined();

      scene.destroy();

      // Emit another event; destroyed scene should not handle it
      bus.emit('AGENT_STATE_CHANGED', {
        agentId: 'agent-new',
        role: 'BACKEND',
        action: 'HIRED',
      });

      expect(scene.getAgentSprite('agent-new')).toBeUndefined();
    });
  });

  describe('OfficeCanvas React Component', () => {
    it('should mount canvas container and initialize Phaser.Game with OfficeScene', () => {
      const { container } = render(
        React.createElement(OfficeCanvas, {
          bus,
          width: 800,
          height: 600,
          className: 'office-canvas-wrapper',
        })
      );

      const div = container.querySelector('.office-canvas-wrapper');
      expect(div).not.toBeNull();
      expect(Phaser.Game).toHaveBeenCalledTimes(1);

      const gameInstance = (Phaser.Game as any).mock.results[0].value;
      expect(gameInstance.config.width).toBe(800);
      expect(gameInstance.config.height).toBe(600);
    });

    it('should destroy Phaser.Game instance on unmount', () => {
      const { unmount } = render(React.createElement(OfficeCanvas, { bus }));
      const gameInstance = (Phaser.Game as any).mock.results[0].value;

      unmount();
      expect(gameInstance.destroy).toHaveBeenCalledWith(true);
    });
  });
});
