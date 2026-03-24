export type UserRole = 'speaking' | 'deaf';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Message {
  senderId: string;
  text: string;
  timestamp: string;
}

export interface CallRecord {
  id: string;
  participants: string[];
  startTime: string;
  endTime?: string;
  duration?: number;
  mode: 'video' | 'live';
  transcript: Message[];
}
