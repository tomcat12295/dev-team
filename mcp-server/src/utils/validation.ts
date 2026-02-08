/**
 * バリデーション結果の型
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * 必須文字列のバリデーション
 * - null/undefined チェック
 * - string型チェック
 * - 空文字（trim後）チェック
 *
 * @param value - 検証する値
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @returns バリデーション結果
 */
export function validateRequiredString(value: unknown, fieldName: string): ValidationResult {
    if (value === null || value === undefined) {
        return { valid: false, error: `${fieldName} は必須です。` };
    }
    if (typeof value !== 'string') {
        return { valid: false, error: `${fieldName} は文字列である必要があります。` };
    }
    if (value.trim() === '') {
        return { valid: false, error: `${fieldName} は空にできません。` };
    }
    return { valid: true };
}

/**
 * 必須配列のバリデーション
 * - Array.isArray チェック
 * - 最小長チェック（デフォルト: 1）
 *
 * @param value - 検証する値
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @param minLength - 最小要素数（デフォルト: 1）
 * @returns バリデーション結果
 */
export function validateRequiredArray(value: unknown, fieldName: string, minLength: number = 1): ValidationResult {
    if (!Array.isArray(value)) {
        return { valid: false, error: `${fieldName} は配列である必要があります。` };
    }
    if (value.length < minLength) {
        return { valid: false, error: `${fieldName} は${minLength}つ以上必須です。` };
    }
    return { valid: true };
}

/**
 * Enum値のバリデーション
 * - 許可された値リストに含まれるかチェック
 *
 * @param value - 検証する値
 * @param allowed - 許可される値のリスト
 * @param fieldName - フィールド名（エラーメッセージ用）
 * @returns バリデーション結果
 */
export function validateEnumValue(value: unknown, allowed: readonly string[], fieldName: string): ValidationResult {
    if (typeof value !== 'string' || !allowed.includes(value)) {
        return { valid: false, error: `${fieldName} は ${allowed.join(', ')} のいずれかである必要があります。` };
    }
    return { valid: true };
}
