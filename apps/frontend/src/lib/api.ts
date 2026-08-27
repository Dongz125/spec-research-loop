const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface AuthUser {
	id: string
	email: string
	name: string | null
}

export interface AuthResult {
	token: string
	user: AuthUser
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
	const token = localStorage.getItem('specresearch_token')
	const res = await fetch(`${API_URL}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...options?.headers,
		},
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({}))
		if (res.status === 401 && token) {
			localStorage.removeItem('specresearch_token')
			localStorage.removeItem('specresearch_user_id')
			window.location.reload()
		}
		throw new Error(body.error ?? `Lỗi ${res.status}`)
	}
	return res.json()
}

export const api = {
	login: (email: string, password: string) =>
		req<AuthResult>('/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password }),
		}),

	register: (email: string, name: string, password: string) =>
		req<AuthResult>('/auth/register', {
			method: 'POST',
			body: JSON.stringify({ email, name, password }),
		}),

	getMe: () => req<AuthUser>('/auth/me'),

	updateMe: (input: {
		name?: string
		currentPassword?: string
		newPassword?: string
	}) =>
		req<AuthUser>('/auth/me', {
			method: 'PATCH',
			body: JSON.stringify(input),
		}),

	getProjects: () => req<any[]>('/projects'),

	createProject: (title: string) =>
		req<{ id: string; title: string }>('/projects', {
			method: 'POST',
			body: JSON.stringify({ title }),
		}),

	deleteProject: (projectId: string) =>
		req<{ id: string }>(`/projects/${projectId}`, {
			method: 'DELETE',
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

	getVersions: (projectId: string) => req<any[]>(`/projects/${projectId}/versions`),

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
