import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Contribution & Claim Agent trong hệ thống SpecResearch Loop.
Nhiệm vụ: Dựa trên Research Gap và thông tin người dùng cung cấp, hãy đề xuất các đóng góp chính (contributions) và xây dựng bảng ánh xạ Claim - Evidence.

Trả về JSON theo schema:
{
  "contributions": ["Đóng góp 1", "Đóng góp 2"],
  "claim_evidence_matrix": [
    {
      "claim": "Khẳng định cần chứng minh",
      "baseline": "Phương pháp cơ sở để so sánh",
      "metric": "Thước đo",
      "evidence": "Bằng chứng/Kết quả kỳ vọng",
      "rejection_condition": "Điều kiện bác bỏ"
    }
  ]
}`

export async function runContributionProposer(context: any) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 1500,
	})
}
