import { describe, it, expect } from '@jest/globals';
import { validateRequiredString, validateRequiredArray, validateEnumValue } from '../utils/validation.js';
import { validateLeaderOnly, validateMemberOnly } from '../utils/permission.js';

describe('validation', () => {
    describe('validateRequiredString', () => {
        it('should return invalid for null value', () => {
            const result = validateRequiredString(null, 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for undefined value', () => {
            const result = validateRequiredString(undefined, 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for non-string value (number)', () => {
            const result = validateRequiredString(123, 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for non-string value (object)', () => {
            const result = validateRequiredString({ foo: 'bar' }, 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for empty string', () => {
            const result = validateRequiredString('', 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for whitespace-only string', () => {
            const result = validateRequiredString('   ', 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for string with only tabs and newlines', () => {
            const result = validateRequiredString('\t\n\r', 'testField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return valid for normal string', () => {
            const result = validateRequiredString('hello', 'testField');

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return valid for string with leading/trailing whitespace', () => {
            const result = validateRequiredString('  hello  ', 'testField');

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return valid for Japanese text', () => {
            const result = validateRequiredString('テスト', 'testField');

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should include field name in error message', () => {
            const result = validateRequiredString(null, 'mySpecialField');

            expect(result.valid).toBe(false);
            expect(result.error).toContain('mySpecialField');
        });

        it('should return valid for single character', () => {
            const result = validateRequiredString('a', 'testField');

            expect(result.valid).toBe(true);
        });
    });

    describe('validateRequiredArray', () => {
        it('should return invalid for non-array value', () => {
            const result = validateRequiredArray('not-array', 'testField');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('testField');
        });

        it('should return invalid for null', () => {
            const result = validateRequiredArray(null, 'testField');
            expect(result.valid).toBe(false);
        });

        it('should return invalid for undefined', () => {
            const result = validateRequiredArray(undefined, 'testField');
            expect(result.valid).toBe(false);
        });

        it('should return invalid for empty array (default minLength=1)', () => {
            const result = validateRequiredArray([], 'testField');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('1つ以上');
        });

        it('should return valid for non-empty array', () => {
            const result = validateRequiredArray(['a'], 'testField');
            expect(result.valid).toBe(true);
        });

        it('should return invalid when below custom minLength', () => {
            const result = validateRequiredArray(['a'], 'testField', 2);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('2つ以上');
        });

        it('should return valid when meeting custom minLength', () => {
            const result = validateRequiredArray(['a', 'b', 'c'], 'testField', 3);
            expect(result.valid).toBe(true);
        });

        it('should return valid for array with minLength=0', () => {
            const result = validateRequiredArray([], 'testField', 0);
            expect(result.valid).toBe(true);
        });
    });

    describe('validateEnumValue', () => {
        const allowed = ['apple', 'banana', 'cherry'] as const;

        it('should return valid for allowed value', () => {
            const result = validateEnumValue('apple', allowed, 'fruit');
            expect(result.valid).toBe(true);
        });

        it('should return invalid for non-allowed value', () => {
            const result = validateEnumValue('grape', allowed, 'fruit');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('apple');
            expect(result.error).toContain('banana');
            expect(result.error).toContain('cherry');
        });

        it('should return invalid for non-string value', () => {
            const result = validateEnumValue(123, allowed, 'fruit');
            expect(result.valid).toBe(false);
        });

        it('should return invalid for null', () => {
            const result = validateEnumValue(null, allowed, 'fruit');
            expect(result.valid).toBe(false);
        });

        it('should return invalid for undefined', () => {
            const result = validateEnumValue(undefined, allowed, 'fruit');
            expect(result.valid).toBe(false);
        });

        it('should include field name in error message', () => {
            const result = validateEnumValue('grape', allowed, 'myFruit');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('myFruit');
        });
    });

    describe('validateLeaderOnly', () => {
        it('should allow leader role', () => {
            const result = validateLeaderOnly('leader', 'test_tool');
            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should reject pm role', () => {
            const result = validateLeaderOnly('pm', 'test_tool');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('test_tool');
            expect(result.reason).toContain('leader');
        });

        it('should reject member role', () => {
            const result = validateLeaderOnly('member-01', 'approve_plan');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('approve_plan');
        });
    });

    describe('validateMemberOnly', () => {
        it('should allow member-01 role', () => {
            const result = validateMemberOnly('member-01', 'test_tool');
            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should allow member-02 role', () => {
            const result = validateMemberOnly('member-02', 'test_tool');
            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should reject leader role', () => {
            const result = validateMemberOnly('leader', 'submit_plan');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('submit_plan');
            expect(result.reason).toContain('member');
        });

        it('should reject pm role', () => {
            const result = validateMemberOnly('pm', 'submit_test');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('submit_test');
        });
    });
});
