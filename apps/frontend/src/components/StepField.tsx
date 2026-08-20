import { useState } from 'react'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'
import type { FieldStatus } from '../lib/types'

interface Props {
	projectId: string
	step: string // step_id gửi cho backend, vd "gap"
	fieldKey: string // key trong ResearchSpec, vd "gap_candidates"
	label: string
	placeholder: string
	currentValue: unknown
	currentStatus?: FieldStatus
	onConfirmed: (updatedValue: unknown) => void
}

/**
 * Mỗi lần bấm "Tạo gợi ý", request gửi đi CHỈ gồm: step + instruction hiện
 * tại. KHÔNG có lịch sử các lần generate trước được gửi kèm — đúng cơ chế
 * "stateless call" đã thiết kế ở backend (xem contextBuilder.ts).
 */
export function StepField({
	projectId,
	step,
	fieldKey,
	label,
	placeholder,
	currentValue,
	currentStatus,
	onConfirmed,
}: Props) {
	const [instruction, setInstruction] = useState('')
	const [preview, setPreview] = useState<unknown | null>(null)
	const [editedJson, setEditedJson] = useState('')
	const [loading, setLoading] = useState(false)
	const [confirming, setConfirming] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleGenerate() {
		setLoading(true)
		setError(null)
		try {
			const res = await api.generate(projectId, step, instruction)
			setPreview(res.preview)
			setEditedJson(JSON.stringify(res.preview, null, 2))
		} catch (e: any) {
			setError(e.message)
		} finally {
			setLoading(false)
		}
	}

	async function handleConfirm() {
		setConfirming(true)
		setError(null)
		try {
			const parsed = JSON.parse(editedJson)
			const value = { value: parsed, status: 'CONFIRMED', source: 'user' }
			await api.confirm(
				projectId,
				step,
				{ [fieldKey]: value },
				instruction || `Cập nhật ${label}`,
			)
			onConfirmed(parsed)
			setPreview(null)
			setInstruction('')
		} catch (e: any) {
			setError(
				e.message ??
					'JSON không hợp lệ, kiểm tra lại trước khi xác nhận',
			)
		} finally {
			setConfirming(false)
		}
	}

	return (
		<div className="field-block">
			<div
				className="field-block-label"
				style={{ display: 'flex', justifyContent: 'space-between' }}
			>
				<span>{label}</span>
				{currentStatus && <StatusBadge status={currentStatus} />}
			</div>

			<div className="current-value">
				{currentValue
					? JSON.stringify(currentValue, null, 2)
					: 'Chưa có dữ liệu — nhập yêu cầu bên dưới rồi bấm Tạo gợi ý.'}
			</div>

			<div className="prompt-row">
				<textarea
					className="prompt-input"
					rows={2}
					placeholder={placeholder}
					value={instruction}
					onChange={(e) => setInstruction(e.target.value)}
				/>
				<button
					className="btn"
					onClick={handleGenerate}
					disabled={loading}
				>
					{loading ? 'Đang tạo...' : 'Tạo gợi ý'}
				</button>
			</div>

			{preview !== null && (
				<div className="preview-box">
					<div className="preview-label">
						Gợi ý mới — chỉnh sửa trực tiếp trước khi xác nhận
					</div>
					<textarea
						className="json-input"
						value={editedJson}
						onChange={(e) => setEditedJson(e.target.value)}
					/>
					<div className="preview-actions">
						<button
							className="btn primary"
							onClick={handleConfirm}
							disabled={confirming}
						>
							{confirming
								? 'Đang lưu...'
								: 'Xác nhận & lưu version mới'}
						</button>
						<button
							className="btn ghost"
							onClick={() => setPreview(null)}
						>
							Huỷ
						</button>
					</div>
				</div>
			)}

			{error && <div className="error-text">{error}</div>}
		</div>
	)
}
