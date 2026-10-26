# Design Specification: 2D Agent Office (Virtual Software Company)

**Document Version:** 1.0.0  
**Date:** 2026-10-26  
**Status:** Under Review  
**Target:** Localhost 2D AI Agent Team Office Simulator  

---

## 1. Executive Summary & Success Criteria

### 1.1 Tầm nhìn sản phẩm
**2D Agent Office** là một bộ công cụ lập trình đa tác tử (Multi-Agent Tool), khi được khởi tạo (`init`) trong bất kỳ thư mục dự án nào, sẽ trực quan hóa dự án đó thành một **công ty phát triển phần mềm ảo 2D (phong cách Gather.town / Retro Pixel RPG)** chạy trên máy cục bộ (localhost/desktop).

Trong thế giới này:
- **Người dùng đóng vai Giám đốc (Director / Engineering Leader)**: Đưa ra bài toán, chỉ đạo chiến lược, cấp ngân sách, phê duyệt kế hoạch và duyệt code trước khi release.
- **Đội ngũ AI Agents đóng vai các nhân viên chuyên biệt**: Product Manager/Architect, Frontend Dev, Backend Dev, QA Tester, DevOps. Các agent tự trao đổi, thảo luận giải pháp, chia nhỏ ticket lên bảng Kanban, đi lại giữa các bàn làm việc, gõ code và test thật trên codebase.

### 1.2 Tiêu chí thành công (Definition of Success)
> *"Cứ làm cho nó giống cách vận hành một văn phòng thực tế nhất, đó sẽ là tiêu chí thành công."*

1. **Tính chân thực thực tế (Realistic Engineering Workflow)**: Tuân thủ quy trình phần mềm chuẩn: *Yêu cầu $\rightarrow$ Thiết kế kiến trúc $\rightarrow$ Chia nhỏ Ticket Kanban $\rightarrow$ Viết code & Unit test $\rightarrow$ QA Review $\rightarrow$ Merge & Báo cáo*.
2. **Không cồng kềnh (Zero-BE Platform)**: Không yêu cầu cài đặt Docker, Postgres hay dựng server BE phức tạp. Chạy trực tiếp qua Desktop App (Tauri / Electron) hoặc script CLI cực nhẹ kết nối trực tiếp với hệ điều hành cục bộ.
3. **Trực quan sinh động (Game-like 2D UI)**: Nhìn thấy nhân viên đi lại, ngồi gõ phím, hiện bong bóng thoại, soi được chuỗi suy nghĩ (CoT) và file diff xanh/đỏ thời gian thực.
4. **Kiểm soát linh hoạt (Dynamic Squad & Human-in-the-loop)**: Giám đốc có quyền tuyển thêm hoặc cho nghỉ agent ngay giữa chừng để tối ưu hiệu suất, triệu tập họp khẩn (War Room), và chặn xét duyệt các checkpoint rủi ro.
5. **Tối ưu chi phí & Quota (Jev Fast Guard)**: Sử dụng Jev decision model làm bộ lọc nhanh (<10ms) để bắt lỗi kẹt vòng lặp vô tận và tóm tắt hội thoại, tránh lãng phí token frontier LLM.

---

## 2. Kiến trúc Hệ thống Phân tầng (4-Layer Clean Architecture)

Hệ thống được tổ chức thành 4 phân tầng độc lập, giao tiếp với nhau thông qua Trục Sự Kiện 2 chiều (Office Event Bus):

```
+-----------------------------------------------------------------------------------+
| 1. PRESENTATION LAYER (React 19 + Tailwind + Phaser 3 / PixiJS)                  |
|    - 2D Office Canvas: Tilemap, A* Pathfinding, Sprite Animations, Speech Bubbles  |
|    - Executive Dashboard: Kanban Board, Thought Inspector, Code Diff, Quota Meter |
+-----------------------------------------------------------------------------------+
                                         ↕ (Typed WebSocket / IPC Events)
+-----------------------------------------------------------------------------------+
| 2. ORCHESTRATION LAYER (Agent Lifecycle & Business Logic)                         |
|    - Squad Manager: Khởi tạo Epic, phân bổ vai trò, Dynamic Squad Resizing        |
|    - Agent FSM: Máy trạng thái (IDLE -> THINKING -> DISCUSSING -> CODING -> REVIEW)|
|    - Jev Fast Guard: Triage lỗi lặp vòng (<10ms), Squad Recommender, Summarizer   |
|    - Director Checkpoint Gate: Chặn duyệt Plan, duyệt PR, triệu tập War Room      |
+-----------------------------------------------------------------------------------+
                                         ↕
+-----------------------------------------------------------------------------------+
| 3. PROVIDER & TOOLING LAYER (pi.dev harness + System Adapters)                    |
|    - Model Provider Hub: Proxy config (OpenAI/Anthropic/Gemini/LiteLLM/Ollama)    |
|    - Context Window Isolator: Vùng nhớ độc lập cho từng agent                     |
|    - Code Tools Engine: File Read/Write/Diff, Terminal Bash (PTY), Git Automation |
+-----------------------------------------------------------------------------------+
                                         ↕
+-----------------------------------------------------------------------------------+
| 4. PERSISTENCE LAYER (.office/ Local Storage)                                     |
|    - office.db (SQLite WAL Mode): Lưu quan hệ Epics, Tasks, Activity Logs, Quota |
|    - epics/<id>/*.md (Markdown): Lưu plan.md, tasks.md, spec.md con người đọc được|
|    - config.json: Cấu hình proxy, API keys, avatar/sprite mappings                |
+-----------------------------------------------------------------------------------+
```

