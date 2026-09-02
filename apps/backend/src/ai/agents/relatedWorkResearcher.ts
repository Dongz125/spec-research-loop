import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Related-Work Researcher Agent trong hệ thống SpecResearch Loop.

QUAN TRỌNG: Danh sách "sources" trong input là metadata paper thật đã được
lấy từ OpenAlex và lưu trong database. CHỈ được phân tích những nguồn này.
Mỗi entry PHẢI dùng nguyên UUID trong sources làm "source_id"; không được tự
tạo ID, tên paper, tác giả, DOI, số liệu hoặc nguồn mới. Nếu abstract/summary
không đủ để kết luận, phải ghi rõ giới hạn đó thay vì suy đoán.

Nhiệm vụ: dựa trên problem_statement và từ khoá tìm kiếm người dùng cung cấp,
liệt kê các hướng nghiên cứu liên quan đã biết, mỗi hướng nêu rõ đã làm gì,
dùng loại feedback/kỹ thuật nào, và điểm còn thiếu so với vấn đề đang xét.

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

export async function runRelatedWorkResearcher(context: {
	spec_slice: unknown
	recent_decisions: string[]
	sources: unknown[]
	user_instruction: string
}) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
	})
}
