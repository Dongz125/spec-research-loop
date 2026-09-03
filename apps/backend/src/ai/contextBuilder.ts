import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/db'
import { decisions, sources, specVersions } from '../db/schema'
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
	const [latest] = await db
		.select({
			data: specVersions.data,
			versionNumber: specVersions.versionNumber,
		})
		.from(specVersions)
		.where(eq(specVersions.projectId, projectId))
		.orderBy(desc(specVersions.versionNumber))
		.limit(1)

	const fullSpec = (latest?.data ?? {}) as ResearchSpec

	// 2) Chỉ trích ra field mà step này thực sự cần (tra STEP_FIELD_MAP)
	const relevantFields = STEP_FIELD_MAP[step]
	const specSlice: Partial<ResearchSpec> = {}
	for (const key of relevantFields) {
		if (fullSpec[key]) specSlice[key] = fullSpec[key] as any
	}
	if (
		(step === 'gap' || step === 'contribution') &&
		specSlice.related_work_matrix
	) {
		const field = specSlice.related_work_matrix as any
		const rows = Array.isArray(field.value) ? field.value : []
		specSlice.related_work_matrix = {
			...field,
			value: rows
				.filter((row: any) => row?.source_id && row?.verified && row?.url)
				.slice(0, step === 'gap' ? 5 : 6)
				.map((row: any) => ({
					source_id: row.source_id,
					title: String(row.title ?? '').slice(0, 180),
					did_what: String(row.did_what ?? '').slice(0, 320),
					feedback_used: String(row.feedback_used ?? '').slice(0, 180),
					gap_note: String(row.gap_note ?? '').slice(0, 320),
					verified: row.verified,
					url: row.url,
				})),
		}
	}
	if (step === 'gap') {
		delete specSlice.gap_candidates
		delete specSlice.selected_gap_direction
		if (specSlice.problem_statement) {
			const field = specSlice.problem_statement as any
			specSlice.problem_statement = {
				...field,
				value: String(field.value ?? '').slice(0, 1200),
			}
		}
	}

	// 3) Chỉ lấy N quyết định GẦN NHẤT liên quan tới step này, ở dạng
	//    tóm tắt 1 dòng — không lấy nguyên văn câu hỏi/giải thích cũ
	const recentDecisions = await db
		.select({
			question: decisions.question,
			selectedOptionId: decisions.selectedOptionId,
			userNote: decisions.userNote,
		})
		.from(decisions)
		.where(
			and(eq(decisions.projectId, projectId), eq(decisions.step, step)),
		)
		.orderBy(desc(decisions.createdAt))
		.limit(3)

	const decisionSummary = recentDecisions.map(
		(d) =>
			`Đã chọn "${d.selectedOptionId}" cho câu hỏi: ${d.question}` +
			(d.userNote ? ` (ghi chú: ${d.userNote})` : ''),
	)

	// 4) Nếu step cần related-work, KHÔNG lấy full text papers — chỉ lấy
	//    top-k đoạn tóm tắt liên quan nhất (RAG). Ví dụ dùng pgvector:
	//
	//
	// Ở bản khởi tạo này để đơn giản, ta chỉ lấy 6 nguồn mới nhất:
	let topSources: unknown[] = []
	if (step === 'related_work') {
		const sourceRows = await db
			.select({
				id: sources.id,
				title: sources.title,
				authors: sources.authors,
				year: sources.year,
				venue: sources.venue,
				url: sources.url,
				summary: sources.summary,
				reliability_score: sources.reliabilityScore,
			})
			.from(sources)
			.where(eq(sources.projectId, projectId))
			.orderBy(desc(sources.createdAt))
			.limit(6)
		topSources = sourceRows.map((source) => ({
			...source,
			summary: source.summary?.slice(0, 1600) ?? '',
		}))
	}

	return {
		spec_slice: specSlice,
		recent_decisions: decisionSummary,
		sources: topSources,
		user_instruction: userInstruction,
		current_version: latest?.versionNumber ?? 0,
	}
}
