import { Role } from './task.js';

export type MemoryType = 'decision' | 'note';

export interface MemoryEntry {
    id: string;
    timestamp: string;
    role: Role;           // 記録者（pm, leader, member-01等）
    type: MemoryType;
    title: string;
    content: string;
    tags?: string[];
}

export type ProjectContextSection =
    | 'what'
    | 'why'
    | 'who'
    | 'constraints'
    | 'current_state'
    | 'decisions'
    | 'notes'
    | 'preferences';

export interface ProjectContext {
    what: string;
    why: string;
    who: string;
    constraints: string;
    currentState: string;
    decisions: string;
    notes: string;
    preferences: string;
    lastUpdated: string;
}

// ツールパラメータの型
export interface SaveMemoryParams {
    type: MemoryType;
    title: string;
    content: string;
    tags?: string[];
}

export interface RecallMemoryParams {
    query?: string;
    type?: MemoryType;
    tags?: string[];
    limit?: number;
}

export interface UpdateProjectContextParams {
    section: ProjectContextSection;
    content: string;
    append?: boolean;
}

export interface GetProjectContextParams {
    section?: ProjectContextSection;
}
