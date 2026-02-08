/**
 * メンバーステータスの状態遷移ユーティリティ
 *
 * 状態遷移図:
 *                     +----------+
 *                     | offline  |
 *                     +----------+
 *                           |
 *                           v
 *      +--------+  receive_task  +----------+
 *      |  idle  | ------------> |  working |
 *      +--------+               +----------+
 *           ^                        |
 *           |  send_report           | send_question
 *           |                        v
 *           |                   +----------+
 *           +-------------------| waiting  |
 *              receive_response +----------+
 *
 * 重要な変更点:
 * - working → idle は check_queue では発生しない（send_report のみ）
 * - waiting は check_queue で破壊されない
 */

import { MemberStatus } from '../types/task.js';

export type MemberStatusValue = MemberStatus['status'];

/**
 * 状態遷移イベント
 */
export type StatusTransitionEvent =
    | 'receive_task'           // タスク受信
    | 'send_report'            // レポート送信（作業完了）
    | 'send_question'          // 質問送信（応答待ち）
    | 'receive_response'       // 応答受信
    | 'kill_member'            // メンバー終了
    | 'check_queue_with_task'  // キュー確認（新タスクあり）
    | 'check_queue_empty';     // キュー確認（タスクなし）

/**
 * 状態遷移テーブル
 * キー: 現在の状態
 * 値: イベント → 次の状態 のマッピング（nullは変更なし）
 */
const TRANSITION_TABLE: Record<MemberStatusValue, Partial<Record<StatusTransitionEvent, MemberStatusValue | null>>> = {
    offline: {
        // offlineからの遷移はシステム起動時のみ（外部で処理）
        receive_task: 'working',
        check_queue_with_task: 'working',
        check_queue_empty: 'idle',
    },
    idle: {
        receive_task: 'working',
        check_queue_with_task: 'working',
        check_queue_empty: null,  // 変更なし（idleのまま）
        kill_member: 'offline',
    },
    working: {
        send_report: 'idle',
        send_question: 'waiting',
        kill_member: 'offline',
        // receive_task: null,  // 変更なし（workingのまま）
        check_queue_with_task: null,  // 変更なし（workingのまま）
        check_queue_empty: null,      // 変更なし（workingのまま）- 重要: idleに戻さない
    },
    waiting: {
        receive_response: 'working',
        receive_task: 'working',  // 新しいタスク受信で working に戻る
        kill_member: 'offline',
        check_queue_with_task: 'working',  // 新タスクがあれば working
        check_queue_empty: null,           // 変更なし（waitingのまま）- 重要: 破壊しない
    },
};

/**
 * 状態遷移を計算する
 *
 * @param currentStatus 現在のステータス
 * @param event 発生したイベント
 * @returns 次のステータス（nullの場合は変更なし）
 */
export function getNextStatus(
    currentStatus: MemberStatusValue,
    event: StatusTransitionEvent
): MemberStatusValue | null {
    const transitions = TRANSITION_TABLE[currentStatus];
    if (!transitions) {
        return null;
    }

    const nextStatus = transitions[event];
    // undefined（定義なし）の場合も null（変更なし）として扱う
    return nextStatus ?? null;
}

/**
 * 状態遷移が有効かどうかをチェック
 *
 * @param currentStatus 現在のステータス
 * @param event 発生したイベント
 * @returns 遷移が定義されていれば true
 */
export function isValidTransition(
    currentStatus: MemberStatusValue,
    event: StatusTransitionEvent
): boolean {
    const transitions = TRANSITION_TABLE[currentStatus];
    if (!transitions) {
        return false;
    }
    return event in transitions;
}

/**
 * 状態遷移テーブルを取得（テスト用）
 */
export function getTransitionTable(): typeof TRANSITION_TABLE {
    return TRANSITION_TABLE;
}
