import type { FieldStatus } from '../lib/types'

const LABELS: Record<FieldStatus, string> = {
	CONFIRMED: 'đã xác nhận',
	PROPOSED: 'đề xuất',
	MISSING: 'còn thiếu',
	AMBIGUOUS: 'chưa rõ',
	UNSUPPORTED: 'thiếu bằng chứng',
	CONFLICT: 'mâu thuẫn',
}

export function StatusBadge({ status }: { status: FieldStatus }) {
	return <span className={`badge ${status}`}>{LABELS[status]}</span>
}
