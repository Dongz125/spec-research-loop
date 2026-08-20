import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Feasibility Estimator Agent.
Nhiệm vụ: Đánh giá và ước lượng tài nguyên tính toán (Compute Budget) dựa trên thiết kế thí nghiệm, xem xét các giới hạn phần cứng (như VRAM) hoặc chi phí API.

Trả về JSON theo schema:
{
  "compute_budget": {
    "model": "Tên model đề xuất (VD: 7B-8B 4-bit)",
    "vram_estimate_gb": 20,
    "time_estimate_hours": 12,
    "token_or_api_cost_estimate": "Ước lượng chi phí (VD: 3-6 triệu token / 5$)"
  }
}`

export async function runFeasibilityEstimator(context: any) {
	return callAgent({
		model: modelFor('fast'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 1000,
	})
}
