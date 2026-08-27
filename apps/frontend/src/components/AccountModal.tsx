import { useEffect, useState } from 'react'
import { KeyRound, LogOut, Save, User, X } from 'lucide-react'
import { api, type AuthUser } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
	open: boolean
	user: AuthUser | null
	onClose: () => void
	onUpdated: (user: AuthUser) => void
	onLogout: () => void
}

export function AccountModal({ open, user, onClose, onUpdated, onLogout }: Props) {
	const [name, setName] = useState('')
	const [currentPassword, setCurrentPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')

	useEffect(() => {
		if (!open) return
		setName(user?.name ?? '')
		setCurrentPassword('')
		setNewPassword('')
		setError('')
		setSuccess('')
	}, [open])

	if (!open || !user) return null

	async function saveProfile() {
		if (!user) return
		setSaving(true)
		setError('')
		setSuccess('')
		try {
			const updated = await api.updateMe({
				...(name.trim() !== (user.name ?? '').trim()
					? { name: name.trim() }
					: {}),
				...(newPassword
					? { currentPassword, newPassword }
					: {}),
			})
			onUpdated(updated)
			setCurrentPassword('')
			setNewPassword('')
			setSuccess('Đã cập nhật tài khoản.')
		} catch (err: any) {
			setError(err.message || 'Không thể cập nhật tài khoản')
		} finally {
			setSaving(false)
		}
	}

	const passwordInvalid =
		!!newPassword && (!currentPassword || newPassword.length < 8)
	const hasChanges =
		name.trim() !== (user.name ?? '').trim() || !!newPassword

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget && !saving) onClose()
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="account-modal-title"
				className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
			>
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
							<User className="h-5 w-5" />
						</div>
						<div>
							<h2 id="account-modal-title" className="font-semibold text-slate-900">
								Tài khoản
							</h2>
							<p className="text-sm text-slate-500">Cập nhật hồ sơ và mật khẩu</p>
						</div>
					</div>
					<button
						type="button"
						aria-label="Đóng"
						className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
						onClick={onClose}
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="mt-5 space-y-4">
					<label className="block text-sm font-medium text-slate-700">
						User ID
						<input
							readOnly
							value={user.id}
							className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
						/>
					</label>
					<label className="block text-sm font-medium text-slate-700">
						Email
						<input
							readOnly
							value={user.email}
							className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
						/>
					</label>
					<label className="block text-sm font-medium text-slate-700">
						Tên người dùng
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
						/>
					</label>

					<div className="border-t border-slate-200 pt-4">
						<p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
							<KeyRound className="h-4 w-4" /> Đổi mật khẩu
						</p>
						<div className="space-y-3">
							<input
								type="password"
								placeholder="Mật khẩu hiện tại"
								value={currentPassword}
								onChange={(event) => setCurrentPassword(event.target.value)}
								className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
							/>
							<input
								type="password"
								placeholder="Mật khẩu mới, ít nhất 8 ký tự"
								value={newPassword}
								onChange={(event) => setNewPassword(event.target.value)}
								className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
							/>
						</div>
					</div>
				</div>

				{error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
				{success && <p className="mt-3 text-sm font-medium text-emerald-600">{success}</p>}

				<div className="mt-6 flex items-center justify-between gap-3">
					<Button
						variant="ghost"
						className="text-red-600 hover:bg-red-50 hover:text-red-700"
						onClick={onLogout}
						disabled={saving}
					>
						<LogOut className="h-4 w-4" /> Đăng xuất
					</Button>
					<Button
						onClick={saveProfile}
						disabled={
							saving || !hasChanges || !name.trim() || passwordInvalid
						}
					>
						<Save className="h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
					</Button>
				</div>
			</div>
		</div>
	)
}
