import Phaser from 'phaser';
import { OfficeEventBus, AgentStateChangedPayload, WarRoomSummonedPayload, BubbleSpeechPayload } from '../events/event-bus.js';
import { AgentRole, AgentState } from '../types/office.js';

export interface ZoneCoordinate {
  x: number;
  y: number;
}

export const ZONE_COORDINATES: Record<string, ZoneCoordinate> = {
  ENTRANCE: { x: 100, y: 300 },
  ELEVATOR: { x: 100, y: 300 },
  WORKSTATIONS: { x: 400, y: 200 },
  WORKSTATION: { x: 400, y: 200 },
  DESK: { x: 400, y: 200 },
  DESKS: { x: 400, y: 200 },
  WAR_ROOM: { x: 400, y: 450 },
  COFFEE_LOUNGE: { x: 700, y: 450 },
  COFFEE: { x: 700, y: 450 },
  DIRECTOR_OFFICE: { x: 700, y: 200 },
  DIRECTOR: { x: 700, y: 200 },
};

const ROLE_COLORS: Record<string, number> = {
  ARCHITECT: 0xa855f7, // purple
  FRONTEND: 0x38bdf8,  // sky blue
  BACKEND: 0x22c55e,   // green
  QA: 0xf97316,        // orange
  DEVOPS: 0xef4444,    // red
};

export class OfficeScene extends Phaser.Scene {
  public static readonly ZONE_COORDINATES = ZONE_COORDINATES;

  private bus: OfficeEventBus;
  private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private agentRoles: Map<string, AgentRole> = new Map();
  private departingSprites: Set<Phaser.GameObjects.Container> = new Set();
  private speechBubbles: Map<string, Phaser.GameObjects.Container | Phaser.GameObjects.GameObject> = new Map();
  private speechBubbleTimers: Map<string, { remove: () => void }> = new Map();
  private unsubscribers: Array<() => void> = [];

  constructor(bus: OfficeEventBus) {
    super({ key: 'OfficeScene' });
    this.bus = bus;
  }

  public create(): void {
    this.renderOfficeLayout();
    this.subscribeToEvents();
  }

  private renderOfficeLayout(): void {
    // 1. Entrance & Elevator (100, 300, 140x100) -> label at top: 300 - 50 + 16 = 266
    this.add.rectangle(100, 300, 140, 100, 0x334155).setOrigin(0.5);
    this.add.text(100, 266, 'Thang Máy', { fontSize: '13px', color: '#94a3b8' }).setOrigin(0.5);

    // 2. Workstations (400, 200, 320x160) -> label at top: 200 - 80 + 16 = 136
    this.add.rectangle(400, 200, 320, 160, 0x1e293b).setOrigin(0.5);
    this.add.text(400, 136, 'Bàn Làm Việc', { fontSize: '14px', color: '#38bdf8' }).setOrigin(0.5);

    // 3. War Room (400, 450, 240x140) -> label at top: 450 - 70 + 16 = 396
    this.add.rectangle(400, 450, 240, 140, 0x0f172a).setOrigin(0.5);
    this.add.text(400, 396, 'Phòng Họp Khẩn', { fontSize: '13px', color: '#f59e0b' }).setOrigin(0.5);

    // 4. Coffee Lounge (700, 450, 200x140) -> label at top: 450 - 70 + 16 = 396
    this.add.rectangle(700, 450, 200, 140, 0x1e293b).setOrigin(0.5);
    this.add.text(700, 396, 'Khu Cà Phê', { fontSize: '13px', color: '#10b981' }).setOrigin(0.5);

    // 5. Director Office (700, 200, 200x160) -> label at top: 200 - 80 + 16 = 136
    this.add.rectangle(700, 200, 200, 160, 0x312e81).setOrigin(0.5);
    this.add.text(700, 136, 'Phòng Giám Đốc', { fontSize: '13px', color: '#c084fc' }).setOrigin(0.5);
  }

  private subscribeToEvents(): void {
    const unsubAgent = this.bus.subscribe('AGENT_STATE_CHANGED', (data) => {
      this.handleAgentStateChanged(data);
    });

    const unsubWarRoom = this.bus.subscribe('WAR_ROOM_SUMMONED', (data) => {
      this.handleWarRoomSummoned(data);
    });

    const unsubSpeech = this.bus.subscribe('BUBBLE_SPEECH', (data) => {
      this.handleBubbleSpeech(data);
    });

    this.unsubscribers.push(unsubAgent, unsubWarRoom, unsubSpeech);
  }

  private getOrCreateAgentSprite(agentId: string, role?: AgentRole): Phaser.GameObjects.Container {
    if (role) {
      this.agentRoles.set(agentId, role);
    }
    let sprite = this.agentSprites.get(agentId);
    if (!sprite) {
      const activeRole = role || this.agentRoles.get(agentId);
      const color = (activeRole && ROLE_COLORS[activeRole]) || 0x38bdf8;
      const entrance = ZONE_COORDINATES.ENTRANCE;
      sprite = this.add.container(entrance.x, entrance.y) as Phaser.GameObjects.Container;
      const rect = this.add.rectangle(0, 0, 24, 24, color).setOrigin(0.5);
      const label = this.add.text(0, -18, agentId, {
        fontSize: '10px',
        color: '#f8fafc',
      }).setOrigin(0.5);
      sprite.add([rect, label]);
      this.agentSprites.set(agentId, sprite);
    }
    return sprite;
  }

  private resolveZone(zone: string): ZoneCoordinate {
    const key = zone.toUpperCase().replace(/\s+/g, '_');
    return ZONE_COORDINATES[key] || ZONE_COORDINATES.WORKSTATIONS;
  }

