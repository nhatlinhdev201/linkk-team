import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, type EpicRecord, type TaskRecord, type ActivityLogRecord, type QuotaRecord } from './db.js';
import { syncTasksToMarkdown } from './markdown-sync.js';
import type { OfficeConfig, Epic, Task, ActivityEvent, EpicStatus, TaskStatus } from '../types/office.js';

export { EpicRecord, TaskRecord, ActivityLogRecord, QuotaRecord };

export interface ActivityLogEntry extends ActivityEvent {
  id: number;
  timestamp: string;
  epic_id: string;
  agent_id: string;
  event_type: string;
  payload_json: string;
}

export function toTask(record: TaskRecord): Task {
  return {
    id: record.id,
    epicId: record.epic_id,
    title: record.title,
    status: record.status as TaskStatus,
    assignedAgentId: record.assigned_agent_id ?? undefined
  };
}

export function toEpic(record: EpicRecord): Epic {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    status: record.status as EpicStatus,
    budgetCapUsd: record.budget_cap_usd,
    createdAt: record.created_at
  };
}

export class OfficeStorage {
  private db: Database.Database;
  private baseDir: string;

  constructor(baseDir: string, db?: Database.Database) {
    if (baseDir.endsWith('.db')) {
      const dbPath = baseDir;
      this.baseDir = path.dirname(baseDir);
      this.db = db || initDatabase(dbPath);
    } else if (baseDir === ':memory:') {
      this.baseDir = ':memory:';
      this.db = db || initDatabase(':memory:');
    } else {
      this.baseDir = baseDir;
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      const dbPath = path.join(baseDir, 'office.db');
      this.db = db || initDatabase(dbPath);
    }
  }

  public getDatabase(): Database.Database {
    return this.db;
  }

  public close(): void {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }

  public createEpic(id: string, title: string, description: string, budgetCap = 5.0): EpicRecord {
    const stmt = this.db.prepare(
      'INSERT INTO epics (id, title, description, status, budget_cap_usd) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, title, description, 'DRAFT', budgetCap);
    return {
      id,
      title,
      description,
      status: 'DRAFT',
      budget_cap_usd: budgetCap
    };
  }

  public updateEpicStatus(id: string, status: EpicStatus): void {
    const stmt = this.db.prepare(
      'UPDATE epics SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(status, id);
  }

  public getEpic(id: string): EpicRecord | undefined {
    return this.db.prepare(
      'SELECT id, title, description, status, budget_cap_usd, created_at, updated_at FROM epics WHERE id = ?'
    ).get(id) as EpicRecord | undefined;
  }

  public getEpicEntity(id: string): Epic | undefined {
    const epic = this.getEpic(id);
    return epic ? toEpic(epic) : undefined;
  }

  public createTask(id: string, epicId: string, title: string, assignedAgentId?: string): TaskRecord {
    const stmt = this.db.prepare(
      'INSERT INTO tasks (id, epic_id, assigned_agent_id, title, status) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, epicId, assignedAgentId || null, title, 'BACKLOG');
    this.syncMarkdown(epicId);
    return {
      id,
      epic_id: epicId,
      assigned_agent_id: assignedAgentId,
      title,
      status: 'BACKLOG'
    };
  }

  public moveTask(taskId: string, newStatus: TaskStatus): void {
    const isDone = newStatus === 'DONE';
    const stmt = this.db.prepare(
      'UPDATE tasks SET status = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?'
    );
    stmt.run(newStatus, isDone ? 1 : 0, taskId);
    const task = this.getTask(taskId);
    if (task) {
      this.syncMarkdown(task.epic_id);
    }
  }

  public getTask(taskId: string): TaskRecord | undefined {
    return this.db.prepare(
      'SELECT id, epic_id, assigned_agent_id, title, status, created_at, completed_at FROM tasks WHERE id = ?'
    ).get(taskId) as TaskRecord | undefined;
  }

  public getTaskEntity(taskId: string): Task | undefined {
    const task = this.getTask(taskId);
    return task ? toTask(task) : undefined;
  }

  public getTasksByEpic(epicId: string): TaskRecord[] {
    return this.db.prepare(
      'SELECT id, epic_id, assigned_agent_id, title, status, created_at, completed_at FROM tasks WHERE epic_id = ?'
    ).all(epicId) as TaskRecord[];
  }

  public getTasksEntitiesByEpic(epicId: string): Task[] {
    return this.getTasksByEpic(epicId).map(toTask);
  }

  public logActivity(epicId: string, agentId: string, eventType: string, payload: any): void {
    const payloadJson = payload === undefined ? '{}' : (typeof payload === 'string' ? payload : JSON.stringify(payload));
    const stmt = this.db.prepare(
      'INSERT INTO activity_logs (epic_id, agent_id, event_type, payload_json) VALUES (?, ?, ?, ?)'
    );
    stmt.run(epicId, agentId, eventType, payloadJson);
  }

  public getActivityLogs(epicId?: string): ActivityLogEntry[] {
    let rows: any[];
    if (epicId) {
      rows = this.db.prepare(
        'SELECT id, timestamp, epic_id, agent_id, event_type, payload_json FROM activity_logs WHERE epic_id = ? ORDER BY id ASC'
      ).all(epicId);
    } else {
      rows = this.db.prepare(
        'SELECT id, timestamp, epic_id, agent_id, event_type, payload_json FROM activity_logs ORDER BY id ASC'
      ).all();
    }
    return rows.map((r) => {
      let payload: any;
      try {
        payload = JSON.parse(r.payload_json);
      } catch {
        payload = r.payload_json;
      }
      return {
        id: r.id,
        timestamp: r.timestamp,
        epicId: r.epic_id,
        agentId: r.agent_id,
        eventType: r.event_type,
        payload,
        epic_id: r.epic_id,
        agent_id: r.agent_id,
        event_type: r.event_type,
        payload_json: r.payload_json
      };
    });
  }

  public recordQuota(epicId: string, costUsd: number): void {
    const stmt = this.db.prepare(
      'INSERT INTO quota_tracking (epic_id, cost_usd) VALUES (?, ?)'
    );
    stmt.run(epicId, costUsd);
  }

  public getTotalQuota(epicId?: string): number {
    if (epicId) {
      const row = this.db.prepare(
        'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM quota_tracking WHERE epic_id = ?'
      ).get(epicId) as { total: number };
      return row.total;
    } else {
      const row = this.db.prepare(
        'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM quota_tracking'
      ).get() as { total: number };
      return row.total;
    }
  }

  public syncMarkdown(epicId: string): void {
    if (this.baseDir === ':memory:') {
      return;
    }
    const tasks = this.getTasksByEpic(epicId);
    syncTasksToMarkdown(this.baseDir, epicId, tasks);
  }
}
