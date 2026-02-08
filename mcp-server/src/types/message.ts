import { Role } from './task.js';

export type MessageType = 'task' | 'report' | 'question' | 'approval_request' | 'approval_response' | 'notification';

export interface Message {
    id: string;
    type: MessageType;
    from: Role;
    to: Role;
    subject: string;
    content: string;
    timestamp: string;
    read: boolean;
    replyTo?: string;
    attachments?: MessageAttachment[];
}

export interface MessageAttachment {
    type: 'file' | 'code' | 'link';
    name: string;
    content: string;
}

export interface MessageQueue {
    role: Role;
    messages: Message[];
    lastUpdated: string;
}
