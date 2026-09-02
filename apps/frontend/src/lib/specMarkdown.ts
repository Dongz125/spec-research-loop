import type { ResearchSpec } from './types'

export const SPEC_SECTIONS: [string, string][] = [
	['problem_statement', 'Problem statement'],
	['idea_interpretation', 'Idea interpretation and decisions'],
	['search_keywords', 'Search keywords'],
	['research_questions', 'Research questions'],
	['related_work_matrix', 'Related-work matrix'],
	['gap_candidates', 'Research gaps'],
	['selected_gap_direction', 'Selected gap direction'],
	['contributions', 'Contributions'],
	['claim_evidence_matrix', 'Claim–evidence matrix'],
	['experimental_protocol', 'Experimental protocol'],
	['compute_budget', 'Compute budget'],
	['risks_and_limitations', 'Risks and limitations'],
	['open_issues', 'Open issues and decisions'],
]

function markdownValue(value: unknown) {
	if (typeof value === 'string') return value
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value.map((item) => `- ${item}`).join('\n')
	}
	return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

export function specToMarkdown(spec: ResearchSpec) {
	let markdown = '# Research Specification\n\n'
	for (const [key, label] of SPEC_SECTIONS) {
		const field = spec[key]
		markdown += `## ${label}\n\n`
		if (!field?.value) {
			markdown += '_Chưa có dữ liệu_\n\n'
			continue
		}
		markdown += `_Status: ${field.status}_\n\n`
		markdown += `${markdownValue(field.value)}\n\n`
	}

	const relatedWork = spec.related_work_matrix?.value
	if (Array.isArray(relatedWork)) {
		const references = relatedWork.filter(
			(source: any) => source?.source_id && source?.citation && source?.url,
		)
		markdown += '## References\n\n'
		if (references.length === 0) {
			markdown += '_Chưa có citation đã xác minh_\n\n'
		} else {
			for (const source of references) {
				markdown += `- ${source.citation}\n`
			}
			markdown += '\n'
		}
	}
	return markdown
}

export function downloadText(filename: string, content: string, mime: string) {
	const blob = new Blob([content], { type: mime })
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	URL.revokeObjectURL(url)
}
