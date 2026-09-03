# Hướng dẫn chạy SpecResearch Loop

## 1. Phạm vi

Tài liệu này mô tả cách cài đặt, cấu hình, khởi động và kiểm tra phiên bản hiện tại của SpecResearch Loop. Project là monorepo dùng pnpm và Turborepo:

- `apps/backend`: Express + TypeScript, Drizzle ORM và PostgreSQL.
- `apps/frontend`: React + TypeScript, Vite và Tailwind CSS.
- `packages`: cấu hình TypeScript/ESLint và package UI dùng chung.

Ứng dụng hỗ trợ biến ý tưởng nghiên cứu thành research spec theo nhiều bước: làm rõ ý tưởng, tìm related work, đề xuất gap, contribution, thí nghiệm, đánh giá feasibility, chạy judge và xuất bản spec.

## 2. Yêu cầu môi trường

- Node.js `>=18`.
- pnpm `9.x` (khuyến nghị bật Corepack: `corepack enable`).
- PostgreSQL tương thích với `pg`, hoặc Neon PostgreSQL.
- Extension `pgcrypto` và `vector` (pgvector).
- Một AI provider: Anthropic, Gemini hoặc Ollama.
- Không bắt buộc Docker.

Kiểm tra nhanh:

```bash
node --version
pnpm --version
```

Nếu pnpm chưa đúng major version:

```bash
corepack prepare pnpm@9.0.0 --activate
```

## 3. Cài dependency

Chạy tại thư mục gốc repository:

```bash
pnpm install
```

Không chạy `npm install` trong từng app vì workspace đang dùng lockfile của pnpm.

## 4. Cấu hình biến môi trường

Tạo file `apps/backend/.env`. Frontend hiện sử dụng API mặc định tại `http://localhost:4000`; nếu cần đổi endpoint, kiểm tra cách đọc biến trong `apps/frontend/src/lib/api.ts` trước khi thêm biến mới.

Mẫu backend tối thiểu:

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
AUTH_SECRET=mot-chuoi-ngau-nhien-tu-32-ky-tu
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
OPENALEX_API_KEY=your-openalex-key
OPENALEX_EMAIL=you@example.com
FRONTEND_URL=http://localhost:5173
PORT=4000
```

Các provider:

| `AI_PROVIDER` | Biến bắt buộc | Ghi chú |
| --- | --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` | Đây là giá trị mặc định trong `AiClient.ts` nếu không đặt `AI_PROVIDER`. |
| `gemini` | `GEMINI_API_KEY` | Phù hợp để thử nghiệm với free tier của Google AI Studio. |
| `ollama` | Không có API key | Cần Ollama đang chạy; có thể đặt `OLLAMA_HOST` và `OLLAMA_TIMEOUT_MS`. |

Cấu hình Ollama mẫu:

```dotenv
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_TIMEOUT_MS=120000
```

Sau đó tải model đúng với cấu hình hiện tại của `apps/backend/src/ai/AiClient.ts` rồi kiểm tra Ollama:

```bash
ollama pull qwen3.5:4b
ollama list
```

Tạo secret an toàn bằng Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Không commit `.env`, API key hoặc `AUTH_SECRET`.

## 5. Khởi tạo database

### Database mới

1. Tạo database PostgreSQL hoặc project Neon.
2. Bật extension pgvector nếu nhà cung cấp chưa bật sẵn.
3. Chạy `apps/backend/src/db/schema.sql` trong SQL Editor hoặc bằng `psql`:

```bash
psql "$DATABASE_URL" -f apps/backend/src/db/schema.sql
```

Schema tạo các bảng users, projects, spec_versions, decisions, sources, related_work_entries, experiments, judge_reviews và ai_call_logs. Không có seed script; tài khoản, project và dữ liệu spec được tạo qua giao diện.

### Database đã tồn tại từ bản cũ

Chạy migration:

```bash
psql "$DATABASE_URL" -f apps/backend/src/db/migrations/001_add_password_hash.sql
```

Có thể dùng Drizzle để đẩy schema trong môi trường phát triển:

```bash
pnpm --filter backend db:push
```

Lệnh này đọc `DATABASE_URL` từ `apps/backend/.env`. Với database dùng production, ưu tiên migration/SQL có kiểm soát thay vì `db:push`.

## 6. Chạy development

Từ thư mục gốc:

```bash
pnpm dev
```

Địa chỉ mặc định:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Có thể chạy riêng từng app:

