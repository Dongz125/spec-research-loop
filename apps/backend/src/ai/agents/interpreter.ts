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
  "research_questions": ["2-4 câu hỏi nghiên cứu cụ thể, có thể kiểm chứng và bám sát ý tưởng"],
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

const STRING_LIST_SCHEMA = {
	type: 'array',
	items: { type: 'string' },
	minItems: 1,
} as const

const INTERPRETER_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: [
		'understanding_summary',
		'main_issues',
		'detected_keywords',
		'research_questions',
		'confirmation_questions',
	],
	properties: {
		understanding_summary: { type: 'string' },
		main_issues: { ...STRING_LIST_SCHEMA, maxItems: 4 },
		detected_keywords: { ...STRING_LIST_SCHEMA, maxItems: 6 },
		research_questions: { ...STRING_LIST_SCHEMA, minItems: 2, maxItems: 4 },
		confirmation_questions: {
			type: 'array',
			minItems: 1,
			maxItems: 4,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'question', 'options'],
				properties: {
					id: { type: 'string' },
					question: { type: 'string' },
					options: {
						type: 'array',
						minItems: 4,
						maxItems: 4,
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['id', 'label'],
							properties: {
								id: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
								label: { type: 'string' },
							},
						},
					},
				},
			},
		},
	},
} as const

const RESEARCH_QUESTIONS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['research_questions'],
	properties: {
		research_questions: { ...STRING_LIST_SCHEMA, minItems: 2, maxItems: 4 },
	},
} as const

export async function runInterpreter(
	rawIdea: string,
	userInstruction?: string,
) {
	const result = await callAgent<Record<string, any>>({
		model: modelFor('fast'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: {
			raw_idea: rawIdea,
			user_instruction: userInstruction ?? null,
		},
		maxTokens: 2200,
		jsonSchema: INTERPRETER_SCHEMA,
	})

	if (
		Array.isArray(result.data.research_questions) &&
		result.data.research_questions.length > 0
	) {
		return result
	}

	// Một số model local vẫn có thể bỏ sót field dù đã nhận schema. Chỉ gọi
	// bổ sung phần còn thiếu thay vì bắt người dùng chạy lại toàn bộ bước 1.
	const questionsResult = await callAgent<{ research_questions: string[] }>({
		model: modelFor('fast'),
		systemPrompt:
			'Bạn là Research Question Agent. Tạo 2-4 câu hỏi nghiên cứu cụ thể, có thể kiểm chứng, không thêm giả định ngoài ý tưởng và phần diễn giải đã cung cấp.',
		userPayload: {
			raw_idea: rawIdea,
			understanding_summary: result.data.understanding_summary,
			main_issues: result.data.main_issues,
		},
		maxTokens: 500,
		jsonSchema: RESEARCH_QUESTIONS_SCHEMA,
	})

	return {
		...result,
		data: {
			...result.data,
			research_questions: questionsResult.data.research_questions,
		},
		input_tokens: result.input_tokens + questionsResult.input_tokens,
		output_tokens: result.output_tokens + questionsResult.output_tokens,
		latency_ms: result.latency_ms + questionsResult.latency_ms,
	}
}
