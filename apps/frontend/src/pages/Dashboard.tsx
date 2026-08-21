import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Sparkles, Plus, FolderOpen, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Dashboard({
	userId,
	onLoginSuccess,
	onLogout,
	onSelectProject,
}: {
	userId: string | null
	onLoginSuccess: (id: string) => void
	onLogout: () => void
	onSelectProject: (id: string) => void
}) {
	const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
	const [email, setEmail] = useState('')
	const [name, setName] = useState('')
	const [error, setError] = useState('')

	const [projects, setProjects] = useState<any[]>([])
	const [loadingProjects, setLoadingProjects] = useState(false)

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
				const user = await api.login(email)
				onLoginSuccess(user.id)
			} else {
				const user = await api.register(email, name)
				onLoginSuccess(user.id)
			}
		} catch (err: any) {
			setError(err.message || 'Có lỗi xảy ra')
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
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>

					<Button
						className="w-full bg-indigo-600 hover:bg-indigo-700"
						onClick={handleAuth}
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
					<Button
						variant="ghost"
						size="sm"
						onClick={onLogout}
						className="text-red-600 hover:text-red-700 hover:bg-red-50"
					>
						<LogOut className="h-4 w-4 mr-2" /> Đăng xuất
					</Button>
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
									<h3 className="font-semibold text-slate-800 flex items-start gap-2 line-clamp-2">
										<FolderOpen className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
										{p.title}
									</h3>
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
		</div>
	)
}
