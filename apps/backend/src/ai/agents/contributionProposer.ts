import { callAgent, modelFor } from '../AiClient'

const CONTRIBUTION_PROMPT = `Bạn là Contribution Agent trong SpecResearch Loop.
Dựa trên research gap đã chọn, đề xuất 2-3 đóng góp nghiên cứu cụ thể, mới và
có thể kiểm chứng. Không phóng đại và không thêm phương pháp ngoài context.
Mỗi đóng góp tối đa 2 câu ngắn. Chỉ trả JSON theo schema.`

const CLAIM_PROMPT = `Bạn là Claim-Evidence Agent trong SpecResearch Loop.
Dựa trên research gap, contributions và related_work_matrix được cung cấp,
tạo bảng claim-evidence súc tích. Mỗi claim phải có baseline, metric, bằng
chứng cần thu thập và điều kiện bác bỏ rõ ràng.

Mỗi claim PHẢI liên kết ít nhất một evidence_source_ids lấy nguyên từ
related_work_matrix. Source ID chỉ hỗ trợ bối cảnh/baseline; không được mô tả
kết quả thí nghiệm tương lai như bằng chứng đã tồn tại. Không tạo ID hay nguồn mới.
Chỉ trả JSON theo schema.`

const CONTRIBUTION_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['contributions'],
	properties: {
		contributions: {
			type: 'array',
			minItems: 2,
			maxItems: 3,
			items: { type: 'string', maxLength: 420 },
		},
	},
} as const

function claimSchema(sourceIds: string[]) {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['claim_evidence_matrix'],
		properties: {
			claim_evidence_matrix: {
				type: 'array',
				minItems: 2,
				maxItems: 4,
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'claim',
						'baseline',
						'metric',
						'evidence',
						'rejection_condition',
						'evidence_source_ids',
					],
					properties: {
						claim: { type: 'string', maxLength: 420 },
						baseline: { type: 'string', maxLength: 280 },
						metric: { type: 'string', maxLength: 220 },
						evidence: { type: 'string', maxLength: 420 },
						rejection_condition: { type: 'string', maxLength: 320 },
						evidence_source_ids: {
							type: 'array',
							minItems: 1,
							maxItems: 3,
							items: { type: 'string', enum: sourceIds },
						},
					},
				},
			},
		},
	} as const
}

export async function runContributionProposer(context: any) {
	const relatedRows = context?.spec_slice?.related_work_matrix?.value
	const sourceIds = Array.from(
		new Set<string>(
			(Array.isArray(relatedRows) ? relatedRows : [])
				.map((row: any) => row?.source_id)
				.filter((id: unknown): id is string => typeof id === 'string'),
		),
	)
	if (sourceIds.length === 0) {
		throw new Error('Không có source_id hợp lệ để tạo Claim-Evidence Matrix.')
	}

	const model = modelFor('reasoning')
	const contributionResult = await callAgent<{ contributions: string[] }>({
		model,
		systemPrompt: CONTRIBUTION_PROMPT,
		userPayload: context,
		maxTokens: 900,
		jsonSchema: CONTRIBUTION_SCHEMA,
	})

	const claimResult = await callAgent<{
		claim_evidence_matrix: Array<Record<string, unknown>>
	}>({
		model,
		systemPrompt: CLAIM_PROMPT,
		userPayload: {
			...context,
			proposed_contributions: contributionResult.data.contributions,
		},
		maxTokens: 2600,
		jsonSchema: claimSchema(sourceIds),
	})

	return {
		data: {
			contributions: contributionResult.data.contributions,
			claim_evidence_matrix: claimResult.data.claim_evidence_matrix,
		},
		model: claimResult.model,
		input_tokens: contributionResult.input_tokens + claimResult.input_tokens,
		output_tokens: contributionResult.output_tokens + claimResult.output_tokens,
		latency_ms: contributionResult.latency_ms + claimResult.latency_ms,
	}
}
