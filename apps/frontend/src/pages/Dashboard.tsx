import { useState, useEffect } from 'react'
import { api, type AuthUser } from '@/lib/api'
import {
	Sparkles,
	Plus,
	FolderOpen,
	LogOut,
	Trash2,
	AlertTriangle,
	X,
	Loader2,
	User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccountModal } from '@/components/AccountModal'

export function Dashboard({
	userId,
	user,
	onLoginSuccess,
	onUserUpdated,
	onLogout,
	onSelectProject,
}: {
	userId: string | null
	user: AuthUser | null
	onLoginSuccess: (user: AuthUser, token: string) => void
	onUserUpdated: (user: AuthUser) => void
	onLogout: () => void
	onSelectProject: (id: string) => void
}) {
	const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
	const [email, setEmail] = useState('')
	const [name, setName] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')

	const [projects, setProjects] = useState<any[]>([])
	const [loadingProjects, setLoadingProjects] = useState(false)
	const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
	const [deleteConfirmation, setDeleteConfirmation] = useState('')
	const [deleting, setDeleting] = useState(false)
	const [deleteError, setDeleteError] = useState('')
	const [accountOpen, setAccountOpen] = useState(false)

	// Fetch projects khi đã login
	useEffect(() => {
		if (userId) {
			setLoadingProjects(true)
			api.getProjects()
				.then(setProjects)
				.catch((e) => console.error(e))
				.finally(() => setLoadingProjects(false))
		}
	}, [userId])

	async function handleAuth() {
		setError('')
		try {
			if (authMode === 'login') {
				const result = await api.login(email, password)
				onLoginSuccess(result.user, result.token)
			} else {
				const result = await api.register(email, name, password)
				onLoginSuccess(result.user, result.token)
			}
		} catch (err: any) {
			setError(err.message || 'Có lỗi xảy ra')
		}
	}

	function openDeleteModal(project: any) {
		setDeleteTarget(project)
		setDeleteConfirmation('')
		setDeleteError('')
	}

	function closeDeleteModal() {
		if (deleting) return
		setDeleteTarget(null)
		setDeleteConfirmation('')
		setDeleteError('')
	}

	async function handleDeleteProject() {
		if (!deleteTarget || deleteConfirmation !== 'delete this project') return
		setDeleting(true)
		setDeleteError('')
		try {
			await api.deleteProject(deleteTarget.id)
			setProjects((current) =>
				current.filter((project) => project.id !== deleteTarget.id),
			)
			setDeleteTarget(null)
			setDeleteConfirmation('')
		} catch (err: any) {
			setDeleteError(err.message || 'Không thể xóa dự án')
		} finally {
			setDeleting(false)
		}
	}

	// GIAO DIỆN CHƯA ĐĂNG NHẬP
	if (!userId) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50">
				<div className="p-8 bg-white rounded-xl shadow-sm border space-y-4 w-96">
					<div className="flex justify-center mb-6">
						<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
							<Sparkles className="h-6 w-6" />
						</div>
					</div>
					<h2 className="text-xl font-bold text-center text-slate-800">
						{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
					</h2>

					{error && (
						<p className="text-sm text-red-600 bg-red-50 p-2 rounded text-center">
							{error}
						</p>
					)}

					{authMode === 'register' && (
						<input
							className="w-full border p-2 rounded text-sm outline-none focus:border-indigo-500"
							placeholder="Tên của bạn..."
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					)}
					<input
						className="w-full border p-2 rounded text-sm outline-none focus:border-indigo-500"
						placeholder="Nhập email..."
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<input
						className="w-full border p-2 rounded text-sm outline-none focus:border-indigo-500"
						placeholder="Mật khẩu (ít nhất 8 ký tự)..."
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
					/>

					<Button
						className="w-full bg-indigo-600 hover:bg-indigo-700"
						onClick={handleAuth}
						disabled={!email.trim() || password.length < 8}
					>
						{authMode === 'login' ? 'Vào hệ thống' : 'Đăng ký'}
					</Button>

					<p
						className="text-xs text-center text-slate-500 mt-4 cursor-pointer hover:text-indigo-600"
						onClick={() => {
							setAuthMode(
								authMode === 'login' ? 'register' : 'login',
							)
							setError('')
						}}
					>
						{authMode === 'login'
							? 'Chưa có tài khoản? Đăng ký ngay'
							: 'Đã có tài khoản? Đăng nhập'}
					</p>
				</div>
			</div>
		)
	}

	// GIAO DIỆN DANH SÁCH DỰ ÁN
	return (
		<div className="min-h-screen bg-slate-50 p-8">
			<div className="max-w-5xl mx-auto space-y-6">
				<div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
					<h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
						<Sparkles className="h-6 w-6 text-indigo-600" />{' '}
						SpecResearch Loop
					</h1>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setAccountOpen(true)}
							disabled={!user}
						>
							<User className="h-4 w-4" /> Tài khoản
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={onLogout}
							className="text-red-600 hover:text-red-700 hover:bg-red-50"
						>
							<LogOut className="h-4 w-4 mr-2" /> Đăng xuất
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
					<div
						onClick={async () => {
							const res = await api.createProject(
								'Dự án nghiên cứu mới',
							)
							onSelectProject(res.id)
						}}
						className="flex flex-col items-center justify-center p-6 bg-white rounded-xl cursor-pointer border-dashed border-2 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400 transition-all min-h-[160px]"
					>
						<Plus className="h-8 w-8 text-indigo-500 mb-2" />
						<p className="font-medium text-indigo-700">
							Tạo dự án mới
						</p>
					</div>

					{loadingProjects ? (
						<p className="text-slate-500 text-sm col-span-2 p-6">
							Đang tải dữ liệu...
						</p>
					) : (
						projects.map((p) => (
							<div
								key={p.id}
								onClick={() => onSelectProject(p.id)}
								className="bg-white p-5 rounded-xl border border-slate-200 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between min-h-[160px]"
							>
								<div>
									<div className="flex items-start justify-between gap-3">
										<h3 className="font-semibold text-slate-800 flex items-start gap-2 line-clamp-2">
											<FolderOpen className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
											{p.title}
										</h3>
										<button
											type="button"
											aria-label={`Xóa ${p.title}`}
											className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
											onClick={(event) => {
												event.stopPropagation()
												openDeleteModal(p)
											}}
										>
											<Trash2 className="h-4 w-4" />
										</button>
									</div>
									<p className="text-xs text-slate-500 mt-2">
										Cập nhật:{' '}
										{new Date(
											p.updatedAt,
										).toLocaleDateString('vi-VN')}
									</p>
								</div>
								<div className="mt-4 pt-3 border-t border-slate-100">
									<span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md">
										Bước: {p.currentStep}
									</span>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			{deleteTarget && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
					role="presentation"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) closeDeleteModal()
					}}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="delete-project-title"
						className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
					>
						<div className="flex items-start justify-between gap-4">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
								<AlertTriangle className="h-5 w-5" />
							</div>
							<div className="flex-1">
								<h2
									id="delete-project-title"
									className="text-lg font-semibold text-slate-900"
								>
									Xóa dự án?
								</h2>
								<p className="mt-1 text-sm text-slate-500">
									Dự án <strong>{deleteTarget.title}</strong> cùng toàn bộ version,
									nguồn và đánh giá liên quan sẽ bị xóa vĩnh viễn.
								</p>
							</div>
							<button
								type="button"
								aria-label="Đóng"
								className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
								onClick={closeDeleteModal}
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<label className="mt-5 block text-sm font-medium text-slate-700">
							Nhập <span className="font-mono font-semibold text-red-600">delete this project</span> để xác nhận
						</label>
						<input
							autoFocus
							value={deleteConfirmation}
							onChange={(event) => setDeleteConfirmation(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') void handleDeleteProject()
							}}
							placeholder="delete this project"
							className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
						/>

						{deleteError && (
							<p className="mt-2 text-sm font-medium text-red-600">{deleteError}</p>
						)}

						<div className="mt-6 flex justify-end gap-2">
							<Button variant="outline" onClick={closeDeleteModal} disabled={deleting}>
								Hủy
							</Button>
							<Button
								variant="destructive"
								onClick={handleDeleteProject}
								disabled={deleteConfirmation !== 'delete this project' || deleting}
							>
								{deleting ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Trash2 className="h-4 w-4" />
								)}
								{deleting ? 'Đang xóa...' : 'Xóa dự án'}
							</Button>
						</div>
					</div>
				</div>
			)}

			<AccountModal
				open={accountOpen}
				user={user}
				onClose={() => setAccountOpen(false)}
				onUpdated={onUserUpdated}
				onLogout={onLogout}
			/>
		</div>
	)
}
