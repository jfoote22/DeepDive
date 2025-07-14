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
  getDoc,
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
  learningSnippets?: any[]; // Learning snippets for enhanced learning tools
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
  metadata?: {
    totalMessages: number;
    totalThreads: number;
    totalSnippets?: number;
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
      learningSnippets: (deepDiveData.learningSnippets || []).map(snippet => ({
        id: snippet.id || `snippet-${Date.now()}-${Math.random()}`,
        text: snippet.text || '',
        source: snippet.source || 'Unknown',
        timestamp: snippet.timestamp || Date.now(),
      })),
      selectedModel: deepDiveData.selectedModel || 'anthropic',
      userId: auth.currentUser.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      metadata: {
        totalMessages: deepDiveData.mainMessages?.length || 0,
        totalThreads: deepDiveData.threads?.length || 0,
        totalSnippets: deepDiveData.learningSnippets?.length || 0,
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

    // Handle learningSnippets
    if (updates.learningSnippets !== undefined) {
      cleanUpdates.learningSnippets = (updates.learningSnippets || []).map(snippet => ({
        id: snippet.id || `snippet-${Date.now()}-${Math.random()}`,
        text: snippet.text || '',
        source: snippet.source || 'Unknown',
        timestamp: snippet.timestamp || Date.now(),
      }));
    }

    // Handle metadata
    if (updates.metadata !== undefined || updates.mainMessages !== undefined || updates.threads !== undefined || updates.learningSnippets !== undefined) {
      cleanUpdates.metadata = {
        totalMessages: updates.mainMessages?.length || 0,
        totalThreads: updates.threads?.length || 0,
        totalSnippets: updates.learningSnippets?.length || 0,
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

// Learning Data functions
export interface LearningData {
  mainResponses: Array<{ content: string; index: number; }>;
  threadResponses: Array<{ 
    content: string; 
    threadTitle: string; 
    context: string; 
    threadIndex: number; 
    responseIndex: number; 
  }>;
}

export interface LearningDataDoc {
  id?: string;
  learningData: LearningData | EnhancedLearningData;
  userId: string;
  createdAt: Timestamp;
  expiresAt: Timestamp; // Auto-delete after 24 hours
}

export interface EnhancedLearningData {
  originalData: LearningData;
  analysis: GrokAnalysis | null;
  metadata: {
    generated_at: string;
    user_id: string;
    analyzed_at?: string;
    main_responses_count: number;
    thread_responses_count: number;
    model: string;
    analysis_failed?: boolean;
    error?: string;
  };
}

export interface GrokAnalysis {
  summary: string;
  learningObjectives: string[];
  flashcards: Array<{
    front: string;
    back: string;
  }>;
  quizQuestions: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }>;
  studyGuide: {
    keyTopics: Array<{
      title: string;
      content: string;
    }>;
    importantConcepts: string[];
    practiceQuestions: string[];
  };
}

export const saveLearningData = async (learningData: LearningData | EnhancedLearningData) => {
  console.log('🎓 Saving learning data to Firebase...');
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to save learning data');
  }

  try {
    // Set expiration to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const learningDataDoc: Omit<LearningDataDoc, 'id'> = {
      learningData,
      userId: auth.currentUser.uid,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    };

    // Check if this is enhanced learning data or legacy format
    const isEnhanced = 'originalData' in learningData;
    
    if (isEnhanced) {
      const enhanced = learningData as EnhancedLearningData;
      console.log('💾 Saving enhanced learning data with Grok analysis:', {
        mainResponsesCount: enhanced.originalData.mainResponses.length,
        threadResponsesCount: enhanced.originalData.threadResponses.length,
        hasAnalysis: !!enhanced.analysis,
        flashcardsCount: enhanced.analysis?.flashcards?.length || 0,
        quizQuestionsCount: enhanced.analysis?.quizQuestions?.length || 0,
        dataSizeKB: Math.round(JSON.stringify(learningData).length / 1024),
        expiresAt: expiresAt.toISOString(),
        userId: auth.currentUser.uid
      });
    } else {
      const legacy = learningData as LearningData;
      console.log('💾 Saving legacy learning data:', {
        mainResponsesCount: legacy.mainResponses.length,
        threadResponsesCount: legacy.threadResponses.length,
        dataSizeKB: Math.round(JSON.stringify(learningData).length / 1024),
        expiresAt: expiresAt.toISOString(),
        userId: auth.currentUser.uid
      });
    }

    // TEMPORARY: Use deepdives collection to test if it's a collection-specific issue
    const docRef = await addDoc(collection(db, 'deepdives'), {
      type: 'learning_data', // Mark this as learning data
      enhanced: isEnhanced, // Flag to indicate if this has Grok analysis
      ...learningDataDoc
    });
    console.log('✅ Learning data saved successfully with ID:', docRef.id);
    return docRef.id;

  } catch (error) {
    console.error('❌ Error saving learning data:', error);
    throw new Error(`Failed to save learning data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const getLearningData = async (learningDataId: string) => {
  console.log('🎓 Loading learning data from Firebase:', learningDataId);
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to load learning data');
  }

  try {
    // TEMPORARY: Use deepdives collection
    const docRef = doc(db, 'deepdives', learningDataId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Learning data not found');
    }

    const data = docSnap.data();
    
    // Check if this is actually learning data
    if (data.type !== 'learning_data') {
      throw new Error('Document is not learning data');
    }

    const learningDataDoc = data as LearningDataDoc & { type: string; enhanced?: boolean };
    
    // Check if user owns this data
    if (learningDataDoc.userId !== auth.currentUser.uid) {
      throw new Error('Access denied: You do not own this learning data');
    }

    // Check if data has expired
    if (learningDataDoc.expiresAt.toDate() < new Date()) {
      // Delete expired data
      await deleteDoc(docRef);
      throw new Error('Learning data has expired and has been deleted');
    }

    const isEnhanced = data.enhanced === true;
    
    if (isEnhanced) {
      console.log('✅ Enhanced learning data loaded successfully with Grok analysis');
    } else {
      console.log('✅ Legacy learning data loaded successfully');
    }
    
    return learningDataDoc.learningData;

  } catch (error) {
    console.error('❌ Error loading learning data:', error);
    throw new Error(`Failed to load learning data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const deleteLearningData = async (learningDataId: string) => {
  console.log('🗑️ Deleting learning data:', learningDataId);
  
  if (!auth.currentUser) {
    console.error('❌ No authenticated user found');
    throw new Error('User must be authenticated to delete learning data');
  }

  try {
    // TEMPORARY: Use deepdives collection
    await deleteDoc(doc(db, 'deepdives', learningDataId));
    console.log('✅ Learning data deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting learning data:', error);
    throw new Error(`Failed to delete learning data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
