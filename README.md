# SpecResearch Loop

Hệ thống hoàn thiện ý tưởng nghiên cứu bằng bằng chứng và vòng lặp xác nhận.
Đồ án được quản lý dưới dạng **Monorepo bằng Turborepo**, gồm 2 ứng dụng chính:

```text
specresearch-loop/
├── apps/
│   ├── backend/   # API (Node.js + TypeScript + Express + Postgres)
│   └── frontend/  # Giao diện wizard 5 bước (React + TypeScript + Vite)
├── package.json   # Quản lý dependencies chung của toàn dự án
└── turbo.json     # Cấu hình Turborepo
```

Không dùng Docker — database dùng **Neon** (Postgres miễn phí trên cloud),
AI dùng 1 trong 3 provider tuỳ bạn chọn (xem mục "Chạy miễn phí" bên dưới).

---

## 1. Yêu cầu trước khi bắt đầu

- Node.js **≥ 18** (kiểm tra: `node -v`)
- Trình quản lý gói: `npm` hoặc `pnpm` (khuyên dùng cho monorepo)
- Một tài khoản [neon.tech](https://neon.tech) (miễn phí, không cần thẻ)
- Một trong các API key AI (xem mục 4)

---

## 2. Tạo database trên Neon

1. Đăng ký tại [neon.tech](https://neon.tech) → **New Project**
2. Đặt tên project (vd `specresearch-loop`), chọn region gần bạn
3. Sau khi tạo xong, vào **Connection Details**, copy chuỗi kết nối dạng:
    ```
    postgres://<user>:<password>@<host>/<dbname>?sslmode=require
    ```
4. Mở **SQL Editor** trên Neon dashboard, dán toàn bộ nội dung file
   `apps/backend/db/schema.sql` vào và **Run** — việc này tạo tất cả các bảng.

> Nếu bước 4 báo lỗi thiếu extension `vector`, vào Neon dashboard →
> **Extensions** → bật `pgvector` trước, rồi chạy lại schema.

---

## 3. Cấu hình biến môi trường (.env)

Bạn cần cấu hình `.env` cho cả `backend` và `frontend`.

**Cho Backend:**

```bash
cd apps/backend
cp .env.example .env
```

Mở `apps/backend/.env`, điền:

- `DATABASE_URL` — chuỗi kết nối Neon ở bước 2
- `AI_PROVIDER` — chọn `anthropic` / `gemini` / `ollama` (xem mục 4)
- API key tương ứng với provider đã chọn

**Cho Frontend:**

```bash
cd ../frontend
cp .env.example .env
```

_(Mặc định frontend đã trỏ tới API `http://localhost:4000`, thường không cần sửa gì thêm)_

---

## 4. Chọn AI provider — cách nào không tốn tiền

Đặt `AI_PROVIDER` trong `apps/backend/.env` theo 1 trong 3 lựa chọn:

### `gemini` — khuyến nghị, miễn phí thật, không cần thẻ

1. Vào [aistudio.google.com/apikey](https://aistudio.google.com/apikey), đăng nhập bằng Google, bấm **Create API key**
2. Dán vào `GEMINI_API_KEY` trong `.env`
3. Có giới hạn số request/phút ở tầng free — nếu bước Judge (gọi 5 lần liên tiếp) bị lỗi rate limit, thử lại sau vài giây hoặc giảm số Judge chạy song song trong `judges.ts`.

### `ollama` — 100% miễn phí, chạy trên máy bạn, không giới hạn

1. Cài tại [ollama.com](https://ollama.com)
2. Chạy `ollama pull llama3.1:8b` (hoặc model nhỏ hơn nếu máy yếu, vd `phi3:mini`)
3. Để `AI_PROVIDER=ollama`, không cần điền API key nào.
4. Chất lượng JSON output có thể kém ổn định hơn, nếu lỗi hãy thử model lớn hơn.

### `anthropic` — chất lượng tốt nhất, có $5 dùng thử

1. Tạo tài khoản tại [console.anthropic.com](https://console.anthropic.com)
2. Dùng model `claude-haiku-4-5-20251001` (rẻ nhất) cho hầu hết các bước để tiết kiệm credit.

---

## 5. Chạy dự án (Turborepo)

Từ **thư mục gốc** của dự án (root), cài đặt toàn bộ dependencies cho cả frontend và backend:

```bash
pnpm install
```

Khởi chạy đồng thời cả API và Giao diện chỉ với 1 lệnh duy nhất:

```bash
pnpm dev
```

- **Backend** tự động chạy tại: `http://localhost:4000`
- **Frontend** tự động chạy tại: `http://localhost:5173`

---

## 6. Luồng sử dụng

1. Ứng dụng tự tạo 1 project demo khi mở lần đầu (lưu `project_id` vào `localStorage` của trình duyệt).
2. Ở mỗi bước: nhập yêu cầu vào ô prompt → **Tạo gợi ý** → xem/sửa JSON → **Xác nhận** để ghi thành version mới.
3. **Lịch sử phiên bản** (góc trên) cho phép xem lại và quay về version cũ bất kỳ lúc nào — thao tác này không gọi AI.
4. Ở bước 4, bấm **Chạy đánh giá** để 5 Judge độc lập chấm bản spec mới nhất.
5. Bước 5 tổng hợp toàn bộ spec đã xác nhận, xuất ra Markdown hoặc JSON.

---

## 7. Việc còn thiếu (dành cho bạn tự hoàn thiện)

Backend hiện có agent thật cho 3/7 bước (`idea_capture`, `gap`, `judge`).
Các bước còn lại sẽ báo lỗi "chưa cấu hình agent". Đây là cơ hội để bạn thực hành:

1. Copy `apps/backend/src/ai/agents/gapProposer.ts`, đổi system prompt + JSON schema đầu ra cho đúng nhiệm vụ.
2. Thêm 1 case trong `apps/backend/src/routes/specs.ts` → `switch (step)`.
3. Frontend không cần sửa gì — `StepField` đã tổng quát cho mọi field.

---

## 8. Xử lý lỗi thường gặp

| Lỗi                                       | Nguyên nhân thường gặp                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `CORS error` trên frontend                | Backend chưa chạy, hoặc `FRONTEND_URL` trong backend/.env không khớp cổng |
| `relation "spec_versions" does not exist` | Chưa chạy `db/schema.sql` trên Neon SQL Editor                            |
| `Agent trả về JSON không hợp lệ`          | Model (đặc biệt Ollama) trả lời kèm text ngoài JSON — siết lại prompt     |
| `Gemini error: 429`                       | Vượt giới hạn free tier — chờ vài giây rồi thử lại                        |
