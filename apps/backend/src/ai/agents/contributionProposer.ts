import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Contribution & Claim Agent trong hệ thống SpecResearch Loop.
Nhiệm vụ: Dựa trên Research Gap và thông tin người dùng cung cấp, hãy đề xuất các đóng góp chính (contributions) và xây dựng bảng ánh xạ Claim - Evidence.

Mỗi claim PHẢI liên kết ít nhất một "evidence_source_ids" lấy nguyên từ
related_work_matrix trong input. Không được tự tạo ID hoặc citation mới. Phần
"evidence" mô tả bằng chứng thực nghiệm còn phải thu thập; source IDs cho biết
những công trình nào đang hỗ trợ bối cảnh, baseline hoặc cơ sở của claim.

Trả về JSON theo schema:
{
  "contributions": ["Đóng góp 1", "Đóng góp 2"],
  "claim_evidence_matrix": [
    {
      "claim": "Khẳng định cần chứng minh",
      "baseline": "Phương pháp cơ sở để so sánh",
      "metric": "Thước đo",
      "evidence": "Bằng chứng/Kết quả kỳ vọng",
      "rejection_condition": "Điều kiện bác bỏ",
      "evidence_source_ids": ["UUID có thật trong related_work_matrix"]
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
