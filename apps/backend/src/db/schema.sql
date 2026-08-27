-- =====================================================================
-- SpecResearch Loop — Database schema
-- Nguyên tắc thiết kế:
--   1. spec_versions là NGUỒN SỰ THẬT DUY NHẤT (append-only, có version).
--      AI KHÔNG "nhớ" hội thoại — mọi ngữ cảnh AI cần đều đọc từ đây.
--   2. ai_call_logs chỉ để audit/debug, KHÔNG được dùng làm input cho
--      lần gọi AI tiếp theo (tránh context phình to theo thời gian).
--   3. sources dùng pgvector để làm RAG cho related-work — không nhét
--      nguyên văn paper vào prompt.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector cho RAG (bỏ nếu chưa cần)

-- ---------------------------------------------------------------------
-- users / projects
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','judged','finalized')),
  current_step TEXT NOT NULL DEFAULT 'idea_capture',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Danh sách step hợp lệ — dùng lại ở nhiều bảng, khai báo 1 nơi cho dễ maintain
-- idea_capture -> decomposition -> related_work -> gap -> contribution
-- -> experiment_design -> feasibility -> spec_draft -> judge -> final

-- ---------------------------------------------------------------------
-- spec_versions: NGUỒN SỰ THẬT DUY NHẤT của ResearchSpec (JSONB)
-- ---------------------------------------------------------------------
CREATE TABLE spec_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  parent_version_id UUID REFERENCES spec_versions(id),
  step TEXT NOT NULL,
  data JSONB NOT NULL,                 -- toàn bộ ResearchSpec tại version này
  changed_fields TEXT[] NOT NULL DEFAULT '{}',  -- field nào đổi so với parent
  change_summary TEXT,                 -- tóm tắt NGẮN (không lưu nguyên prompt dài)
  created_by TEXT NOT NULL,            -- 'user' | 'ai:interpreter' | 'ai:gap_proposer' ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_number)
);

CREATE INDEX idx_spec_versions_project ON spec_versions (project_id, version_number DESC);

-- ---------------------------------------------------------------------
-- decisions: log các lựa chọn A/B/C/D/Other của user ở mỗi bước
-- ---------------------------------------------------------------------
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  spec_version_id UUID REFERENCES spec_versions(id),
  step TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,              -- [{id,label,explanation,example}, ...]
  selected_option_id TEXT,
  user_note TEXT,                      -- nội dung khi chọn "Other"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisions_project ON decisions (project_id, created_at);

-- ---------------------------------------------------------------------
-- sources: kho paper/tài liệu — dùng cho RAG, KHÔNG nhét thẳng vào prompt
-- ---------------------------------------------------------------------
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  authors TEXT,
  year INT,
  venue TEXT,
  url TEXT,
  summary TEXT,                        -- tóm tắt ngắn do AI hoặc user viết
  reliability_score NUMERIC(3,2) CHECK (reliability_score BETWEEN 0 AND 1),
  embedding VECTOR(1536),              -- bỏ cột này nếu chưa dùng RAG ngay
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sources_project ON sources (project_id);
-- Khi đã có nhiều dữ liệu, tạo thêm index ivfflat cho embedding để truy vấn nhanh:
-- CREATE INDEX idx_sources_embedding ON sources USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE related_work_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  did_what TEXT,
  feedback_used TEXT,
  gap_note TEXT,                       -- "điểm cần nghiên cứu thêm"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- experiments: kế hoạch thí nghiệm (bước 6)
-- ---------------------------------------------------------------------
CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  spec_version_id UUID REFERENCES spec_versions(id),
  name TEXT NOT NULL,
  goal TEXT,
  config JSONB NOT NULL DEFAULT '{}',  -- baselines, metrics, dataset, budget...
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- judge_reviews: mỗi Judge độc lập đánh giá 1 spec_version cụ thể
-- ---------------------------------------------------------------------
CREATE TABLE judge_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_version_id UUID NOT NULL REFERENCES spec_versions(id) ON DELETE CASCADE,
  judge_name TEXT NOT NULL CHECK (judge_name IN (
    'gap_judge','contribution_judge','experiment_judge',
    'evidence_judge','conference_readiness_judge'
  )),
  issue TEXT,
  reasoning TEXT,
  severity TEXT CHECK (severity IN ('MINOR','MAJOR','CRITICAL')),
  suggestion TEXT,
  raw_output JSONB,                    -- output gốc (JSON) của judge, để debug
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_judge_reviews_version ON judge_reviews (spec_version_id);

-- ---------------------------------------------------------------------
-- ai_call_logs: CHỈ để audit/debug — KHÔNG đọc lại bảng này để build
-- context cho lần gọi AI sau (đó là việc của spec_versions + decisions).
-- ---------------------------------------------------------------------
CREATE TABLE ai_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  step TEXT NOT NULL,
  model TEXT NOT NULL,
  input_context JSONB NOT NULL,        -- đúng payload đã gửi (để biết AI "thấy" gì)
  output JSONB,
  input_tokens INT,
  output_tokens INT,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_call_logs_project ON ai_call_logs (project_id, created_at DESC);
