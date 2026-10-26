import { AgentRole } from '../types/office.js';

export interface ToolHistoryEntry {
  tool: string;
  target?: string;
  error?: string;
  timestamp?: number;
}

export interface LoopCheckResult {
  isStuck: boolean;
  reason?: string;
  tool?: string;
  target?: string;
}

export interface FastTriageResult {
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedModelRole: 'QA' | 'BACKEND' | 'ARCHITECT';
}

export class JevGuard {
  /**
   * Detects infinite edit or tool error loops when identical failures/errors on the
   * same tool and target repeat `threshold` (default 3) consecutive times.
   * Runs in sub-10ms.
   */
  public static checkLoop(history: ToolHistoryEntry[], threshold = 3): LoopCheckResult {
    if (threshold <= 0 || history.length < threshold) {
      return { isStuck: false };
    }

    const recent = history.slice(-threshold);
    const first = recent[0];

    // Must have a non-empty failure error on the first item
    if (!first.error) {
      return { isStuck: false };
    }

    const isRepeated = recent.every(
      (entry) =>
        entry.error === first.error &&
        entry.tool === first.tool &&
        entry.target === first.target
    );

    if (isRepeated) {
      const reason = first.target
        ? `Repeated identical failure in ${first.target} (${threshold}x times): ${first.error}`
        : `Repeated identical failure in ${first.tool} (${threshold}x times): ${first.error}`;

      return {
        isStuck: true,
        tool: first.tool,
        target: first.target,
        reason,
      };
    }

    return { isStuck: false };
  }

  public checkLoop(history: ToolHistoryEntry[], threshold = 3): LoopCheckResult {
    return JevGuard.checkLoop(history, threshold);
  }

  /**
   * Fast heuristic/regex summarization compressing long chain-of-thought text into
   * short, punchy speech bubble text (5-8 words or concise Vietnamese summary).
   * Handles empty/whitespace thoughts gracefully.
   */
  public static summarizeThought(thought: string): string {
    const cleaned = thought
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*_#`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      return 'Đang suy nghĩ...';
    }

    const lower = cleaned.toLowerCase();

    // Priority 1: AST Analysis & Review
    if (/(?:\b(analyz\w*|analysis|ast|inspect\w*|review\w*)\b|phân tích)/i.test(lower)) {
      return 'Đang phân tích cấu trúc...';
    }

    // Priority 2: Testing & Verification
    if (/(?:\b(tests?|testing|vitest|jest|pytest)\b|kiểm thử)/i.test(lower)) {
      return 'Đang chạy kiểm thử...';
    }

    // Priority 3: Planning & System Architecture
    if (/(?:\b(plans?|planning|architect\w*|roadmap|designs?)\b|kế hoạch)/i.test(lower)) {
      return 'Đang lập kế hoạch...';
    }

    // Priority 4: Deployment & DevOps Infrastructure
    if (/(?:\b(deploys?|deploying|deployment|docker|ci\/cd|ci-cd|\bci\b|\bcd\b|kubernetes|k8s)\b|triển khai)/i.test(lower)) {
      return 'Đang triển khai môi trường...';
    }

    // Priority 5: Debugging & Fixing Errors
    if (/(?:\b(debug\w*|errors?|bugs?|issues?|fix\w*)\b|gỡ lỗi)/i.test(lower)) {
      return 'Đang gỡ lỗi sự cố...';
    }

    // Priority 6: Code Writing & Editing
    if (/(?:\b(edits?|editing|writing|code|coding|implement\w*)\b|viết mã)/i.test(lower)) {
      return 'Đang viết mã nguồn...';
    }

    // Priority 7: Database Operations
    if (/(?:\b(databases?|schemas?|query|queries|sql|csdl)\b|cơ sở dữ liệu)/i.test(lower)) {
      return 'Đang xử lý cơ sở dữ liệu...';
    }

    // Fallback: Compress generic thoughts into 5-8 punchy words
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length <= 8) {
      return words.join(' ');
    }
    return words.slice(0, 6).join(' ') + '...';
  }

  public summarizeThought(thought: string): string {
    return JevGuard.summarizeThought(thought);
  }

  /**
   * Recommends minimal squad roles from AgentRole based on keywords in epic description:
   * - Always includes 'ARCHITECT'.
   * - Includes 'FRONTEND' if UI/CSS/frontend/button/client mentioned.
   * - Includes 'BACKEND' if API/DB/backend/auth/database/server mentioned.
   * - Includes 'DEVOPS' if docker/ci/cd/deploy/kubernetes/pipeline mentioned.
   * - Always includes 'QA'.
   */
  public static recommendSquad(epicDescription: string): AgentRole[] {
    const squad: AgentRole[] = ['ARCHITECT'];

    const hasFrontend =
      /\b(ui|css|frontend|front-end|button|buttons|client|clients)\b/i.test(epicDescription);
    if (hasFrontend) {
      squad.push('FRONTEND');
    }

    const hasBackend =
      /\b(api|apis|db|dbs|sql|backend|back-end|auth|authentication|authorization|database|databases|server|servers)\b/i.test(
        epicDescription
      );
    if (hasBackend) {
      squad.push('BACKEND');
    }

    const hasDevops =
      /\b(docker|ci\/cd|ci-cd|\bci\b|\bcd\b|deploy|deployment|deploying|kubernetes|k8s|pipeline|pipelines)\b/i.test(
        epicDescription
      );
    if (hasDevops) {
      squad.push('DEVOPS');
    }

    squad.push('QA');

    return Array.from(new Set(squad));
  }

  public recommendSquad(epicDescription: string): AgentRole[] {
    return JevGuard.recommendSquad(epicDescription);
  }

  /**
   * Fast sub-millisecond triage of task complexity.
   * Classifies complexity as LOW, MEDIUM, or HIGH and suggests a matching model role.
   */
  public static fastTriage(taskDescription: string): FastTriageResult {
    // 1. High Complexity check
    const highComplexityPattern =
      /\b(architect|architecture|microservices?|migration|migrate|redesign|overhaul|concurrency|scalability|epic|security audit|infrastructure|distributed|core refactor)\b/i;
    if (highComplexityPattern.test(taskDescription)) {
      return {
        complexity: 'HIGH',
        suggestedModelRole: 'ARCHITECT',
      };
    }

    // 2. Low Complexity check
    const lowComplexityPattern =
      /\b(typo|typos|docs?|documentation|readme|comment|comments|rename|formatting?|linter?|lint|style|trivial|minor|bump version|single line|clean up)\b/i;
    if (lowComplexityPattern.test(taskDescription)) {
      return {
        complexity: 'LOW',
        suggestedModelRole: 'QA',
      };
    }

    // 3. Medium Complexity (default developer workload)
    return {
      complexity: 'MEDIUM',
      suggestedModelRole: 'BACKEND',
    };
  }

  public fastTriage(taskDescription: string): FastTriageResult {
    return JevGuard.fastTriage(taskDescription);
  }
}

export const jevGuard = new JevGuard();
