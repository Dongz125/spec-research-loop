import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Judge Resolution Agent trong SpecResearch Loop.

Nhiệm vụ: nhận một phương án sửa do người dùng chọn cùng các nhận xét của các
Judge, sau đó sửa trực tiếp những field liên quan trong spec hiện tại.

Quy tắc:
- Chỉ trả về các field thật sự cần thay đổi; tối đa 3 field mỗi lần.
- Giữ nguyên cấu trúc dữ liệu hiện có của từng field.
- Không tạo paper, DOI, URL hay source_id mới.
- Mọi evidence_source_ids phải lấy nguyên từ related_work_matrix.
- Không xóa bằng chứng hợp lệ chỉ để làm Judge hài lòng.
- Không trả Markdown hoặc giải thích ngoài JSON.

Các field được phép sửa:
- gap_candidates
- selected_gap_direction
- contributions
- claim_evidence_matrix
- experimental_protocol
- compute_budget
- risks_and_limitations
- open_issues

Trả về JSON:
{
  "change_summary": "Mô tả ngắn những gì đã sửa",
  "updated_fields": {
    "tên_field": "giá trị mới, giữ đúng kiểu dữ liệu của field trong spec"
  }
}

updated_fields phải có ít nhất một field. Không bọc giá trị bằng value/status.`

const OUTPUT_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	properties: {
		change_summary: { type: 'string', maxLength: 500 },
		updated_fields: {
			type: 'object',
			minProperties: 1,
			additionalProperties: true,
		},
	},
	required: ['change_summary', 'updated_fields'],
}

export async function runJudgeResolutionProposer(context: any) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 2600,
		jsonSchema: OUTPUT_SCHEMA,
	})
}
