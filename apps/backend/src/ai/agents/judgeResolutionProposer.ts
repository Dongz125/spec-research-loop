import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Judge Resolution Agent.
Nhiệm vụ: Đọc các nhận xét lỗi (issues) từ các Judge độc lập và đề xuất 2-4 hướng giải quyết (options) khả thi nhất để người dùng lựa chọn cập nhật lại Spec.

Trả về JSON theo schema:
{
  "resolution_options": [
    { "id": "A", "label": "Thu hẹp claim (chỉ khẳng định trên tập data đã test)" },
    { "id": "B", "label": "Mở rộng thí nghiệm (thêm baseline TextGrad)" }
  ]
}`

export async function runJudgeResolutionProposer(context: any) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 1000,
	})
}