```bash
pnpm --filter backend dev
pnpm --filter frontend dev
```

Nếu port bị chiếm, đổi `PORT` của backend và cấu hình frontend API tương ứng trong `apps/frontend/src/lib/api.ts`.

## 7. Kiểm tra sau khi khởi động

1. Mở frontend và đăng ký tài khoản với mật khẩu tối thiểu 8 ký tự.
2. Tạo một project mới.
3. Hoàn tất từng bước theo thứ tự; mỗi lần xác nhận tạo snapshot mới trong `spec_versions`.
4. Ở bước related work, kiểm tra OpenAlex trả về nguồn trước khi chạy phân tích AI.
5. Chạy judge và kiểm tra lịch sử version.
6. Mở trang final, thử xuất Markdown/JSON.

Backend không khai báo route health riêng. Có thể dùng việc mở frontend, đăng ký và gọi API đăng nhập làm smoke test. Nếu cần kiểm tra CORS, backend phải chạy với `FRONTEND_URL` đúng origin của frontend.

## 8. Kiểm tra chất lượng mã nguồn

```bash
pnpm check-types
pnpm build
pnpm lint
```

Frontend build dùng `tsc -b` và Vite. Backend build dùng `tsc -p .`. Sau build có thể chạy backend production bằng:

```bash
pnpm --filter backend start
```

## 9. Luồng dữ liệu và giới hạn hiện tại

- `spec_versions` là nguồn sự thật append-only cho research spec; dữ liệu cũ không bị ghi đè.
- AI không dùng `ai_call_logs` làm conversational memory. Agent đọc context từ snapshot và dữ liệu liên quan.
- Các agent đều đi qua `callAgent()` trong `AiClient.ts`, nên provider được chọn tập trung ở một nơi.
- Related work lấy metadata từ OpenAlex; model chỉ được phân tích source UUID đã lưu.
- Cột embedding và pgvector đã có trong schema, nhưng vector similarity/embedding chưa được nối hoàn chỉnh trong RAG hiện tại.
- AI trả JSON; output quá dài hoặc không hợp lệ sẽ gây lỗi parse và cần thử lại/provider khác.
- Gemini có thể trả lỗi 429/503; retry/backoff được xử lý trong code ở các phần liên quan, nhưng quota provider vẫn là giới hạn thực tế.
- Khi xác nhận lại bước trước, các bước phụ thuộc phía sau bị reset và cần thực hiện lại; các snapshot trước vẫn nằm trong lịch sử.

## 10. Lỗi thường gặp

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| `AUTH_SECRET phải có ít nhất 32 ký tự` | Đặt secret dài tối thiểu 32 ký tự trong `apps/backend/.env`, rồi restart backend. |
| `column password_hash does not exist` | Chạy migration `001_add_password_hash.sql`. |
| `relation spec_versions does not exist` | Chưa chạy `schema.sql` hoặc đang trỏ nhầm `DATABASE_URL`. |
| Lỗi `type vector does not exist` | Bật extension pgvector trước khi chạy schema. |
| `401` từ project API | Đăng nhập lại hoặc kiểm tra token trong localStorage. |
| CORS error | Kiểm tra backend đang chạy và `FRONTEND_URL` khớp chính xác origin frontend. |
| Gemini `429`/`503` | Chờ quota hồi phục, giảm số lần gọi hoặc chuyển sang provider khác. |
| Ollama timeout | Kiểm tra Ollama/model, tăng `OLLAMA_TIMEOUT_MS` hoặc dùng model nhỏ hơn. |
| AI trả JSON lỗi | Thử lại, giảm độ dài nội dung đầu vào hoặc chuyển provider/model ổn định hơn. |
| Refresh route frontend bị 404 khi deploy | Cấu hình web server fallback mọi route SPA về `index.html`. |

## 11. Checklist triển khai

- [ ] Node và pnpm đúng phiên bản.
- [ ] Dependency đã cài bằng `pnpm install`.
- [ ] `DATABASE_URL` trỏ đúng database.
- [ ] `pgcrypto` và `vector` đã bật.
- [ ] Đã chạy schema hoặc migration tương ứng.
- [ ] `AUTH_SECRET` không dùng giá trị mẫu.
- [ ] AI provider và key/model đã được kiểm tra.
- [ ] `FRONTEND_URL` khớp domain frontend.
- [ ] Đã chạy `pnpm check-types`, `pnpm build` và smoke test luồng đăng nhập.
