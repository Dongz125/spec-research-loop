export interface ScholarlySource {
	id: string
	title: string
	authors: string
	year: number | null
	venue: string
	url: string
	doi: string | null
	summary: string
	workType: string
	citedByCount: number
	citation: string
}

interface OpenAlexWork {
	id?: string
	display_name?: string
	publication_year?: number
	doi?: string
	type?: string
	cited_by_count?: number
	authorships?: Array<{ author?: { display_name?: string } }>
	primary_location?: {
		landing_page_url?: string
		source?: { display_name?: string }
	}
	abstract_inverted_index?: Record<string, number[]>
}

function reconstructAbstract(index?: Record<string, number[]>) {
	if (!index) return ''
	const words: Array<[number, string]> = []
	for (const [word, positions] of Object.entries(index)) {
		for (const position of positions) words.push([position, word])
	}
	return words
		.sort((a, b) => a[0] - b[0])
		.map(([, word]) => word)
		.join(' ')
		.slice(0, 5000)
}

export function normalizeDoi(value?: string | null) {
	if (!value) return null
	const doi = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim()
	return doi ? `https://doi.org/${doi}` : null
}

export function formatCitation(source: {
	authors?: string | null
	year?: number | null
	title: string
	venue?: string | null
	doi?: string | null
	url?: string | null
}) {
	const authors = source.authors?.trim() || 'Unknown author'
	const year = source.year ?? 'n.d.'
	const venue = source.venue?.trim() ? ` ${source.venue.trim()}.` : ''
	const locator = source.doi || source.url
	return `${authors} (${year}). ${source.title}.${venue}${locator ? ` ${locator}` : ''}`
}

export async function searchOpenAlex(query: string, limit = 8) {
	const params = new URLSearchParams({
		search: query,
		per_page: String(Math.min(Math.max(limit, 1), 20)),
		select:
			'id,display_name,publication_year,doi,type,cited_by_count,authorships,primary_location,abstract_inverted_index',
	})
	if (process.env.OPENALEX_API_KEY) {
		params.set('api_key', process.env.OPENALEX_API_KEY)
	}

	const response = await fetch(`https://api.openalex.org/works?${params}`, {
		signal: AbortSignal.timeout(20_000),
		headers: {
			Accept: 'application/json',
			'User-Agent': `SpecResearchLoop/1.0 (${process.env.OPENALEX_EMAIL || 'contact-not-configured'})`,
		},
	})
	const payload = (await response.json().catch(() => ({}))) as {
		error?: string
		message?: string
		results?: OpenAlexWork[]
	}
	if (!response.ok) {
		throw new Error(
			`OpenAlex không phản hồi (${response.status}): ${payload.message || payload.error || 'Không rõ lỗi'}`,
		)
	}

	return (payload.results ?? [])
		.map((work): Omit<ScholarlySource, 'id'> | null => {
			const title = work.display_name?.trim()
			if (!title) return null
			const doi = normalizeDoi(work.doi)
			const url =
				doi || work.primary_location?.landing_page_url || work.id || ''
			if (!url) return null
			const authors = (work.authorships ?? [])
				.map((item) => item.author?.display_name?.trim())
				.filter(Boolean)
				.slice(0, 12)
				.join(', ')
			const source = {
				title,
				authors,
				year: work.publication_year ?? null,
				venue: work.primary_location?.source?.display_name?.trim() || '',
				url,
				doi,
				summary: reconstructAbstract(work.abstract_inverted_index),
				workType: work.type || 'work',
				citedByCount: work.cited_by_count ?? 0,
			}
			return { ...source, citation: formatCitation(source) }
		})
		.filter((source): source is Omit<ScholarlySource, 'id'> => source !== null)
}
