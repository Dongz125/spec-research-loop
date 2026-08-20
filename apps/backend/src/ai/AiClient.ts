import type { AgentResult } from '../types'

/**
 * NƠI DUY NHẤT gọi model AI trong toàn hệ thống. Mọi agent (interpreter,
 * gapProposer, judges...) đều đi qua callAgent() ở đây — nên đổi provider
 * (trả phí <-> miễn phí) chỉ cần sửa file này, không đụng vào agent nào cả.
 *
 * Đặt AI_PROVIDER trong .env: "anthropic" | "gemini" | "ollama"
 *   - anthropic: trả phí theo token (có $5 credit dùng thử cho tài khoản mới)
 *   - gemini:    Google AI Studio, có free tier vĩnh viễn, không cần thẻ
 *   - ollama:    chạy model local trên máy bạn, 100% miễn phí, không cần mạng
 */
const PROVIDER = process.env.AI_PROVIDER ?? 'anthropic'

export const MODELS = {
	anthropic: {
		fast: 'claude-haiku-4-5-20251001',
		reasoning: 'claude-sonnet-5',
	},
	gemini: { fast: 'gemini-3.6-flash', reasoning: 'gemini-3.6-flash' },
	ollama: { fast: 'llama3.1:8b', reasoning: 'llama3.1:8b' },
} as const

interface CallOptions {
	model: string
	systemPrompt: string
	userPayload: unknown
	maxTokens?: number
}

function parseJson<T>(raw: string): T {
	return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

async function callAnthropic(opts: CallOptions) {
	const Anthropic = (await import('@anthropic-ai/sdk')).default
	const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
	const res = await client.messages.create({
		model: opts.model,
		max_tokens: opts.maxTokens ?? 2000,
		system:
			opts.systemPrompt +
			'\n\nTrả lời CHỈ bằng JSON hợp lệ, không thêm gì khác.',
		messages: [{ role: 'user', content: JSON.stringify(opts.userPayload) }],
	})
	const block = res.content.find((b) => b.type === 'text')
	const text = block && 'text' in block ? block.text : '{}'
	return {
		text,
		input_tokens: res.usage.input_tokens,
		output_tokens: res.usage.output_tokens,
	}
}

// Google AI Studio (Gemini) — free tier, không cần thẻ tín dụng.
// Lấy key tại https://aistudio.google.com/apikey
async function callGemini(opts: CallOptions) {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${process.env.GEMINI_API_KEY}`
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			system_instruction: {
				parts: [
					{
						text:
							opts.systemPrompt +
							'\n\nTrả lời CHỈ bằng JSON hợp lệ.',
					},
				],
			},
			contents: [{ parts: [{ text: JSON.stringify(opts.userPayload) }] }],
			generationConfig: {
				maxOutputTokens: opts.maxTokens ?? 4000,
				responseMimeType: 'application/json',
			},
		}),
	})
	const json = await res.json()
	if (!res.ok) throw new Error(`Gemini error: ${JSON.stringify(json)}`)
	const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
	return {
		text,
		input_tokens: json.usageMetadata?.promptTokenCount ?? 0,
		output_tokens: json.usageMetadata?.candidatesTokenCount ?? 0,
	}
}

// Ollama chạy local — https://ollama.com, cài rồi `ollama pull llama3.1:8b`
async function callOllama(opts: CallOptions) {
	const url = `${process.env.OLLAMA_HOST ?? 'http://localhost:11434'}/api/chat`
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: opts.model,
			format: 'json',
			stream: false,
			messages: [
				{ role: 'system', content: opts.systemPrompt },
				{ role: 'user', content: JSON.stringify(opts.userPayload) },
			],
		}),
	})
	const json = await res.json()
	if (!res.ok) throw new Error(`Ollama error: ${JSON.stringify(json)}`)
	return {
		text: json.message?.content ?? '{}',
		input_tokens: json.prompt_eval_count ?? 0,
		output_tokens: json.eval_count ?? 0,
	}
}

export async function callAgent<T = unknown>(
	opts: CallOptions,
): Promise<AgentResult<T>> {
	const started = Date.now()

	let raw: { text: string; input_tokens: number; output_tokens: number }
	if (PROVIDER === 'gemini') raw = await callGemini(opts)
	else if (PROVIDER === 'ollama') raw = await callOllama(opts)
	else raw = await callAnthropic(opts)

	let data: T
	try {
		data = parseJson<T>(raw.text)
	} catch (error) {
		console.error(
			`Lỗi Parse JSON từ ${PROVIDER}. Output thô:`,
			raw.text.slice(0, 500),
		)
		throw new Error(
			`Đã xảy ra lỗi khi tạo gợi ý. Dữ liệu trả về bị thiếu hoặc quá dài. Vui lòng thử lại.`,
		)
	}

	return {
		data,
		model: opts.model,
		input_tokens: raw.input_tokens,
		output_tokens: raw.output_tokens,
		latency_ms: Date.now() - started,
	}
}

export function modelFor(kind: 'fast' | 'reasoning') {
	return MODELS[PROVIDER as keyof typeof MODELS][kind]
}