---

## 3. Bản đồ Văn phòng 2D & Tương tác Thị giác

### 3.1 Thiết kế Mặt bằng Văn phòng (Office Layout)
Văn phòng ảo chia thành 5 khu vực chức năng:
1. **Khu vực Cửa & Thang máy (Entrance & Elevator)**: Nơi các nhân viên mới được tuyển xuất hiện và đi vào, hoặc nhân viên được cho nghỉ bước vào thang máy rời đi.
2. **Khu vực Làm việc Mở (Open Workstation Space)**:
   - *Product & Architecture Desk*: Bàn làm việc của PM / Lead Architect.
   - *Engineering Desks*: Dãy bàn của Frontend & Backend Developers (máy tính 2 màn hình, hiệu ứng gõ phím).
   - *QA & Testing Station*: Bàn của Tester với màn hình kiểm thử terminal.
3. **Phòng Họp Khẩn (War Room / Conference Center)**: Bàn tròn lớn ở giữa văn phòng. Khi Giám đốc bấm `[Họp Khẩn]`, chuông reo và tất cả agent tập trung về đây thảo luận.
4. **Phòng Máy chủ (Server & Quota Room)**: Tủ rack máy chủ phát sáng LED phản ánh tình trạng Quota và tốc độ xử lý của các LLM Provider.
5. **Khu Giải lao (Coffee & Lounge)**: Nơi các agent rảnh rỗi (`IDLE`) đứng uống cà phê, trò chuyện phiếm để tái tạo năng lượng (tiết kiệm token).

### 3.2 Bộ Trạng thái Nhân viên (Sprite Animations & Audio)
| Trạng thái Agent | Hành vi Sprite trong Game | Hiệu ứng UI / Âm thanh |
| :--- | :--- | :--- |
| `IDLE` | Đứng tại bàn hoặc đi dạo khu Coffee | Không gọi LLM, tiết kiệm chi phí |
| `WALKING` | Di chuyển theo đường đi ngắn nhất (A* Pathfinding) | Tiếng bước chân nhẹ |
| `THINKING` | Ngồi tại bàn, vò đầu hoặc bong bóng icon bóng đèn | CoT stream về Thought Inspector |
| `CODING` | Ngồi gõ bàn phím liên tục, màn hình đổi màu code | Âm thanh phím cơ lách cách |
| `TALKING` | Quay mặt về phía đồng nghiệp, hiện Speech Bubble | Bong bóng thoại tóm tắt 5-7 từ |
| `REVIEWING` | Đứng quan sát màn hình của Coder | Icon kính lúp soi xét |
| `CELEBRATING`| Nhảy cẫng ăn mừng khi Ticket chuyển sang `DONE` | Tiếng chuông 'Level Up' vui nhộn |

---

## 4. Quản lý Đội hình Động (Dynamic Squad Management)

Khác với các hệ thống multi-agent cứng nhắc, hệ thống cho phép Giám đốc điều chỉnh đội hình linh hoạt:
1. **Khởi tạo Epic**: Giám đốc mô tả bài toán $\rightarrow$ Jev gợi ý đội hình tối thiểu phù hợp (VD: Task Refactor chỉ cần Lead Architect + Backend Dev; Task Bug CSS chỉ cần 1 Frontend Dev).
2. **Tuyển thêm Agent giữa chừng (Mid-flight Hire)**: Khi Coder gặp lỗi bảo mật hóc búa, Giám đốc bấm `[+ Tuyển Agent]` chọn *Security Auditor*. Agent này xuất hiện ngay tại cửa thang máy, nạp tóm tắt bối cảnh của Epic và tham gia giải quyết.
3. **Cho nghỉ Agent sớm (Early Release)**: Khi Architect hoàn thành xong bản `plan.md` và `tasks.md`, Giám đốc có thể cho Architect nghỉ để giải phóng context và dừng tiêu thụ token.

