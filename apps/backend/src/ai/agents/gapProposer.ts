import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Gap Proposer Agent trong hệ thống SpecResearch Loop.

QUY TẮC BẮT BUỘC: KHÔNG được tạo gap theo kiểu "tôi chưa thấy paper giống hệt
nên đây là gap". Mọi gap candidate PHẢI:
  1. Nêu rõ nghiên cứu trước đã làm được gì (dựa trên related_work_matrix
     được cung cấp — không được bịa nguồn không có trong input).
  2. Nêu rõ điểm còn hạn chế và vì sao hạn chế đó quan trọng.
  3. Gợi ý ít nhất 1 cách kiểm nghiệm bằng thí nghiệm.

"evidence_source_ids" phải chứa ít nhất một UUID source_id lấy nguyên từ
related_work_matrix. Không được tự tạo ID, DOI hoặc paper mới.

Nếu related_work_matrix trong input rỗng hoặc quá ít, PHẢI trả về
"insufficient_evidence": true thay vì tự bịa gap.

Trả về JSON theo schema:
{
  "gap_candidates": [
    { "id": "g1", "text": "...", "evidence_source_ids": ["UUID có thật"] }
  ],
  "options_for_user": [
    { "id": "A", "label": "...", "explanation": "...", "example": "..." }
  ],
  "insufficient_evidence": false
}`

const GAP_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['gap_candidates', 'options_for_user', 'insufficient_evidence'],
	properties: {
		gap_candidates: {
			type: 'array',
			minItems: 1,
			maxItems: 3,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'text', 'evidence_source_ids'],
				properties: {
					id: { type: 'string', maxLength: 20 },
					text: { type: 'string', maxLength: 700 },
					evidence_source_ids: {
						type: 'array',
						minItems: 1,
						maxItems: 4,
						items: { type: 'string', maxLength: 64 },
					},
				},
			},
		},
		options_for_user: {
			type: 'array',
			minItems: 1,
			maxItems: 3,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'label', 'explanation', 'example'],
				properties: {
					id: { type: 'string', maxLength: 10 },
					label: { type: 'string', maxLength: 160 },
					explanation: { type: 'string', maxLength: 360 },
					example: { type: 'string', maxLength: 280 },
				},
			},
		},
		insufficient_evidence: { type: 'boolean' },
	},
} as const

export async function runGapProposer(context: {
	spec_slice: unknown
	recent_decisions: string[]
	sources: unknown[]
	user_instruction: string
}) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 2400,
		jsonSchema: GAP_SCHEMA,
	})
}
