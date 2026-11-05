export interface SessionMetadata { email: string; expiresAt: number; sessionId: string; }
export interface SessionUI {
  configure(options?: {reconnect?: (email: string, password: string) => Promise<SessionMetadata>; onExpired?: (session: SessionMetadata) => void; onRestored?: (session: SessionMetadata, previous: SessionMetadata | null) => void; onLogout?: (previous: SessionMetadata | null) => void; onAccountChange?: (session: SessionMetadata, previous: SessionMetadata) => void}): SessionUI;
  read(): SessionMetadata | null;
  current(): SessionMetadata | null;
  accept(session: SessionMetadata, options?: {persist?: boolean}): SessionMetadata;
  expire(options?: {sessionId?: string; reason?: string}): boolean;
  logout(options?: {persist?: boolean}): void;
  generation(): number;
  isExpired(): boolean;
}
declare global { interface Window { CDISession: SessionUI; } }
