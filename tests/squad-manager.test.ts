import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OfficeEventBus, AgentStateChangedPayload, WarRoomSummonedPayload } from '../src/events/event-bus.js';
import { SquadManager } from '../src/orchestration/squad-manager.js';
import { OfficeStorage } from '../src/storage/office-storage.js';

describe('SquadManager', () => {
  let bus: OfficeEventBus;

  beforeEach(() => {
    bus = new OfficeEventBus();
  });

  describe('Dynamic Hiring & Squad Tracking', () => {
    it('hires an agent, registers it in the squad, and returns the AgentStateMachine', () => {
      const manager = new SquadManager(bus);

      const agent = manager.hireAgent('agent-fe-1', 'FRONTEND');

      expect(agent).toBeDefined();
      expect(agent.id).toBe('agent-fe-1');
      expect(agent.role).toBe('FRONTEND');
      expect(agent.getState()).toBe('IDLE');
      expect(manager.getActiveSquad()).toHaveLength(1);
      expect(manager.getActiveSquad()[0]).toBe(agent);
      expect(manager.getAgent('agent-fe-1')).toBe(agent);
    });

    it('throws descriptive error when attempting to hire an agent with duplicate id', () => {
      const manager = new SquadManager(bus);
      manager.hireAgent('agent-fe-1', 'FRONTEND');
      expect(() => {
        manager.hireAgent('agent-fe-1', 'BACKEND');
      }).toThrow("Agent with id 'agent-fe-1' already exists in active squad");
    });

    it('hires an agent with a custom initial state', () => {
      const manager = new SquadManager(bus);

      const agent = manager.hireAgent('agent-qa-1', 'QA', 'WALKING');

      expect(agent.id).toBe('agent-qa-1');
      expect(agent.role).toBe('QA');
      expect(agent.getState()).toBe('WALKING');
    });

    it('emits AGENT_STATE_CHANGED event with action HIRED when hiring', () => {
      const manager = new SquadManager(bus);
      const listener = vi.fn();
      bus.subscribe('AGENT_STATE_CHANGED', listener);

      manager.hireAgent('agent-be-1', 'BACKEND');

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: AgentStateChangedPayload = listener.mock.calls[0][0];
      expect(payload).toEqual({
        agentId: 'agent-be-1',
        role: 'BACKEND',
        from: 'IDLE',
        to: 'IDLE',
        action: 'HIRED',
      });
    });

    it('emits AGENT_STATE_CHANGED with action HIRED preserving custom initial state', () => {
      const manager = new SquadManager(bus);
      const listener = vi.fn();
      bus.subscribe('AGENT_STATE_CHANGED', listener);

      manager.hireAgent('agent-arch-1', 'ARCHITECT', 'THINKING');

      expect(listener).toHaveBeenCalledTimes(1);
      const payload: AgentStateChangedPayload = listener.mock.calls[0][0];
      expect(payload).toEqual({
        agentId: 'agent-arch-1',
        role: 'ARCHITECT',
        from: 'THINKING',
        to: 'THINKING',
        action: 'HIRED',
      });
    });

    it('supports dynamic mid-flight hiring of multiple agents across roles', () => {
      const manager = new SquadManager(bus);

      const arch = manager.hireAgent('arch-1', 'ARCHITECT');
      expect(manager.getActiveSquad()).toHaveLength(1);

      const fe = manager.hireAgent('fe-1', 'FRONTEND');
      expect(manager.getActiveSquad()).toHaveLength(2);

      const be = manager.hireAgent('be-1', 'BACKEND');
      const qa = manager.hireAgent('qa-1', 'QA');
      const devops = manager.hireAgent('ops-1', 'DEVOPS');

      expect(manager.getActiveSquad()).toHaveLength(5);
      const activeIds = manager.getActiveSquad().map((a) => a.id);
      expect(activeIds).toEqual(['arch-1', 'fe-1', 'be-1', 'qa-1', 'ops-1']);
      expect(manager.getAgent('fe-1')).toBe(fe);
      expect(manager.getAgent('ops-1')).toBe(devops);
    });

    it('returns undefined when querying non-existent agent', () => {
      const manager = new SquadManager(bus);
      expect(manager.getAgent('non-existent')).toBeUndefined();
    });
  });

  describe('Releasing Agents', () => {
    it('releases an existing agent, removes from squad, and returns true', () => {
      const manager = new SquadManager(bus);
      const dev = manager.hireAgent('dev-1', 'BACKEND');
      const qa = manager.hireAgent('qa-1', 'QA');

      expect(manager.getActiveSquad()).toHaveLength(2);

      const released = manager.releaseAgent('dev-1');

      expect(released).toBe(true);
      expect(manager.getActiveSquad()).toHaveLength(1);
      expect(manager.getActiveSquad()[0]).toBe(qa);
      expect(manager.getAgent('dev-1')).toBeUndefined();
    });

    it('emits AGENT_STATE_CHANGED with action RELEASED when releasing an agent', () => {
      const manager = new SquadManager(bus);
      const dev = manager.hireAgent('dev-1', 'FRONTEND');
      dev.transition('WALKING');

      const listener = vi.fn();
      bus.subscribe('AGENT_STATE_CHANGED', listener);

      const released = manager.releaseAgent('dev-1');

      expect(released).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      const payload: AgentStateChangedPayload = listener.mock.calls[0][0];
      expect(payload).toEqual({
        agentId: 'dev-1',
        role: 'FRONTEND',
        from: 'WALKING',
        to: 'WALKING',
        action: 'RELEASED',
      });
    });

    it('returns false and does not emit event when releasing non-existent agent', () => {
      const manager = new SquadManager(bus);
      manager.hireAgent('dev-1', 'FRONTEND');

      const listener = vi.fn();
      bus.subscribe('AGENT_STATE_CHANGED', listener);

      const released = manager.releaseAgent('ghost-agent');

      expect(released).toBe(false);
      expect(listener).not.toHaveBeenCalled();
      expect(manager.getActiveSquad()).toHaveLength(1);
    });

    it('releasing all agents empties the squad map', () => {
      const manager = new SquadManager(bus);
      manager.hireAgent('dev-1', 'BACKEND');
      manager.hireAgent('dev-2', 'FRONTEND');

      expect(manager.releaseAgent('dev-1')).toBe(true);
      expect(manager.releaseAgent('dev-2')).toBe(true);
      expect(manager.getActiveSquad()).toHaveLength(0);
      expect(manager.getAgent('dev-1')).toBeUndefined();
      expect(manager.getAgent('dev-2')).toBeUndefined();
    });
  });

  describe('War Room Summons', () => {
    it('emits WAR_ROOM_SUMMONED event with reason and timestamp', () => {
      const manager = new SquadManager(bus);
      const warRoomListener = vi.fn();
      bus.subscribe('WAR_ROOM_SUMMONED', warRoomListener);

      const beforeTime = new Date().toISOString();
      manager.summonWarRoom('Critical production bug detected');
      const afterTime = new Date().toISOString();

      expect(warRoomListener).toHaveBeenCalledTimes(1);
      const payload: WarRoomSummonedPayload = warRoomListener.mock.calls[0][0];
      expect(payload.reason).toBe('Critical production bug detected');
      expect(payload.timestamp).toBeDefined();
      expect(payload.timestamp! >= beforeTime).toBe(true);
      expect(payload.timestamp! <= afterTime).toBe(true);
    });

    it('transitions all active busy agents back to IDLE with targetZone WAR_ROOM', () => {
      const manager = new SquadManager(bus);
      const be = manager.hireAgent('be-1', 'BACKEND');
      const fe = manager.hireAgent('fe-1', 'FRONTEND');
      const qa = manager.hireAgent('qa-1', 'QA');

      // Move agents into non-IDLE states
      be.transition('WALKING');
      be.transition('CODING');

      fe.transition('THINKING');

      qa.transition('WALKING');

      expect(be.getState()).toBe('CODING');
      expect(fe.getState()).toBe('THINKING');
      expect(qa.getState()).toBe('WALKING');

      const stateChanges: AgentStateChangedPayload[] = [];
      bus.subscribe('AGENT_STATE_CHANGED', (event) => stateChanges.push(event));

      manager.summonWarRoom('Urgent architectural alignment');

      expect(be.getState()).toBe('IDLE');
      expect(fe.getState()).toBe('IDLE');
      expect(qa.getState()).toBe('IDLE');

      // Verify the emitted AGENT_STATE_CHANGED events for war room transitions
      const beChange = stateChanges.find((e) => e.agentId === 'be-1');
      expect(beChange).toEqual({
        agentId: 'be-1',
        role: 'BACKEND',
        from: 'CODING',
        to: 'IDLE',
        reason: 'War Room Summoned',
        targetZone: 'WAR_ROOM',
      });

      const feChange = stateChanges.find((e) => e.agentId === 'fe-1');
      expect(feChange).toEqual({
        agentId: 'fe-1',
        role: 'FRONTEND',
        from: 'THINKING',
        to: 'IDLE',
        reason: 'War Room Summoned',
        targetZone: 'WAR_ROOM',
      });

      const qaChange = stateChanges.find((e) => e.agentId === 'qa-1');
      expect(qaChange).toEqual({
        agentId: 'qa-1',
        role: 'QA',
        from: 'WALKING',
        to: 'IDLE',
        reason: 'War Room Summoned',
        targetZone: 'WAR_ROOM',
      });
    });

    it('does not re-transition agents that are already in IDLE state', () => {
      const manager = new SquadManager(bus);
      const dev = manager.hireAgent('dev-1', 'BACKEND'); // Starts in IDLE
      expect(dev.getState()).toBe('IDLE');

      const stateChangeListener = vi.fn();
      bus.subscribe('AGENT_STATE_CHANGED', stateChangeListener);

      // summonWarRoom should NOT transition dev-1 because it is already IDLE
      expect(() => {
        manager.summonWarRoom('Standup meeting');
      }).not.toThrow();

      expect(dev.getState()).toBe('IDLE');
      expect(stateChangeListener).not.toHaveBeenCalled();
    });

    it('works safely when squad has no agents', () => {
      const manager = new SquadManager(bus);
      const warRoomListener = vi.fn();
      bus.subscribe('WAR_ROOM_SUMMONED', warRoomListener);

      expect(() => {
        manager.summonWarRoom('Empty office alert');
      }).not.toThrow();

      expect(warRoomListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Optional OfficeStorage Integration', () => {
    const testDir = path.join(process.cwd(), '.test-squad-storage');
    let storage: OfficeStorage;

    beforeEach(() => {
      if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
      fs.mkdirSync(testDir, { recursive: true });
      storage = new OfficeStorage(testDir);
    });

    afterEach(() => {
      storage.close();
      if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('logs activity events when hiring an agent', () => {
      const manager = new SquadManager(bus, storage);

      manager.hireAgent('agent-fe', 'FRONTEND');

      const logs = storage.getActivityLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].agentId).toBe('agent-fe');
      expect(logs[0].eventType).toBe('AGENT_HIRED');
      expect(logs[0].payload).toEqual(
        expect.objectContaining({
          role: 'FRONTEND',
          action: 'HIRED',
        })
      );
    });

    it('logs activity events when releasing an agent', () => {
      const manager = new SquadManager(bus, storage);
      manager.hireAgent('agent-be', 'BACKEND');

      const released = manager.releaseAgent('agent-be');
      expect(released).toBe(true);

      const logs = storage.getActivityLogs();
      expect(logs).toHaveLength(2); // 1 hire + 1 release
      expect(logs[1].agentId).toBe('agent-be');
      expect(logs[1].eventType).toBe('AGENT_RELEASED');
      expect(logs[1].payload).toEqual(
        expect.objectContaining({
          role: 'BACKEND',
          action: 'RELEASED',
        })
      );
    });

    it('does not log release activity when agent is not found', () => {
      const manager = new SquadManager(bus, storage);

      const released = manager.releaseAgent('unknown-agent');
      expect(released).toBe(false);

      const logs = storage.getActivityLogs();
      expect(logs).toHaveLength(0);
    });

    it('logs activity events when summoning war room', () => {
      const manager = new SquadManager(bus, storage);
      manager.hireAgent('agent-arch', 'ARCHITECT');

      manager.summonWarRoom('Breaking incident in production');

      const logs = storage.getActivityLogs();
      expect(logs).toHaveLength(2); // 1 hire + 1 war room summon
      expect(logs[1].agentId).toBe('DIRECTOR');
      expect(logs[1].eventType).toBe('WAR_ROOM_SUMMONED');
      expect(logs[1].payload).toEqual(
        expect.objectContaining({
          reason: 'Breaking incident in production',
        })
      );
    });

    it('supports custom epicId for activity log association', () => {
      const manager = new SquadManager(bus, storage, 'EPIC-42');
      manager.hireAgent('agent-qa', 'QA');
      manager.summonWarRoom('Security audit');

      const logs = storage.getActivityLogs('EPIC-42');
      expect(logs).toHaveLength(2);
      expect(logs[0].epicId).toBe('EPIC-42');
      expect(logs[1].epicId).toBe('EPIC-42');
    });
  });
});
