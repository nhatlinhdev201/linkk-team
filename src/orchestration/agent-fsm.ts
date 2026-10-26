import { AgentRole, AgentState } from '../types/office.js';
import { OfficeEventBus, AgentStateChangedPayload } from '../events/event-bus.js';

export const VALID_TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  IDLE: ['WALKING', 'THINKING', 'TALKING'],
  WALKING: ['THINKING', 'CODING', 'REVIEWING', 'IDLE', 'TALKING'],
  THINKING: ['CODING', 'TALKING', 'REVIEWING', 'IDLE', 'WALKING'],
  CODING: ['REVIEWING', 'THINKING', 'CELEBRATING', 'IDLE'],
  TALKING: ['THINKING', 'CODING', 'WALKING', 'IDLE'],
  REVIEWING: ['CELEBRATING', 'CODING', 'IDLE'],
  CELEBRATING: ['IDLE', 'WALKING'],
};

export class AgentStateMachine {
  public readonly id: string;
  public readonly role: AgentRole;
  private state: AgentState;
  private bus: OfficeEventBus;

  constructor(
    id: string,
    role: AgentRole,
    bus: OfficeEventBus,
    initialState: AgentState = 'IDLE'
  ) {
    this.id = id;
    this.role = role;
    this.bus = bus;
    this.state = initialState;
  }

  /**
   * Returns current state of the agent.
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Checks whether a transition to the next state is valid.
   */
  canTransition(next: AgentState): boolean {
    const allowed = VALID_TRANSITIONS[this.state];
    return allowed.includes(next);
  }

  /**
   * Transitions agent to the next state if valid, and emits AGENT_STATE_CHANGED event.
   * Throws descriptive error if transition is invalid.
   */
  transition(next: AgentState, reason?: string, targetZone?: string): void {
    const allowed = VALID_TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(
        `Invalid state transition for agent '${this.id}' (${this.role}) from '${this.state}' to '${next}'. Allowed transitions: [${allowed.join(', ')}]`
      );
    }

    const from = this.state;
    this.state = next;

    const payload: AgentStateChangedPayload = {
      agentId: this.id,
      role: this.role,
      from,
      to: next,
      ...(reason !== undefined && { reason }),
      ...(targetZone !== undefined && { targetZone }),
    };

    this.bus.emit('AGENT_STATE_CHANGED', payload);
  }

  /**
   * Subscribe to state changes for this specific agent.
   * Returns an unsubscribe function.
   */
  onStateChange(callback: (event: AgentStateChangedPayload) => void): () => void {
    return this.bus.subscribe('AGENT_STATE_CHANGED', (payload) => {
      if (payload.agentId === this.id) {
        callback(payload);
      }
    });
  }
}
