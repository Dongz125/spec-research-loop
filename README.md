# SpecResearch Loop

Hệ thống hỗ trợ biến một ý tưởng nghiên cứu ban đầu thành research spec có cấu trúc, có version và được nhiều AI judge đánh giá độc lập.

Dự án là monorepo pnpm/Turborepo:

```text
research-loop/
├── apps/
│   ├── backend/   # Express + TypeScript + PostgreSQL/Neon + Drizzle
│   └── frontend/  # React + TypeScript + Vite + Tailwind CSS
├── packages/      # ESLint, TypeScript và UI dùng chung của Turborepo
├── package.json
└── turbo.json
```

## Yêu cầu

- Node.js 18 trở lên
- pnpm 9
- PostgreSQL; cấu hình hiện tại hướng tới Neon
- Một trong ba AI provider: Gemini, Anthropic hoặc Ollama

Không cần Docker.

## Cài đặt

Tại thư mục gốc:

```bash
pnpm install
```

Tạo file môi trường:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Các biến backend quan trọng:

```dotenv
DATABASE_URL=postgres://...
AUTH_SECRET=chuoi-ngau-nhien-toi-thieu-32-ky-tu
AI_PROVIDER=gemini
GEMINI_API_KEY=...
FRONTEND_URL=http://localhost:5173
PORT=4000
```

Tạo `AUTH_SECRET` bằng Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Không commit `.env` hoặc chia sẻ `AUTH_SECRET`. Đổi secret sẽ làm toàn bộ token đang tồn tại mất hiệu lực.

## Database

### Database mới

Chạy toàn bộ file sau trong Neon SQL Editor:

```text
apps/backend/src/db/schema.sql
```

Schema sử dụng extension `pgcrypto` và `vector`. Nếu Neon chưa bật pgvector, bật extension trước khi chạy schema.

### Database đã tạo từ phiên bản cũ

Chạy migration:

```text
apps/backend/src/db/migrations/001_add_password_hash.sql
```

Các tài khoản cũ chưa có `password_hash` sẽ đặt mật khẩu bằng mật khẩu được nhập trong lần đăng nhập đầu tiên. Tài khoản đăng ký mới luôn yêu cầu mật khẩu tối thiểu 8 ký tự.

## Chạy dự án

```bash
pnpm dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Kiểm tra production build:

```bash
pnpm build
```

## Xác thực

- Mật khẩu được hash bằng Node.js `scrypt` với salt ngẫu nhiên; không lưu mật khẩu thô.
- Đăng nhập/đăng ký trả bearer token ký HMAC-SHA256, có hạn 7 ngày.
- Frontend lưu token trong `localStorage` và gửi qua header `Authorization: Bearer <token>`.
- Các API project, version, generate, confirm và judge đều yêu cầu token và kiểm tra project thuộc người dùng hiện tại.

Đây là cơ chế gọn cho đồ án và triển khai một frontend. Nếu sau này cần đăng xuất từ xa, quản lý nhiều thiết bị hoặc refresh token, nên chuyển sang session lưu trong database hoặc access-token/refresh-token đầy đủ.

## Luồng sử dụng

1. Đăng ký hoặc đăng nhập bằng email và mật khẩu.
2. Tạo/chọn một project.
3. Nhập ý tưởng, nhận câu hỏi làm rõ và xác nhận.
4. Tạo related-work matrix và research gap.
5. Đề xuất contribution, claim/evidence, thí nghiệm và ước lượng feasibility.
6. Chạy 5 judge độc lập, chọn phương án xử lý nhận xét.
7. Xem spec cuối và xuất Markdown hoặc JSON.

AI chỉ tạo preview. Mỗi lần người dùng xác nhận, backend tạo một snapshot mới trong `spec_versions`; dữ liệu cũ không bị ghi đè.

JSON trong `spec_versions` là nguồn dữ liệu có cấu trúc để hệ thống tiếp tục xử lý. Từ nguồn này, giao diện “Xem spec hiện tại” và bước cuối tạo cùng một tài liệu `research-spec.md`, bao gồm cả các mục đã hoàn thành và mục còn thiếu.

Khi xác nhận lại một bước, snapshot mới tự loại bỏ dữ liệu của các bước phụ thuộc phía sau. Các bước đó bị khóa và phải thực hiện lại; snapshot cũ vẫn còn trong lịch sử phiên bản.

Kết quả diễn giải, câu hỏi và lựa chọn ở bước 1 cũng được lưu trong snapshot để có thể xem lại. Mỗi màn hình có URL riêng theo dạng:

```text
/projects/:projectId/idea
/projects/:projectId/related_gap
/projects/:projectId/contribution
/projects/:projectId/judge
/projects/:projectId/final
```

Có thể refresh hoặc dùng Back/Forward của trình duyệt. URL của bước chưa được mở khóa sẽ được chuyển về bước hợp lệ gần nhất. Khi deploy frontend, web server cần cấu hình SPA fallback về `index.html` cho các URL này.

## AI provider và agent

Chọn provider bằng `AI_PROVIDER`:

- `gemini`: cần `GEMINI_API_KEY`.
- `anthropic`: cần `ANTHROPIC_API_KEY`.
- `ollama`: chạy local, mặc định tại `http://localhost:11434`.

Các agent hiện có:

- Interpreter
- Related-work Researcher
- Gap Proposer
- Contribution Proposer
- Experiment Designer
- Feasibility Estimator
- 5 judge: gap, contribution, experiment, evidence và conference readiness
- Judge Resolution Proposer

Related-work agent hiện không truy cập internet và luôn đánh dấu kết quả là chưa xác minh. Phần RAG hiện lấy một số nguồn gần nhất trong database; vector similarity/embedding chưa được nối hoàn chỉnh.

## Cấu trúc dữ liệu chính

- `users`: tài khoản và password hash
- `projects`: project thuộc từng người dùng
- `spec_versions`: snapshot append-only của research spec
- `decisions`: lựa chọn của người dùng
- `sources`, `related_work_entries`: tài liệu và bảng related work
- `experiments`: kế hoạch thí nghiệm
- `judge_reviews`: kết quả đánh giá
- `ai_call_logs`: audit/debug lời gọi AI, không dùng làm conversational memory

## Lỗi thường gặp

| Lỗi | Cách kiểm tra |
| --- | --- |
| `AUTH_SECRET phải có ít nhất 32 ký tự` | Thêm `AUTH_SECRET` hợp lệ vào `apps/backend/.env` rồi khởi động lại backend. |
| `column password_hash does not exist` | Chạy migration `001_add_password_hash.sql`. |
| `401` khi gọi project API | Đăng nhập lại; token có thể thiếu, sai hoặc đã hết hạn. |
| CORS error | Kiểm tra backend đang chạy và `FRONTEND_URL` đúng với URL frontend. |
| `relation spec_versions does not exist` | Chưa chạy `apps/backend/src/db/schema.sql`. |
| Gemini `429` | Đã chạm giới hạn provider; chờ rồi thử lại. |
| AI trả JSON lỗi | Thử lại hoặc dùng model/provider có structured output ổn định hơn. |
