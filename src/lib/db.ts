import { openDB, DBSchema, IDBPDatabase } from 'idb';

export type MessageRole = 'user' | 'model';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  imagePreview?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface CaiWriterDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: {
      'updatedAt': number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<CaiWriterDB>>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<CaiWriterDB>('cai-writer-db', 1, {
      upgrade(db) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('updatedAt', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

export async function saveSession(session: Session) {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getSession(id: string) {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function getAllSessions() {
  const db = await getDB();
  return db.getAllFromIndex('sessions', 'updatedAt');
}

export async function deleteSession(id: string) {
  const db = await getDB();
  await db.delete('sessions', id);
}
