/**
 * ISO 8601形式のタイムスタンプをJST形式に変換
 * @param isoString ISO 8601形式の文字列（例: "2026-01-31T08:00:00.000Z"）
 * @returns JST形式の文字列（例: "2026-01-31 17:00:00 JST"）、無効な場合は "-"
 */
export function formatTimestampJST(isoString: string | undefined): string {
    if (!isoString) {
        return '-';
    }
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) {
            return '-';
        }
        const formatter = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        const parts = formatter.formatToParts(date);
        const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
        return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} JST`;
    } catch {
        return '-';
    }
}
