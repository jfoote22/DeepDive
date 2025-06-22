export interface ChatSession {
  id: string;
  title: string;
  mainChatMessages: any[];
  threads: any[];
  createdAt: number;
  updatedAt: number;
}

export interface ShareableSession {
  id: string;
  title: string;
  mainChatMessages: any[];
  threads: any[];
  createdAt: number;
  isPublic: boolean;
}

class ChatSessionManager {
  private readonly STORAGE_KEY = 'deepdive_chat_sessions';
  private readonly SHARED_STORAGE_KEY = 'deepdive_shared_sessions';

  // Save a chat session to localStorage
  saveSession(session: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt'>): string {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return '';
    }
    
    const sessions = this.getAllSessions();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newSession: ChatSession = {
      ...session,
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    sessions.push(newSession);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
    
    return sessionId;
  }

  // Get all saved sessions
  getAllSessions(): ChatSession[] {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        return [];
      }
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  }

  // Get a specific session by ID
  getSession(sessionId: string): ChatSession | null {
    const sessions = this.getAllSessions();
    return sessions.find(session => session.id === sessionId) || null;
  }

  // Update an existing session
  updateSession(sessionId: string, updates: Partial<ChatSession>): boolean {
    const sessions = this.getAllSessions();
    const sessionIndex = sessions.findIndex(session => session.id === sessionId);
    
    if (sessionIndex === -1) return false;

    sessions[sessionIndex] = {
      ...sessions[sessionIndex],
      ...updates,
      updatedAt: Date.now()
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
    return true;
  }

  // Delete a session
  deleteSession(sessionId: string): boolean {
    const sessions = this.getAllSessions();
    const filteredSessions = sessions.filter(session => session.id !== sessionId);
    
    if (filteredSessions.length === sessions.length) return false;

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredSessions));
    return true;
  }

  // Create a shareable link for a session
  createShareableLink(sessionId: string): string {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const shareableSession: ShareableSession = {
      id: shareId,
      title: session.title,
      mainChatMessages: session.mainChatMessages,
      threads: session.threads,
      createdAt: session.createdAt,
      isPublic: true
    };

    // Save to shared sessions storage
    const sharedSessions = this.getAllSharedSessions();
    sharedSessions.push(shareableSession);
    localStorage.setItem(this.SHARED_STORAGE_KEY, JSON.stringify(sharedSessions));

    // Create shareable URL
    const currentUrl = window.location.origin + window.location.pathname;
    return `${currentUrl}?share=${shareId}`;
  }

  // Get all shared sessions
  getAllSharedSessions(): ShareableSession[] {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        return [];
      }
      const stored = localStorage.getItem(this.SHARED_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading shared sessions:', error);
      return [];
    }
  }

  // Get a shared session by share ID
  getSharedSession(shareId: string): ShareableSession | null {
    const sharedSessions = this.getAllSharedSessions();
    return sharedSessions.find(session => session.id === shareId) || null;
  }

  // Generate a session title from messages
  generateSessionTitle(messages: any[], threads: any[]): string {
    if (messages.length === 0 && threads.length === 0) {
      return 'New DeepDive Session';
    }

    // Try to get title from first user message
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      if (content.length > 0) {
        return content.length > 50 ? `${content.substring(0, 50)}...` : content;
      }
    }

    // Fallback to thread count or generic title
    if (threads.length > 0) {
      return `DeepDive with ${threads.length} thread${threads.length > 1 ? 's' : ''}`;
    }

    return 'DeepDive Session';
  }

  // Export session data for backup
  exportSession(sessionId: string): string {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    return JSON.stringify(session, null, 2);
  }

  // Import session data from backup
  importSession(sessionData: string): string {
    try {
      const session = JSON.parse(sessionData);
      
      // Validate session structure
      if (!session.title || !session.mainChatMessages || !session.threads) {
        throw new Error('Invalid session data structure');
      }

      // Generate new ID and save
      return this.saveSession({
        title: session.title + ' (Imported)',
        mainChatMessages: session.mainChatMessages,
        threads: session.threads
      });
    } catch (error) {
      throw new Error('Failed to import session: ' + error);
    }
  }
}

export const chatSessionManager = new ChatSessionManager(); 