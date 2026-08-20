import { callAgent, modelFor } from '../AiClient'

export const JUDGE_NAMES = [
	'gap_judge',
	'contribution_judge',
	'experiment_judge',
	'evidence_judge',
	'conference_readiness_judge',
] as const

export type JudgeName = (typeof JUDGE_NAMES)[number]

const JUDGE_PROMPTS: Record<JudgeName, string> = {
	gap_judge: `Bạn là Research Gap Judge. Kiểm tra research_gap có thực sự
được related_work_matrix hỗ trợ hay không, hay chỉ dựa trên suy đoán chủ quan.`,
	contribution_judge: `Bạn là Contribution Judge. Kiểm tra contribution có
mới, rõ ràng, và có bị phóng đại so với những gì gap/thí nghiệm hỗ trợ không.`,
	experiment_judge: `Bạn là Experiment Judge. Kiểm tra experimental_protocol
có đủ chặt chẽ để chứng minh claim trong claim_evidence_matrix hay không
(baseline, metric, ablation, generalization).`,
	evidence_judge: `Bạn là Evidence Judge. Kiểm tra mỗi claim trong
claim_evidence_matrix có nguồn evidence_source_ids thực sự hỗ trợ nó không,
có bị gán nguồn sai hoặc không liên quan không.`,
	conference_readiness_judge: `Bạn là Conference Readiness Judge. Đánh giá
spec theo 5 tiêu chí: originality, significance, soundness, clarity,
reproducibility. Không phán đoán khả năng được accept, chỉ đánh giá mức
độ sẵn sàng.`,
}

const OUTPUT_SCHEMA_NOTE = `
Trả về JSON theo schema:
{
  "issue": "mô tả vấn đề phát hiện được (nếu có)",
  "reasoning": "lý do, dựa trên dữ liệu được cung cấp — không suy diễn ngoài input",
  "severity": "MINOR" | "MAJOR" | "CRITICAL" | null,
  "suggestion": "đề xuất khắc phục"
}
Nếu không phát hiện vấn đề, trả "issue": null, "severity": null.`

/**
 * Mỗi judge được gọi ĐỘC LẬP — cùng nhận specSlice như nhau nhưng
 * KHÔNG thấy output của judge khác. Orchestrator gọi hàm này song song
 * (Promise.all) cho cả 5 judge rồi mới tổng hợp.
 */
export async function runJudge(judgeName: JudgeName, specSlice: unknown) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: JUDGE_PROMPTS[judgeName] + OUTPUT_SCHEMA_NOTE,
		userPayload: { spec_slice: specSlice },
		maxTokens: 700,
	})
}

export async function runAllJudges(specSlice: unknown) {
	const results = await Promise.all(
		JUDGE_NAMES.map(async (name) => ({
			judge_name: name,
			result: await runJudge(name, specSlice),
		})),
	)
	return results
}
