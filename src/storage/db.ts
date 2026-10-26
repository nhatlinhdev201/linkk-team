import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { EpicStatus, TaskStatus } from '../types/office.js';

export interface EpicRecord {
  id: string;
  title: string;
  description: string;
  status: EpicStatus | string;
  budget_cap_usd: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskRecord {
  id: string;
  epic_id: string;
  assigned_agent_id?: string | null;
  title: string;
  status: TaskStatus | string;
  created_at?: string;
  completed_at?: string | null;
}

export interface ActivityLogRecord {
  id?: number;
  timestamp?: string;
  epic_id: string;
  agent_id: string;
  event_type: string;
  payload_json: string;
}

export interface QuotaRecord {
  id?: number;
  timestamp?: string;
  epic_id: string;
  cost_usd: number;
}

export function initDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      budget_cap_usd REAL DEFAULT 5.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      epic_id TEXT NOT NULL,
      assigned_agent_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'BACKLOG',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY(epic_id) REFERENCES epics(id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      epic_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quota_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      epic_id TEXT NOT NULL,
      cost_usd REAL NOT NULL
    );
  `);

  return db;
}
