import { AgentRole, AgentState } from '../types/office.js';
import { OfficeEventBus } from '../events/event-bus.js';
import { AgentStateMachine } from './agent-fsm.js';
import { OfficeStorage } from '../storage/office-storage.js';

export class SquadManager {
  private squad: Map<string, AgentStateMachine> = new Map();
  private bus: OfficeEventBus;
  private storage?: OfficeStorage;
  private epicId: string;

  constructor(
    bus: OfficeEventBus,
    storage?: OfficeStorage,
    epicId: string = 'GLOBAL'
  ) {
    this.bus = bus;
    this.storage = storage;
    this.epicId = epicId;
  }

  /**
   * Returns current active squad epic ID.
   */
  public getEpicId(): string {
    return this.epicId;
  }

  /**
   * Sets the active epic ID for storage activity association.
   */
  public setEpicId(epicId: string): void {
    this.epicId = epicId;
  }

  /**
   * Creates and registers an agent in the active squad.
   * Emits AGENT_STATE_CHANGED with action 'HIRED'.
   * If storage is provided, logs the AGENT_HIRED activity event.
   */
  public hireAgent(
    id: string,
    role: AgentRole,
    initialState: AgentState = 'IDLE'
  ): AgentStateMachine {
    if (this.squad.has(id)) {
      throw new Error(`Agent with id '${id}' already exists in active squad`);
    }
    const agent = new AgentStateMachine(id, role, this.bus, initialState);
    this.squad.set(id, agent);

    this.bus.emit('AGENT_STATE_CHANGED', {
      agentId: id,
      role,
      from: initialState,
      to: initialState,
      action: 'HIRED',
    });

    if (this.storage) {
      this.storage.logActivity(this.epicId, id, 'AGENT_HIRED', {
        role,
        state: initialState,
        action: 'HIRED',
      });
    }

    return agent;
  }

  /**
   * Removes an agent from the active squad.
   * If found, emits AGENT_STATE_CHANGED with action 'RELEASED'.
   * If storage is provided, logs the AGENT_RELEASED activity event.
   * Returns true if released, false if agent was not found.
   */
  public releaseAgent(id: string): boolean {
    const agent = this.squad.get(id);
    if (!agent) {
      return false;
    }

    this.squad.delete(id);

    const currentState = agent.getState();
    this.bus.emit('AGENT_STATE_CHANGED', {
      agentId: id,
      role: agent.role,
      from: currentState,
      to: currentState,
      action: 'RELEASED',
    });

    if (this.storage) {
      this.storage.logActivity(this.epicId, id, 'AGENT_RELEASED', {
        role: agent.role,
        state: currentState,
        action: 'RELEASED',
      });
    }

    return true;
  }

  /**
   * Retrieves an agent by id from the active squad.
   */
  public getAgent(id: string): AgentStateMachine | undefined {
    return this.squad.get(id);
  }

  /**
   * Checks if an agent id exists in the active squad.
   */
  public hasAgent(id: string): boolean {
    return this.squad.has(id);
  }

  /**
   * Returns a list of currently active agents in the squad.
   */
  public getActiveSquad(): AgentStateMachine[] {
    return Array.from(this.squad.values());
  }

  /**
   * Returns the count of currently active agents.
   */
  public getSquadSize(): number {
    return this.squad.size;
  }

  /**
   * Clears all agents from the squad without triggering release events.
   */
  public clearSquad(): void {
    this.squad.clear();
  }

  /**
   * Summons a War Room:
   * 1. Emits WAR_ROOM_SUMMONED event with reason and timestamp.
   * 2. Transitions all non-IDLE agents back to IDLE with reason 'War Room Summoned' and targetZone 'WAR_ROOM'.
   * 3. If storage is provided, logs the WAR_ROOM_SUMMONED activity event.
   */
  public summonWarRoom(reason: string): void {
    const timestamp = new Date().toISOString();

    this.bus.emit('WAR_ROOM_SUMMONED', {
      reason,
      timestamp,
    });

    for (const agent of this.squad.values()) {
      if (agent.getState() !== 'IDLE') {
        agent.transition('IDLE', 'War Room Summoned', 'WAR_ROOM');
      }
    }

    if (this.storage) {
      this.storage.logActivity(this.epicId, 'DIRECTOR', 'WAR_ROOM_SUMMONED', {
        reason,
        timestamp,
      });
    }
  }
}
