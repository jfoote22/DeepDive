import { auth, db, storage } from "./firebase";
import {
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Auth functions
export const logoutUser = () => signOut(auth);

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

// Firestore functions
export const addDocument = (collectionName: string, data: any) =>
  addDoc(collection(db, collectionName), data);

export const getDocuments = async (collectionName: string) => {
  const querySnapshot = await getDocs(collection(db, collectionName));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const updateDocument = (collectionName: string, id: string, data: any) =>
  updateDoc(doc(db, collectionName, id), data);

export const deleteDocument = (collectionName: string, id: string) =>
  deleteDoc(doc(db, collectionName, id));

// Storage functions
export const uploadFile = async (file: File, path: string) => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

// Helper function to clean data and remove undefined values
const cleanDataForFirestore = (data: any): any => {
  if (data === null || data === undefined) {
    return null;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => cleanDataForFirestore(item)).filter(item => item !== undefined);
  }
  
  if (typeof data === 'object' && data !== null) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      const cleanedValue = cleanDataForFirestore(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }
  
  return data;
};

// DeepDive specific functions
export interface DeepDiveData {
  id?: string;
  title: string;
  description?: string;
  mainMessages: any[];
  threads: any[];
  selectedModel: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
  metadata?: {
    totalMessages: number;
    totalThreads: number;
    lastActiveThread?: string;
  };
}

export const saveDeepDive = async (deepDiveData: Omit<DeepDiveData, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
  console.log('🔄 Starting to save deep dive...', { title: deepDiveData.title });
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to save deep dives');
  }

  console.log('✅ User authenticated:', auth.currentUser.email);

  try {
    // Clean and serialize the data to ensure it's Firestore-compatible
    const cleanData = {
      title: deepDiveData.title || 'Untitled Deep Dive',
      description: deepDiveData.description || '',
      mainMessages: (deepDiveData.mainMessages || []).map(msg => ({
        id: msg.id || `msg-${Date.now()}-${Math.random()}`,
        role: msg.role || 'user',
        content: msg.content || '',
        timestamp: msg.timestamp || Date.now(),
      })),
      threads: (deepDiveData.threads || []).map(thread => ({
        id: thread.id || `thread-${Date.now()}-${Math.random()}`,
        messages: (thread.messages || []).map((msg: any) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role || 'user',
          content: msg.content || '',
          timestamp: msg.timestamp || Date.now(),
        })),
        selectedContext: thread.selectedContext || '',
        title: thread.title || 'Untitled Thread',
        rowId: thread.rowId || 0,
        sourceType: thread.sourceType || 'main',
        actionType: thread.actionType || 'ask',
        parentThreadId: thread.parentThreadId || null,
      })),
      selectedModel: deepDiveData.selectedModel || 'anthropic',
      userId: auth.currentUser.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      metadata: {
        totalMessages: deepDiveData.mainMessages?.length || 0,
        totalThreads: deepDiveData.threads?.length || 0,
        lastActiveThread: deepDiveData.metadata?.lastActiveThread || null,
      },
    };

    // Clean the data to remove any undefined values
    const finalData = cleanDataForFirestore(cleanData);

    console.log('💾 Saving cleaned data to Firestore:', {
      title: finalData.title,
      mainMessagesCount: finalData.mainMessages.length,
      threadsCount: finalData.threads.length,
      userId: finalData.userId,
    });

    const docRef = await addDoc(collection(db, 'deepdives'), finalData);
    console.log('✅ Deep dive saved successfully with ID:', docRef.id);
    return docRef.id;

  } catch (error) {
    console.error('❌ Error saving deep dive:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw new Error(`Failed to save deep dive: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const updateDeepDive = async (deepDiveId: string, updates: Partial<DeepDiveData>) => {
  console.log('🔄 Updating deep dive:', deepDiveId);
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to update deep dives');
  }

  try {
    // Clean and prepare the update data
    const cleanUpdates: any = {
      updatedAt: Timestamp.now(),
    };

    // Only include fields that are actually being updated
    if (updates.title !== undefined) {
      cleanUpdates.title = updates.title;
    }
    if (updates.description !== undefined) {
      cleanUpdates.description = updates.description;
    }
    if (updates.selectedModel !== undefined) {
      cleanUpdates.selectedModel = updates.selectedModel;
    }
    
    // Handle mainMessages
    if (updates.mainMessages !== undefined) {
      cleanUpdates.mainMessages = (updates.mainMessages || []).map(msg => ({
        id: msg.id || `msg-${Date.now()}-${Math.random()}`,
        role: msg.role || 'user',
        content: msg.content || '',
        timestamp: msg.timestamp || Date.now(),
      }));
    }

    // Handle threads
    if (updates.threads !== undefined) {
      cleanUpdates.threads = (updates.threads || []).map(thread => ({
        id: thread.id || `thread-${Date.now()}-${Math.random()}`,
        messages: (thread.messages || []).map((msg: any) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          role: msg.role || 'user',
          content: msg.content || '',
          timestamp: msg.timestamp || Date.now(),
        })),
        selectedContext: thread.selectedContext || '',
        title: thread.title || 'Untitled Thread',
        rowId: thread.rowId || 0,
        sourceType: thread.sourceType || 'main',
        actionType: thread.actionType || 'ask',
        parentThreadId: thread.parentThreadId || null,
      }));
    }

    // Handle metadata
    if (updates.metadata !== undefined || updates.mainMessages !== undefined || updates.threads !== undefined) {
      cleanUpdates.metadata = {
        totalMessages: updates.mainMessages?.length || 0,
        totalThreads: updates.threads?.length || 0,
        lastActiveThread: updates.metadata?.lastActiveThread || null,
      };
    }

    // Clean the data to remove any undefined values
    const finalUpdates = cleanDataForFirestore(cleanUpdates);

    console.log('💾 Updating with cleaned data:', {
      deepDiveId,
      fieldsUpdated: Object.keys(finalUpdates),
      mainMessagesCount: finalUpdates.mainMessages?.length || 'not updated',
      threadsCount: finalUpdates.threads?.length || 'not updated',
    });

    await updateDoc(doc(db, 'deepdives', deepDiveId), finalUpdates);
    console.log('✅ Deep dive updated successfully');
  } catch (error) {
    console.error('❌ Error updating deep dive:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw new Error(`Failed to update deep dive: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const getUserDeepDives = async () => {
  console.log('🔄 Loading user deep dives...');
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to load deep dives');
  }

  console.log('✅ User authenticated:', auth.currentUser.email);

  try {
    const q = query(
      collection(db, 'deepdives'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    console.log('📋 Executing query for user:', auth.currentUser.uid);
    const querySnapshot = await getDocs(q);
    const deepDives = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as DeepDiveData[];

    console.log('✅ Deep dives loaded successfully:', {
      count: deepDives.length,
      titles: deepDives.map(dd => dd.title)
    });

    return deepDives;
  } catch (error) {
    console.error('❌ Error loading deep dives:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw new Error(`Failed to load deep dives: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const deleteDeepDive = async (deepDiveId: string) => {
  console.log('🗑️ Deleting deep dive:', deepDiveId);
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to delete deep dives');
  }

  try {
    await deleteDoc(doc(db, 'deepdives', deepDiveId));
    console.log('✅ Deep dive deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting deep dive:', error);
    throw new Error(`Failed to delete deep dive: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
