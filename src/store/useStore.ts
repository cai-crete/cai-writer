import { create } from 'zustand';
import { Session, ChatMessage, saveSession, deleteSession, getAllSessions, getSession } from '../lib/db';

const generateId = () => Math.random().toString(36).substring(2, 9);

interface AppState {
  sessions: Session[];
  currentSessionId: string | null;
  messages: ChatMessage[];

  loadSessions: () => Promise<void>;
  loadSessionData: (id: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  deleteSessionData: (id: string, e?: React.MouseEvent) => Promise<void>;
  
  // Chat actions
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;
  syncCurrentSession: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],

  loadSessions: async () => {
    const rawSessions = await getAllSessions();
    const sessions = rawSessions.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sessions });
  },

  createNewSession: async () => {
    const newSessionId = generateId();
    const initMessage: ChatMessage = {
      id: 'init',
      role: 'model',
      content: '건축적 사유와 문학적 감수성의 융합 에이전트, **cai-writer**입니다. 어떤 건축적 아이디어나 이미지를 글로 변환하시겠습니까?'
    };
    
    const newSession: Session = {
      id: newSessionId,
      title: '새로운 건축 비평',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [initMessage]
    };

    await saveSession(newSession);
    set({
      currentSessionId: newSessionId,
      messages: [initMessage]
    });
    get().loadSessions();
  },

  loadSessionData: async (id: string) => {
    const session = await getSession(id);
    if (session) {
      set({
        currentSessionId: session.id,
        messages: session.messages
      });
    }
  },

  deleteSessionData: async (id: string, e) => {
    if (e) e.stopPropagation();
    await deleteSession(id);
    await get().loadSessions();

    if (get().currentSessionId === id) {
       const remaining = get().sessions;
       if (remaining.length > 0) {
         await get().loadSessionData(remaining[0].id);
       } else {
         await get().createNewSession();
       }
    }
  },

  addMessage: (msg) => {
    set(state => ({ messages: [...state.messages, msg] }));
    get().syncCurrentSession();
  },

  updateMessage: (id, partial) => {
    set(state => ({
      messages: state.messages.map(m => m.id === id ? { ...m, ...partial } : m)
    }));
    get().syncCurrentSession();
  },

  syncCurrentSession: async () => {
    const { currentSessionId, messages } = get();
    if (currentSessionId) {
      const session = await getSession(currentSessionId);
      if (session) {
        const userMsg = messages.find(m => m.role === 'user');
        let title = session.title;
        if (userMsg && userMsg.content) {
            const tempTitle = userMsg.content.trim();
            title = tempTitle.length > 36 ? tempTitle.substring(0, 36) + '...' : tempTitle;
        }

        const updatedSession: Session = {
          ...session,
          title,
          updatedAt: Date.now(),
          messages
        };
        await saveSession(updatedSession);
        get().loadSessions(); 
      }
    }
  }
}));
