import fs from 'node:fs';
import path from 'node:path';
import type { TaskRecord } from './db.js';

export function formatTaskListMarkdown(epicId: string, tasks: TaskRecord[]): string {
  const lines = [`# Tasks for ${epicId}`, ''];
  for (const t of tasks) {
    const check = t.status === 'DONE' ? 'x' : ' ';
    lines.push(`- [${check}] ${t.id}: ${t.title} (${t.status})`);
  }
  return lines.join('\n');
}

export function syncTasksToMarkdown(baseDir: string, epicId: string, tasks: TaskRecord[]): string {
  const epicDir = path.join(baseDir, 'epics', epicId);
  if (!fs.existsSync(epicDir)) {
    fs.mkdirSync(epicDir, { recursive: true });
  }
  const content = formatTaskListMarkdown(epicId, tasks);
  const targetFile = path.join(epicDir, 'tasks.md');
  fs.writeFileSync(targetFile, content, 'utf-8');
  return targetFile;
}

export function parseTaskListMarkdown(markdown: string): Array<{ id: string; title: string; status: string; done: boolean }> {
  const results: Array<{ id: string; title: string; status: string; done: boolean }> = [];
  const lines = markdown.split('\n');
  const taskRegex = /^- \[([ xX])\]\s+([A-Za-z0-9_-]+):\s*(.*?)(?:\s+\((BACKLOG|TODO|IN_PROGRESS|IN_REVIEW|DONE)\))?$/;

  for (const line of lines) {
    const match = line.trim().match(taskRegex);
    if (match) {
      const done = match[1].toLowerCase() === 'x';
      const id = match[2];
      const title = match[3];
      const status = match[4] || (done ? 'DONE' : 'BACKLOG');
      results.push({ id, title, status, done });
    }
  }

  return results;
}
