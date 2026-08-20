import { callAgent, modelFor } from '../AiClient'

const SYSTEM_PROMPT = `Bạn là Experiment Designer Agent.
Nhiệm vụ: Thiết kế kế hoạch thí nghiệm (Experimental Protocol) chi tiết từng bước để chứng minh các claim trong claim_evidence_matrix.

Trả về JSON theo schema:
{
  "experimental_protocol": [
    {
      "name": "Tên thí nghiệm (VD: So sánh baseline)",
      "goal": "Mục tiêu cụ thể của thí nghiệm này",
      "config": { "dataset": "...", "metrics": "..." }
    }
  ]
}`

export async function runExperimentDesigner(context: any) {
	return callAgent({
		model: modelFor('reasoning'),
		systemPrompt: SYSTEM_PROMPT,
		userPayload: context,
		maxTokens: 1500,
	})
}
