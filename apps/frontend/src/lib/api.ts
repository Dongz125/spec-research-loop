const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${API_URL}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...options,
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({}))
		throw new Error(body.error ?? `Lỗi ${res.status}`)
	}
	return res.json()
}

export const api = {
	createProject: (title: string) =>
		req<{ id: string; title: string }>('/projects', {
			method: 'POST',
			body: JSON.stringify({ title }),
		}),

	getProject: (projectId: string) =>
		req<{ project: any; latest_spec: any }>(`/projects/${projectId}`),

	generate: (projectId: string, step: string, instruction: string) =>
		req<{ preview: unknown; based_on_version: number }>(
			`/projects/${projectId}/steps/${step}/generate`,
			{ method: 'POST', body: JSON.stringify({ instruction }) },
		),

	confirm: (
		projectId: string,
		step: string,
		updatedFields: Record<string, unknown>,
		changeSummary: string,
	) =>
		req<{ version: { id: string; version_number: number } }>(
			`/projects/${projectId}/steps/${step}/confirm`,
			{
				method: 'POST',
				body: JSON.stringify({ updatedFields, changeSummary }),
			},
		),

	getVersions: (projectId: string) =>
		req<any[]>(`/projects/${projectId}/versions`),

	rollback: (projectId: string, versionNumber: number) =>
		req<{ restored_step: string; data: unknown }>(
			`/projects/${projectId}/versions/${versionNumber}/rollback`,
			{ method: 'POST' },
		),

	runJudge: (projectId: string) =>
		req<{ spec_version_id: string; reviews: any[] }>(
			`/projects/${projectId}/judge`,
			{ method: 'POST' },
		),
}
