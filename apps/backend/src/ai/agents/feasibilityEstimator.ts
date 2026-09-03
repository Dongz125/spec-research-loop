import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Feasibility Estimator Agent.
Nhiệm vụ: Đánh giá và ước lượng tài nguyên tính toán (Compute Budget) dựa trên thiết kế thí nghiệm và giới hạn người dùng cung cấp.

Phải tách rõ quy mô thí nghiệm và tài nguyên cần thiết. Nếu input thiếu một tham số, hãy đưa ra giả định hợp lý, ghi giả định đó trong "assumptions" và không giả vờ đây là con số chắc chắn. "model" là model được dùng trong thí nghiệm, không phải model AI đang tạo câu trả lời.

Trả về JSON theo schema:
{
  "compute_budget": {
    "model": "Tên/cỡ model đề xuất (VD: 7B-8B, 4-bit)",
    "hardware_target": "Phần cứng mục tiêu (VD: RTX 3090 24 GB)",
    "prompt_count": 5,
    "candidates_per_prompt": 10,
    "optimization_rounds": 10,
    "development_set_size": 50,
    "validation_set_size": 300,
    "top_k": 5,
    "vram_estimate_gb": 20,
    "time_estimate_hours": "12-18",
    "token_estimate": "3-6 triệu token",
    "api_cost_estimate": "Tùy chọn; khoảng 5 USD nếu dùng API X",
    "is_feasible": true,
    "warning": "Cảnh báo ngắn nếu sát/vượt giới hạn, hoặc null nếu an toàn",
    "assumptions": ["Các giả định được dùng để tính toán"]
  },
  "risks_and_limitations": [
    "3-6 rủi ro hoặc giới hạn cụ thể của phương pháp, dữ liệu, đánh giá hay tài nguyên"
  ],
  "open_issues": [
    "1-5 quyết định hoặc vấn đề còn mở cần người dùng giải quyết trước khi triển khai"
  ]
}

Không để thiếu risks_and_limitations hoặc open_issues. Không lặp lại cùng một ý ở hai danh sách.`

export async function runFeasibilityEstimator(context: any) {
	return callAgent({
		model: modelFor('fast'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 1600,
	})
}
