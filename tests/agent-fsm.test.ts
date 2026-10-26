import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OfficeEventBus,
  AgentStateChangedPayload,
  TicketMovedPayload,
  BubbleSpeechPayload,
  WarRoomSummonedPayload,
  QuotaWarningPayload,
} from '../src/events/event-bus.js';
import { AgentStateMachine, VALID_TRANSITIONS } from '../src/orchestration/agent-fsm.js';
import { AgentRole, AgentState } from '../src/types/office.js';

describe('OfficeEventBus', () => {
  let bus: OfficeEventBus;

  beforeEach(() => {
    bus = new OfficeEventBus();
  });

  it('subscribes to AGENT_STATE_CHANGED and receives emitted events', () => {
    const callback = vi.fn();
    const unsubscribe = bus.subscribe('AGENT_STATE_CHANGED', callback);

    const payload: AgentStateChangedPayload = {
      agentId: 'agent-1',
      role: 'BACKEND',
      from: 'IDLE',
      to: 'THINKING',
      reason: 'Starting task',
      targetZone: 'zone-desk',
    };

    bus.emit('AGENT_STATE_CHANGED', payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);

    unsubscribe();
    bus.emit('AGENT_STATE_CHANGED', payload);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('subscribes to and emits TICKET_MOVED events', () => {
    const callback = vi.fn();
    bus.subscribe('TICKET_MOVED', callback);

    const payload: TicketMovedPayload = {
      taskId: 'TASK-1',
      epicId: 'EPIC-1',
      fromStatus: 'TODO',
      toStatus: 'IN_PROGRESS',
      agentId: 'agent-1',
    };

    bus.emit('TICKET_MOVED', payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('subscribes to and emits BUBBLE_SPEECH events', () => {
    const callback = vi.fn();
    bus.subscribe('BUBBLE_SPEECH', callback);

    const payload: BubbleSpeechPayload = {
      agentId: 'agent-2',
      text: 'Refactoring the authentication service',
      durationMs: 3000,
    };

    bus.emit('BUBBLE_SPEECH', payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('subscribes to and emits WAR_ROOM_SUMMONED events', () => {
    const callback = vi.fn();
    bus.subscribe('WAR_ROOM_SUMMONED', callback);

    const payload: WarRoomSummonedPayload = {
      reason: 'Build pipeline failure on main branch',
      timestamp: new Date().toISOString(),
    };

    bus.emit('WAR_ROOM_SUMMONED', payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('subscribes to and emits QUOTA_WARNING events', () => {
    const callback = vi.fn();
    bus.subscribe('QUOTA_WARNING', callback);

    const payload: QuotaWarningPayload = {
      epicId: 'EPIC-1',
      currentSpendUsd: 4.85,
      budgetCapUsd: 5.0,
    };

    bus.emit('QUOTA_WARNING', payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('supports multiple listeners for the same event and clears all listeners', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.subscribe('BUBBLE_SPEECH', cb1);
    bus.subscribe('BUBBLE_SPEECH', cb2);

    bus.emit('BUBBLE_SPEECH', { agentId: 'agent-1', text: 'Hello' });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    bus.clearListeners();

    bus.emit('BUBBLE_SPEECH', { agentId: 'agent-1', text: 'World' });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('safely handles unsubscription during event emission', () => {
    const order: number[] = [];
    let unsub2: () => void;

    bus.subscribe('BUBBLE_SPEECH', () => {
      order.push(1);
      unsub2();
    });

    unsub2 = bus.subscribe('BUBBLE_SPEECH', () => {
      order.push(2);
    });

    bus.subscribe('BUBBLE_SPEECH', () => {
      order.push(3);
    });

    bus.emit('BUBBLE_SPEECH', { agentId: 'agent-1', text: 'Test' });

    expect(order).toEqual([1, 2, 3]);

    order.length = 0;
    bus.emit('BUBBLE_SPEECH', { agentId: 'agent-1', text: 'Second' });
    expect(order).toEqual([1, 3]);
  });

  it('isolates listener errors so failing listener does not prevent subsequent listeners from executing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingCallback = vi.fn(() => {
      throw new Error('Listener failed unexpectedly');
    });
    const succeedingCallback = vi.fn();

    bus.subscribe('BUBBLE_SPEECH', failingCallback);
    bus.subscribe('BUBBLE_SPEECH', succeedingCallback);

    expect(() => {
      bus.emit('BUBBLE_SPEECH', { agentId: 'agent-1', text: 'Resilience test' });
    }).not.toThrow();

    expect(failingCallback).toHaveBeenCalledTimes(1);
    expect(succeedingCallback).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('AgentStateMachine', () => {
  let bus: OfficeEventBus;

  beforeEach(() => {
    bus = new OfficeEventBus();
  });

  it('initializes with IDLE by default or with specified initial state', () => {
    const agent1 = new AgentStateMachine('agent-1', 'ARCHITECT', bus);
    expect(agent1.getState()).toBe('IDLE');
    expect(agent1.id).toBe('agent-1');
    expect(agent1.role).toBe('ARCHITECT');

    const agent2 = new AgentStateMachine('agent-2', 'QA', bus, 'WALKING');
    expect(agent2.getState()).toBe('WALKING');
    expect(agent2.id).toBe('agent-2');
    expect(agent2.role).toBe('QA');
  });

  it('transitions through valid lifecycle states and emits AGENT_STATE_CHANGED', () => {
    const agent = new AgentStateMachine('agent-fe', 'FRONTEND', bus);
    const busListener = vi.fn();
    bus.subscribe('AGENT_STATE_CHANGED', busListener);

    agent.transition('WALKING', 'Going to desk', 'desk-zone');
    expect(agent.getState()).toBe('WALKING');

    expect(busListener).toHaveBeenCalledTimes(1);
    expect(busListener).toHaveBeenCalledWith({
      agentId: 'agent-fe',
      role: 'FRONTEND',
      from: 'IDLE',
      to: 'WALKING',
      reason: 'Going to desk',
      targetZone: 'desk-zone',
    });

    agent.transition('CODING', 'Writing React component');
    expect(agent.getState()).toBe('CODING');
    expect(busListener).toHaveBeenCalledTimes(2);
    expect(busListener).toHaveBeenLastCalledWith({
      agentId: 'agent-fe',
      role: 'FRONTEND',
      from: 'WALKING',
      to: 'CODING',
      reason: 'Writing React component',
    });
  });

  it('onStateChange registers callback for state changes of this agent only and returns unsubscribe', () => {
    const agent1 = new AgentStateMachine('agent-1', 'BACKEND', bus);
    const agent2 = new AgentStateMachine('agent-2', 'DEVOPS', bus);

    const cb1 = vi.fn();
    const unsub1 = agent1.onStateChange(cb1);

    const cb2 = vi.fn();
    agent2.onStateChange(cb2);

    agent1.transition('WALKING');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb1).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        from: 'IDLE',
        to: 'WALKING',
      })
    );
    expect(cb2).not.toHaveBeenCalled();

    agent2.transition('THINKING');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-2',
        from: 'IDLE',
        to: 'THINKING',
      })
    );

    unsub1();
    agent1.transition('CODING');
    expect(cb1).toHaveBeenCalledTimes(1);
  });

  it('throws descriptive error on invalid transition and does not change state or emit event', () => {
    const agent = new AgentStateMachine('agent-1', 'BACKEND', bus, 'IDLE');
    const busListener = vi.fn();
    bus.subscribe('AGENT_STATE_CHANGED', busListener);

    // IDLE -> CODING is invalid
    expect(() => {
      agent.transition('CODING');
    }).toThrow(/Invalid.*transition.*IDLE.*CODING/i);

    expect(agent.getState()).toBe('IDLE');
    expect(busListener).not.toHaveBeenCalled();

    // IDLE -> CELEBRATING is invalid
    expect(() => {
      agent.transition('CELEBRATING');
    }).toThrow(/Invalid.*transition.*IDLE.*CELEBRATING/i);

    expect(agent.getState()).toBe('IDLE');
    expect(busListener).not.toHaveBeenCalled();

    // IDLE -> IDLE is invalid
    expect(() => {
      agent.transition('IDLE');
    }).toThrow(/Invalid.*transition.*IDLE.*IDLE/i);
  });

  it('validates every transition according to the lifecycle specifications', () => {
    const testTransitions: Record<AgentState, AgentState[]> = {
      IDLE: ['WALKING', 'THINKING', 'TALKING'],
      WALKING: ['THINKING', 'CODING', 'REVIEWING', 'IDLE', 'TALKING'],
      THINKING: ['CODING', 'TALKING', 'REVIEWING', 'IDLE', 'WALKING'],
      CODING: ['REVIEWING', 'THINKING', 'CELEBRATING', 'IDLE'],
      TALKING: ['THINKING', 'CODING', 'WALKING', 'IDLE'],
      REVIEWING: ['CELEBRATING', 'CODING', 'IDLE'],
      CELEBRATING: ['IDLE', 'WALKING'],
    };

    expect(VALID_TRANSITIONS).toEqual(testTransitions);

    const allStates: AgentState[] = [
      'IDLE',
      'WALKING',
      'THINKING',
      'CODING',
      'TALKING',
      'REVIEWING',
      'CELEBRATING',
    ];

    for (const fromState of allStates) {
      const allowed = testTransitions[fromState];

      // Test all allowed transitions
      for (const toState of allowed) {
        const agent = new AgentStateMachine('test-agent', 'BACKEND', bus, fromState);
        expect(() => agent.transition(toState)).not.toThrow();
        expect(agent.getState()).toBe(toState);
      }

      // Test all disallowed transitions
      const disallowed = allStates.filter((s) => !allowed.includes(s));
      for (const toState of disallowed) {
        const agent = new AgentStateMachine('test-agent', 'BACKEND', bus, fromState);
        expect(() => agent.transition(toState)).toThrow();
        expect(agent.getState()).toBe(fromState);
      }
    }
  });

  it('canTransition returns true for allowed and false for disallowed transitions', () => {
    const agent = new AgentStateMachine('agent-qa', 'QA', bus, 'IDLE');

    expect(agent.canTransition('WALKING')).toBe(true);
    expect(agent.canTransition('THINKING')).toBe(true);
    expect(agent.canTransition('TALKING')).toBe(true);
    expect(agent.canTransition('CODING')).toBe(false);
    expect(agent.canTransition('REVIEWING')).toBe(false);
    expect(agent.canTransition('CELEBRATING')).toBe(false);
    expect(agent.canTransition('IDLE')).toBe(false);
  });
});