---

## 5. Tối ưu Hiệu năng với Jev Fast Guard (TypeSafe AI)

Để đảm bảo tốc độ phản hồi sub-millisecond và không tiêu tốn quota vào các việc vô ích:
* **Chốt chặn 1: Loop Breaker (<10ms)**: Kiểm tra chuỗi tool calls gần nhất. Nếu phát hiện Coder đang sửa đi sửa lại 1 lỗi giống nhau quá 3 lần, Jev lập tức kích hoạt cờ `STUCK_LOOP`, tạm dừng agent và thông báo Giám đốc hoặc triệu tập Architect cứu trợ.
* **Chốt chặn 2: Thought Summarizer**: LLM suy nghĩ chuỗi dài 500 từ; Jev rút gọn thành 1 câu cô đọng (ví dụ: *"Đang tối ưu hàm hash bcrypt..."*) để bắn lên bong bóng thoại trên đầu sprite trong game canvas.
* **Chốt chặn 3: Fast Triage**: Phân loại độ phức tạp của issue để quyết định route sang model nhỏ (nhanh/rẻ) hay model lớn (Claude 3.5 Sonnet / Opus).

---

## 6. Mô hình Dữ liệu (Database Schema)

Dữ liệu cục bộ được lưu trữ tại `.office/office.db` (SQLite):

```sql
-- Epics
CREATE TABLE epics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, IN_PROGRESS, PAUSED, COMPLETED
    budget_cap_usd REAL DEFAULT 5.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Assigned Squad
CREATE TABLE squad_members (
    id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL,
    agent_role TEXT NOT NULL, -- ARCHITECT, FRONTEND, BACKEND, QA, DEVOPS
    agent_name TEXT NOT NULL,
    avatar_id TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, RELEASED
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(epic_id) REFERENCES epics(id)
);

-- Kanban Tasks
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    epic_id TEXT NOT NULL,
    assigned_agent_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'BACKLOG', -- BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE
    order_index INTEGER DEFAULT 0,
    dependencies_json TEXT, -- JSON array of task IDs
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY(epic_id) REFERENCES epics(id)
);

-- Activity Logs & Audit Trail (Event Sourcing)
CREATE TABLE activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    epic_id TEXT NOT NULL,
    task_id TEXT,
    agent_id TEXT NOT NULL, -- Agent ID or 'DIRECTOR'
    event_type TEXT NOT NULL, -- TOOL_CALL, FILE_EDIT, TEST_EXEC, SPEECH, WAR_ROOM
    payload_json TEXT NOT NULL
);

-- Quota & Token Telemetry
CREATE TABLE quota_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    epic_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    FOREIGN KEY(epic_id) REFERENCES epics(id)
);
```

---

## 7. Các Chế độ Can thiệp của Giám đốc (Director Controls)

1. **Chat 1-1 Cá nhân**: Click vào sprite của bất kỳ nhân viên nào để mở popover thì thầm (`whisper`). Lệnh này sẽ được inject trực tiếp vào system prompt vòng lặp tiếp theo của agent đó.
2. **Phát thanh Toàn văn phòng (Broadcast)**: Khung chat dưới đáy màn hình cho phép Giám đốc phát lệnh cho toàn bộ squad.
3. **Nút Họp Khẩn (War Room)**: Dừng tức thì mọi công việc lẻ tẻ, kéo tất cả agent vào phòng họp để thống nhất lại chiến thuật.
4. **Nút Tạm dừng (Pause / Resume)**: Đóng băng toàn bộ hoạt động của văn phòng khi Giám đốc cần ra ngoài hoặc suy nghĩ thêm.
5. **Cổng Duyệt Checkpoint (Approval Gate)**:
   - *Approve Plan*: Kế hoạch `plan.md` phải được Giám đốc tick xanh trước khi các dev nhận ticket.
   - *Approve Merge*: Pull request/diff code cuối cùng phải được Giám đốc bấm duyệt trước khi ghi nhận hoàn thành Epic.

---

## 8. Lộ trình Triển khai (Next Steps)
Sau khi tài liệu thiết kế này được phê duyệt:
1. Chuyển sang kỹ năng **`writing-plans`** để lập Implementation Plan chi tiết theo từng task độc lập.
2. Khởi tạo bộ khung dự án (Tauri / Vite + React + Phaser 3 + SQLite).
3. Hiện thực Event Bus, Game Canvas Office 2D và Module điều phối Agent.
