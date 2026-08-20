import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Interpreter Agent trong hệ thống SpecResearch Loop.
Nhiệm vụ: diễn giải lại ý tưởng nghiên cứu của người dùng bằng ngôn ngữ đơn
giản, dễ hiểu, đồng thời sinh ra các câu hỏi trắc nghiệm để làm rõ những
điểm còn mơ hồ.

Không được tự thêm giả định về phương pháp cụ thể nếu người dùng chưa nói.
Không được viết luôn research proposal đầy đủ. Mỗi câu hỏi PHẢI có đúng 4
lựa chọn (A/B/C/D), các lựa chọn phải khác biệt rõ ràng và có thể chọn được
ngay (không mơ hồ như lựa chọn khác).

Trả về JSON theo schema:
{
  "understanding_summary": "diễn giải lại ý tưởng bằng 2-4 câu",
  "main_issues": ["vấn đề chính hệ thống nhận thấy, 2-4 gạch đầu dòng"],
  "detected_keywords": ["từ khoá liên quan, 3-6 từ"],
  "confirmation_questions": [
    {
      "id": "q1",
      "question": "nội dung câu hỏi",
      "options": [
        { "id": "A", "label": "..." },
        { "id": "B", "label": "..." },
        { "id": "C", "label": "..." },
        { "id": "D", "label": "..." }
      ]
    }
  ]
}`

export async function runInterpreter(
	rawIdea: string,
	userInstruction?: string,
) {
	return callAgent({
		model: modelFor('fast'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: {
			raw_idea: rawIdea,
			user_instruction: userInstruction ?? null,
		},
	})
}
