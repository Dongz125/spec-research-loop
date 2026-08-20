import { query } from '../db'
import { STEP_FIELD_MAP, ResearchSpec, StepId } from '../types'

/**
 * ĐÂY LÀ THÀNH PHẦN CHỐNG TRÀN CONTEXT.
 *
 * Nguyên tắc: mỗi lần gọi AI, payload gửi đi có kích thước gần như
 * KHÔNG PHỤ THUỘC vào số vòng chỉnh sửa đã qua. Ta không gửi:
 *   - toàn bộ spec (chỉ field liên quan tới step hiện tại)
 *   - toàn bộ lịch sử quyết định (chỉ vài quyết định gần nhất, đã tóm tắt)
 *   - toàn bộ nguồn tài liệu (chỉ top-k liên quan nhất qua RAG)
 */
export async function buildContext(
	projectId: string,
	step: StepId,
	userInstruction: string,
) {
	// 1) Lấy spec_version MỚI NHẤT — không lấy lịch sử version cũ
	const [latest] = await query<{
		data: ResearchSpec
		version_number: number
	}>(
		`SELECT data, version_number FROM spec_versions
     WHERE project_id = $1
     ORDER BY version_number DESC LIMIT 1`,
		[projectId],
	)

	const fullSpec = latest?.data ?? ({} as ResearchSpec)

	// 2) Chỉ trích ra field mà step này thực sự cần (tra STEP_FIELD_MAP)
	const relevantFields = STEP_FIELD_MAP[step]
	const specSlice: Partial<ResearchSpec> = {}
	for (const key of relevantFields) {
		if (fullSpec[key]) specSlice[key] = fullSpec[key] as any
	}

	// 3) Chỉ lấy N quyết định GẦN NHẤT liên quan tới step này, ở dạng
	//    tóm tắt 1 dòng — không lấy nguyên văn câu hỏi/giải thích cũ
	const recentDecisions = await query<{
		question: string
		selected_option_id: string
		user_note: string | null
	}>(
		`SELECT question, selected_option_id, user_note FROM decisions
     WHERE project_id = $1 AND step = $2
     ORDER BY created_at DESC LIMIT 3`,
		[projectId, step],
	)

	const decisionSummary = recentDecisions.map(
		(d) =>
			`Đã chọn "${d.selected_option_id}" cho câu hỏi: ${d.question}` +
			(d.user_note ? ` (ghi chú: ${d.user_note})` : ''),
	)

	// 4) Nếu step cần related-work, KHÔNG lấy full text papers — chỉ lấy
	//    top-k đoạn tóm tắt liên quan nhất (RAG). Ví dụ dùng pgvector:
	//
	//    const topSources = await query(
	//      `SELECT id, title, summary FROM sources
	//       WHERE project_id = $1
	//       ORDER BY embedding <=> $2 LIMIT 6`,
	//      [projectId, queryEmbedding]
	//    );
	//
	// Ở bản khởi tạo này để đơn giản, ta chỉ lấy 6 nguồn mới nhất:
	let topSources: unknown[] = []
	if (step === 'related_work' || step === 'gap') {
		topSources = await query(
			`SELECT id, title, authors, year, summary FROM sources
       WHERE project_id = $1 ORDER BY created_at DESC LIMIT 6`,
			[projectId],
		)
	}

	return {
		spec_slice: specSlice,
		recent_decisions: decisionSummary,
		sources: topSources,
		user_instruction: userInstruction,
		current_version: latest?.version_number ?? 0,
	}
}
