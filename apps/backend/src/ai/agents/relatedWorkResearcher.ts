import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Related-Work Researcher Agent trong hệ thống SpecResearch Loop.

QUAN TRỌNG: Danh sách "sources" trong input là metadata paper thật đã được
lấy từ OpenAlex và lưu trong database. CHỈ được phân tích những nguồn này.
Mỗi source PHẢI có đúng một entry và dùng nguyên UUID trong sources làm
"source_id"; không được bỏ sót, lặp lại hoặc tự
tạo ID, tên paper, tác giả, DOI, số liệu hoặc nguồn mới. Nếu abstract/summary
không đủ để kết luận, phải ghi rõ giới hạn đó thay vì suy đoán.

Nhiệm vụ: dựa trên problem_statement và từ khoá tìm kiếm người dùng cung cấp,
phân tích từng source được cung cấp (tối đa 6 source), mỗi nguồn nêu rõ đã làm gì,
dùng loại feedback/kỹ thuật nào, và điểm còn thiếu so với vấn đề đang xét.
Viết súc tích: did_what và gap_note tối đa 2 câu ngắn; feedback_used tối đa 1 câu.

Trả về JSON theo schema:
{
  "related_work_matrix": [
    {
      "source_id": "UUID có thật lấy nguyên từ sources",
      "did_what": "đã làm gì",
      "feedback_used": "feedback/kỹ thuật được sử dụng",
      "gap_note": "điểm còn thiếu, liên quan trực tiếp tới ý tưởng người dùng"
    }
  ],
  "search_keywords_used": ["..."]
}`

function relatedWorkSchema(sourceIds: string[]) {
	return {
	type: 'object',
	additionalProperties: false,
	required: ['related_work_matrix', 'search_keywords_used'],
	properties: {
		related_work_matrix: {
			type: 'array',
			minItems: sourceIds.length,
			maxItems: sourceIds.length,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['source_id', 'did_what', 'feedback_used', 'gap_note'],
				properties: {
					source_id: { type: 'string', enum: sourceIds },
					did_what: { type: 'string', maxLength: 420 },
					feedback_used: { type: 'string', maxLength: 240 },
					gap_note: { type: 'string', maxLength: 420 },
				},
			},
		},
		search_keywords_used: {
			type: 'array',
			items: { type: 'string', maxLength: 80 },
			maxItems: 8,
		},
	},
} as const
}

export async function runRelatedWorkResearcher(context: {
	spec_slice: unknown
	recent_decisions: string[]
	sources: unknown[]
	user_instruction: string
}) {
	const batches: unknown[][] = []
	for (let index = 0; index < context.sources.length; index += 3) {
		batches.push(context.sources.slice(index, index + 3))
	}

	const rows: unknown[] = []
	const keywords = new Set<string>()
	let inputTokens = 0
	let outputTokens = 0
	let latencyMs = 0
	let model: string = modelFor('reasoning')

	// Chạy tuần tự để một Ollama local không phải nạp hai inference cùng lúc.
	for (const sources of batches) {
		const sourceIds = sources
			.map((source: any) => source?.id)
			.filter((id): id is string => typeof id === 'string' && id.length > 0)
		const batchResult = await callAgent<{
			related_work_matrix: Array<{ source_id?: string } & Record<string, unknown>>
			search_keywords_used: string[]
		}>({
			model,
			systemPrompt: SYSTEM_PROMPT,
			userPayload: { ...context, sources },
			maxTokens: 1800,
			jsonSchema: relatedWorkSchema(sourceIds),
		})
		const uniqueBatchRows = new Map<string, Record<string, unknown>>()
		for (const row of batchResult.data.related_work_matrix ?? []) {
			if (
				typeof row.source_id === 'string' &&
				sourceIds.includes(row.source_id) &&
				!uniqueBatchRows.has(row.source_id)
			) {
				uniqueBatchRows.set(row.source_id, row)
			}
		}
		for (const keyword of batchResult.data.search_keywords_used ?? []) {
			if (typeof keyword === 'string') keywords.add(keyword)
		}
		model = batchResult.model
		inputTokens += batchResult.input_tokens
		outputTokens += batchResult.output_tokens
		latencyMs += batchResult.latency_ms

		// Nếu model local lặp ID hoặc bỏ source, chỉ tạo bù source còn thiếu.
		for (const source of sources) {
			const sourceId = (source as any)?.id
			if (typeof sourceId !== 'string' || uniqueBatchRows.has(sourceId)) continue
			const fallback = await callAgent<{
				related_work_matrix: Array<
					{ source_id?: string } & Record<string, unknown>
				>
				search_keywords_used: string[]
			}>({
				model,
				systemPrompt: SYSTEM_PROMPT,
				userPayload: { ...context, sources: [source] },
				maxTokens: 900,
				jsonSchema: relatedWorkSchema([sourceId]),
			})
			const row = fallback.data.related_work_matrix?.find(
				(candidate) => candidate.source_id === sourceId,
			)
			if (row) uniqueBatchRows.set(sourceId, row)
			for (const keyword of fallback.data.search_keywords_used ?? []) {
				if (typeof keyword === 'string') keywords.add(keyword)
			}
			inputTokens += fallback.input_tokens
			outputTokens += fallback.output_tokens
			latencyMs += fallback.latency_ms
		}

		rows.push(...uniqueBatchRows.values())
	}

	return {
		data: {
			related_work_matrix: rows,
			search_keywords_used: Array.from(keywords),
		},
		model,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		latency_ms: latencyMs,
	}
}