  private resolveStateZone(state: AgentState, role?: AgentRole): ZoneCoordinate {
    switch (state) {
      case 'CODING':
      case 'THINKING':
      case 'REVIEWING':
        return role === 'ARCHITECT' ? ZONE_COORDINATES.DIRECTOR_OFFICE : ZONE_COORDINATES.WORKSTATIONS;
      case 'WAR_ROOM' as any:
        return ZONE_COORDINATES.WAR_ROOM;
      case 'TALKING':
        return ZONE_COORDINATES.COFFEE_LOUNGE;
      case 'CELEBRATING':
        return ZONE_COORDINATES.WAR_ROOM;
      case 'IDLE':
        return ZONE_COORDINATES.COFFEE_LOUNGE;
      default:
        return ZONE_COORDINATES.WORKSTATIONS;
    }
  }

  private handleAgentStateChanged(payload: AgentStateChangedPayload): void {
    const { agentId, role, to, action, targetZone } = payload;

    if (role) {
      this.agentRoles.set(agentId, role);
    }

    if (action === 'RELEASED') {
      const sprite = this.agentSprites.get(agentId);
      if (sprite) {
        // Promptly deregister from active agent sprites so subsequent events don't target departing sprite
        this.agentSprites.delete(agentId);
        this.agentRoles.delete(agentId);
        this.dismissBubble(agentId);
        this.departingSprites.add(sprite);

        const elevator = ZONE_COORDINATES.ELEVATOR;
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          x: elevator.x,
          y: elevator.y,
          duration: 800,
          onComplete: () => {
            sprite.destroy();
            this.departingSprites.delete(sprite);
          },
        });
      }
      return;
    }

    const sprite = this.getOrCreateAgentSprite(agentId, role);
    if (action === 'HIRED') {
      sprite.x = ZONE_COORDINATES.ENTRANCE.x;
      sprite.y = ZONE_COORDINATES.ENTRANCE.y;
    }

    const effectiveRole = role || this.agentRoles.get(agentId);
    let dest: ZoneCoordinate | null = null;
    if (targetZone) {
      dest = this.resolveZone(targetZone);
    } else if (to) {
      dest = this.resolveStateZone(to, effectiveRole);
    }

    if (dest) {
      const jitterX = (Math.random() - 0.5) * 30;
      const jitterY = (Math.random() - 0.5) * 20;
      this.tweens.killTweensOf(sprite);
      this.tweens.add({
        targets: sprite,
        x: dest.x + jitterX,
        y: dest.y + jitterY,
        duration: 800,
        ease: 'Power2',
      });
    }
  }

  private handleWarRoomSummoned(_payload: WarRoomSummonedPayload): void {
    const warRoom = ZONE_COORDINATES.WAR_ROOM;
    let index = 0;
    for (const sprite of this.agentSprites.values()) {
      const offsetX = (index % 3 - 1) * 30;
      const offsetY = (Math.floor(index / 3) - 1) * 20;
      index++;

      this.tweens.killTweensOf(sprite);
      this.tweens.add({
        targets: sprite,
        x: warRoom.x + offsetX,
        y: warRoom.y + offsetY,
        duration: 800,
        ease: 'Power2',
      });
    }
  }

  private handleBubbleSpeech(payload: BubbleSpeechPayload): void {
    const { agentId, text, durationMs = 3000 } = payload;
    const sprite = this.agentSprites.get(agentId);
    if (!sprite) return;

    this.dismissBubble(agentId);

    const bubble = this.add.container(sprite.x, sprite.y - 35) as Phaser.GameObjects.Container;
    const bg = this.add.rectangle(0, 0, Math.max(70, text.length * 8 + 16), 22, 0x020617).setOrigin(0.5);
    const bubbleText = this.add.text(0, 0, text, {
      fontSize: '11px',
      color: '#f8fafc',
    }).setOrigin(0.5);

    bubble.add([bg, bubbleText]);
    this.speechBubbles.set(agentId, bubble);

    const timer = this.time.delayedCall(durationMs, () => {
      this.dismissBubble(agentId);
    });
    this.speechBubbleTimers.set(agentId, timer);
  }

  private dismissBubble(agentId: string): void {
    const bubble = this.speechBubbles.get(agentId);
    if (bubble) {
      bubble.destroy();
      this.speechBubbles.delete(agentId);
    }
    const timer = this.speechBubbleTimers.get(agentId);
    if (timer) {
      timer.remove();
      this.speechBubbleTimers.delete(agentId);
    }
  }

  public update(): void {
    for (const [agentId, bubble] of this.speechBubbles.entries()) {
      const sprite = this.agentSprites.get(agentId);
      if (sprite && bubble) {
        (bubble as Phaser.GameObjects.Container).setPosition(sprite.x, sprite.y - 35);
      }
    }
  }

  public getAgentSprite(agentId: string): Phaser.GameObjects.Container | undefined {
    return this.agentSprites.get(agentId);
  }

  public getAllSprites(): Map<string, Phaser.GameObjects.Container> {
    return this.agentSprites;
  }

  public destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    for (const agentId of Array.from(this.speechBubbles.keys())) {
      this.dismissBubble(agentId);
    }

    for (const sprite of this.agentSprites.values()) {
      sprite.destroy();
    }
    this.agentSprites.clear();

    for (const sprite of this.departingSprites) {
      sprite.destroy();
    }
    this.departingSprites.clear();
    this.agentRoles.clear();
  }
}
