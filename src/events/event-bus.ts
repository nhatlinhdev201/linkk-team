import { AgentRole, AgentState, TaskStatus } from '../types/office.js';

export interface AgentStateChangedPayload {
  agentId: string;
  role: AgentRole;
  from?: AgentState;
  to?: AgentState;
  action?: 'HIRED' | 'RELEASED';
  reason?: string;
  targetZone?: string;
}

export interface TicketMovedPayload {
  taskId: string;
  epicId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  agentId?: string;
}

export interface BubbleSpeechPayload {
  agentId: string;
  text: string;
  durationMs?: number;
}

export interface WarRoomSummonedPayload {
  reason: string;
  timestamp?: string;
}

export interface QuotaWarningPayload {
  epicId: string;
  currentSpendUsd: number;
  budgetCapUsd: number;
}

export interface OfficeEventMap {
  AGENT_STATE_CHANGED: AgentStateChangedPayload;
  TICKET_MOVED: TicketMovedPayload;
  BUBBLE_SPEECH: BubbleSpeechPayload;
  WAR_ROOM_SUMMONED: WarRoomSummonedPayload;
  QUOTA_WARNING: QuotaWarningPayload;
}

export type OfficeEventType = keyof OfficeEventMap;

export type EventCallback<T> = (payload: T) => void;

export class OfficeEventBus {
  private listeners: Map<OfficeEventType, Set<EventCallback<any>>> = new Map();

  /**
   * Subscribe to a typed event.
   * Returns an unsubscribe function.
   */
  subscribe<E extends OfficeEventType>(
    event: E,
    callback: (payload: OfficeEventMap[E]) => void
  ): () => void {
    let eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(event, eventListeners);
    }
    eventListeners.add(callback as EventCallback<any>);

    return () => {
      const currentListeners = this.listeners.get(event);
      if (currentListeners) {
        currentListeners.delete(callback as EventCallback<any>);
        if (currentListeners.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Emit an event to all subscribers.
   */
  emit<E extends OfficeEventType>(
    event: E,
    payload: OfficeEventMap[E]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners && eventListeners.size > 0) {
      const copy = Array.from(eventListeners);
      for (const listener of copy) {
        try {
          listener(payload);
        } catch (err) {
          console.error(`Error in listener for event '${event}':`, err);
        }
      }
    }
  }

  /**
   * Clear all listeners, or listeners for a specific event if provided.
   */
  clearListeners(event?: OfficeEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
