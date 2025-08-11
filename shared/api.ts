/**
 * Shared code between client and server
 * Types and interfaces for the messenger app
 */

export interface DemoResponse {
  message: string;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface UserInfo {
  user_id: number;
  login: string;
  password: string;
  firstname: string;
  lastname: string;
}

export interface LoginResponse {
  message: string;
  user_info: UserInfo;
}

export interface Friend {
  id: number;
  login: string;
  password: string;
  firstname: string;
  lastname: string;
  active: boolean;
}

export interface Group {
  id: number;
  name: string;
  is_group: boolean;
  created_at: string;
}

export interface Conversation {
  id: number;
  is_group: boolean;
  name: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  attachment_id: number | null;
  sender_id: number;
  content: string | null;
  file_name: string | null;
  file_type: string | null;
  description: string | null;
  file_size: number | null;
  created_at: string;
  type: 'message' | 'file';
  is_read?: boolean; // Optional for backward compatibility
}

export interface FileUploadResponse {
  id: number;
  sender_id: number;
  file_type: string;
  file_size: number;
  file_name: string;
  attachment_id: number;
  conversation_id: number;
  description: string;
  created_at: string;
}

export interface WebSocketMessage {
  type: 'message';
  message: {
    id: string;
    conversation_id: number;
    sender_id: number;
    content: string;
    timestamp: string;
    type: 'text';
  };
}

export interface WebSocketFile {
  type: 'file';
  metadata: {
    id: string;
    conversation_id: number;
    sender_id: number;
    attachment_id: string;
    file_name: string;
    file_type: string;
    description: string;
    file_size: number;
    timestamp: string;
  };
}
