'use client';

import { useRef, useState, useContext, useEffect } from 'react';
import ThreadedChat from "../components/ThreadedChat";
import FirebaseTest from "../components/FirebaseTest";
import { AuthContext } from '../lib/contexts/AuthContext';
import { saveDeepDive, getUserDeepDives, updateDeepDive, deleteDeepDive, DeepDiveData, saveLearningData } from '../lib/firebase/firebaseUtils';
import Image from 'next/image';

export default function Home() {
  const threadedChatRef = useRef<any>(null);
  const { user, loading, signInWithGoogle, signOut } = useContext(AuthContext);
  const [savedDeepDives, setSavedDeepDives] = useState<DeepDiveData[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentDeepDiveId, setCurrentDeepDiveId] = useState<string | null>(null);

  // Load user's saved deep dives when they sign in
  useEffect(() => {
    if (user) {
      loadUserDeepDives();
    } else {
      setSavedDeepDives([]);
      setCurrentDeepDiveId(null);
    }
  }, [user]);

  const loadUserDeepDives = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Loading user deep dives...');
      const deepDives = await getUserDeepDives();
      setSavedDeepDives(deepDives);
      console.log('✅ Deep dives loaded:', deepDives.length);
    } catch (error) {
      console.error('❌ Failed to load deep dives:', error);
      let errorMessage = 'Failed to load your saved deep dives. ';
      if (error instanceof Error) {
        errorMessage += error.message;
      }
      
      if (error instanceof Error && error.message.includes('permission-denied')) {
        errorMessage += '\n\n🔧 This might be a Firestore security rules issue. Please check your Firebase configuration.';
      }
      
      alert(`❌ ${errorMessage}\n\nPlease check the browser console for more details.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAllResponses = () => {
    if (threadedChatRef.current) {
      threadedChatRef.current.copyAllAIResponses();
    }
  };

  const handleGenerateLearningTools = async () => {
    if (!threadedChatRef.current) {
      alert('No chat data available. Please start a conversation first.');
      return;
    }

    if (!user) {
      alert('Please sign in to generate learning tools.');
      return;
    }

    try {
      // First, expand all rows to ensure all threads are visible
      const chatComponent = threadedChatRef.current;
      
      // Force update thread messages to get the latest data
      chatComponent.forceUpdateThreadMessages?.();
      
      // Wait a moment for updates to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get current state from ThreadedChat
      const chatState = chatComponent.getCurrentState?.();
      
      if (!chatState) {
        throw new Error('Unable to get current chat state');
      }

      // Validate that there's content to process
      const hasMainMessages = chatState.mainMessages && chatState.mainMessages.length > 0;
      const hasThreads = chatState.threads && chatState.threads.length > 0;
      
      if (!hasMainMessages && !hasThreads) {
        alert('⚠️ No conversation data found!\n\nPlease start a conversation with the AI first, then try generating learning tools.');
        return;
      }

      // Extract AI responses from main chat
      const mainResponses = (chatState.mainMessages || [])
        .filter((msg: any) => msg.role === 'assistant')
        .map((msg: any, index: number) => ({
          content: msg.content,
          index: index + 1
        }));

      // Extract AI responses from threads
      const threadResponses: any[] = [];
      (chatState.threads || []).forEach((thread: any, threadIndex: number) => {
        const threadAIResponses = (thread.messages || [])
          .filter((msg: any) => msg.role === 'assistant');
        
        threadAIResponses.forEach((msg: any, responseIndex: number) => {
          threadResponses.push({
            content: msg.content,
            threadTitle: thread.title || `Thread ${threadIndex + 1}`,
            context: thread.selectedContext || '',
            threadIndex: threadIndex + 1,
            responseIndex: responseIndex + 1
          });
        });
      });

      // Prepare data for learning tools
      const learningData = {
        mainResponses,
        threadResponses
      };

      console.log('🎓 Generated learning data:', {
        mainResponsesCount: mainResponses.length,
        threadResponsesCount: threadResponses.length,
        dataSizeKB: Math.round(JSON.stringify(learningData).length / 1024)
      });

      // Save to Firebase
      const learningDataId = await saveLearningData(learningData);
      
      // Navigate to learning page with Firebase ID
      window.open(`/learn?id=${learningDataId}`, '_blank');

    } catch (error) {
      console.error('❌ Failed to generate learning tools:', error);
      alert(`❌ Failed to generate learning tools.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`);
    }
  };

  const handleClearAll = () => {
    if (confirm('🧹 Clear all conversations and threads?\n\nThis will permanently delete:\n• Main chat conversation\n• All threads and their messages\n• All contexts and selections\n\nThis cannot be undone.')) {
      if (threadedChatRef.current) {
        threadedChatRef.current.clearAllAndStartFresh();
        setCurrentDeepDiveId(null);
      }
    }
  };

  const handleSaveDeepDive = async () => {
    if (!user) {
      alert('Please sign in to save your deep dive.');
      return;
    }

    if (!saveTitle.trim()) {
      alert('Please enter a title for your deep dive.');
      return;
    }

    try {
      setIsSaving(true);
      console.log('🚀 Starting save process...');
      
      // Force update thread messages to ensure we capture everything
      console.log('🔄 Ensuring all thread messages are captured...');
      threadedChatRef.current?.forceUpdateThreadMessages();
      
      // Small delay to allow state updates to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get current state from ThreadedChat
      const chatState = threadedChatRef.current?.getCurrentState();
      console.log('📊 Chat state retrieved:', {
        hasMainMessages: !!(chatState?.mainMessages?.length),
        mainMessageCount: chatState?.mainMessages?.length || 0,
        threadCount: chatState?.threads?.length || 0,
        selectedModel: chatState?.selectedModel
      });

      if (!chatState) {
        throw new Error('Unable to get current chat state from ThreadedChat component');
      }

      // Validate that there's actually content to save
      const hasMainMessages = chatState.mainMessages && chatState.mainMessages.length > 0;
      const hasThreads = chatState.threads && chatState.threads.length > 0;
      
      if (!hasMainMessages && !hasThreads) {
        alert('⚠️ No conversation data to save!\n\nPlease start a conversation first, then try saving again.');
        return;
      }

      const deepDiveData = {
        title: saveTitle.trim(),
        description: saveDescription.trim(),
        mainMessages: chatState.mainMessages || [],
        threads: chatState.threads || [],
        selectedModel: chatState.selectedModel || 'anthropic',
        metadata: {
          totalMessages: (chatState.mainMessages || []).length,
          totalThreads: (chatState.threads || []).length,
          lastActiveThread: chatState.activeThreadId,
        },
      };

      console.log('💾 Prepared data for saving:', {
        title: deepDiveData.title,
        description: deepDiveData.description,
        mainMessagesCount: deepDiveData.mainMessages.length,
        threadsCount: deepDiveData.threads.length,
        model: deepDiveData.selectedModel
      });

      let deepDiveId;
      if (currentDeepDiveId) {
        // Update existing deep dive
        console.log('🔄 Updating existing deep dive:', currentDeepDiveId);
        await updateDeepDive(currentDeepDiveId, deepDiveData);
        deepDiveId = currentDeepDiveId;
        alert('✅ Deep dive updated successfully!');
      } else {
        // Save new deep dive
        console.log('💾 Saving new deep dive...');
        deepDiveId = await saveDeepDive(deepDiveData);
        setCurrentDeepDiveId(deepDiveId);
        alert(`✅ Deep dive saved successfully!\n\n📊 Saved:\n• ${deepDiveData.mainMessages.length} main messages\n• ${deepDiveData.threads.length} threads\n• Model: ${deepDiveData.selectedModel}`);
      }

      // Refresh the saved deep dives list
      console.log('🔄 Refreshing deep dives list...');
      await loadUserDeepDives();
      
      // Close dialog and reset form
      setShowSaveDialog(false);
      setSaveTitle('');
      setSaveDescription('');

    } catch (error) {
      console.error('❌ Failed to save deep dive:', error);
      
      let errorMessage = 'Failed to save deep dive. ';
      if (error instanceof Error) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error occurred.';
      }
      
      // Check for specific Firebase errors
      if (error instanceof Error && error.message.includes('permission-denied')) {
        errorMessage += '\n\n🔧 This might be a Firestore security rules issue. Please check your Firebase configuration.';
      } else if (error instanceof Error && error.message.includes('unauthenticated')) {
        errorMessage += '\n\n🔑 Please try signing out and signing back in.';
      }
      
      alert(`❌ ${errorMessage}\n\nPlease check the browser console for more details.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadDeepDive = async (deepDive: DeepDiveData) => {
    try {
      console.log('🔄 Loading deep dive:', deepDive.title);
      if (threadedChatRef.current) {
        // Load the deep dive data into ThreadedChat
        threadedChatRef.current.loadState({
          mainMessages: deepDive.mainMessages || [],
          threads: deepDive.threads || [],
          selectedModel: deepDive.selectedModel || 'anthropic',
          activeThreadId: deepDive.metadata?.lastActiveThread || null,
        });
        
        setCurrentDeepDiveId(deepDive.id || null);
        setShowLoadDialog(false);
        
        // Update save form with current deep dive info
        setSaveTitle(deepDive.title);
        setSaveDescription(deepDive.description || '');
        
        alert(`✅ Loaded deep dive: "${deepDive.title}"\n\n📊 Loaded:\n• ${deepDive.mainMessages?.length || 0} main messages\n• ${deepDive.threads?.length || 0} threads\n\n💡 Note: Main chat messages may not appear immediately due to technical limitations. Threads should load correctly.`);
      }
    } catch (error) {
      console.error('❌ Failed to load deep dive:', error);
      alert('Failed to load deep dive. Please try again.');
    }
  };

  const handleDeleteDeepDive = async (deepDiveId: string, title: string) => {
    if (confirm(`Delete "${title}"?\n\nThis action cannot be undone.`)) {
      try {
        await deleteDeepDive(deepDiveId);
        
        // If we deleted the currently loaded deep dive, clear the ID
        if (currentDeepDiveId === deepDiveId) {
          setCurrentDeepDiveId(null);
        }
        
        // Refresh the list
        await loadUserDeepDives();
        alert('Deep dive deleted successfully.');
      } catch (error) {
        console.error('Failed to delete deep dive:', error);
        alert('Failed to delete deep dive. Please try again.');
      }
    }
  };

  const formatDate = (timestamp: any) => {
    if (timestamp && timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString() + ' ' + timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return 'Unknown date';
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Thin Header */}
        <header className="w-full bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">AI Chat with Contextual Threading</h1>
            {currentDeepDiveId && (
              <span className="bg-green-600/20 text-green-400 px-3 py-1 rounded-full text-sm border border-green-600/30">
                💾 Saved
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border border-slate-600 hover:border-slate-500 flex items-center gap-2"
                    title="Save current deep dive"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {currentDeepDiveId ? 'Update' : 'Save'}
                  </button>
                  
                  <button
                    onClick={() => setShowLoadDialog(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border border-slate-600 hover:border-slate-500 flex items-center gap-2"
                    title="Load saved deep dive"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    Load ({savedDeepDives.length})
                  </button>
                  
                  <button
                    onClick={handleClearAll}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border border-slate-600 hover:border-slate-500 flex items-center gap-2"
                    title="Clear all conversations and start fresh"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All
                  </button>
                  
                  <button
                    onClick={handleCopyAllResponses}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border border-slate-600 hover:border-slate-500 flex items-center gap-2"
                    title="Copy all AI responses to clipboard"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy All Responses
                  </button>
                  
                  <button
                    onClick={handleGenerateLearningTools}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border border-purple-500 hover:border-purple-400 flex items-center gap-2"
                    title="Generate interactive learning tools (flashcards, slides, infographics)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Generate Learning Tools
                  </button>
                </div>
                
                {/* Sign out button */}
                <button
                  onClick={signOut}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border border-slate-600 hover:border-slate-500 ml-4"
                  title="Sign out"
                >
                  Sign Out
                </button>
                
                {/* Profile info */}
                <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-600">
                  <Image
                    src={user.photoURL || '/next.svg'}
                    alt={user.displayName || 'User'}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full border border-slate-600"
                  />
                  <span className="text-slate-300 text-sm">{user.displayName}</span>
                </div>
              </>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-4 py-2 rounded-md font-medium transition-all duration-200 border border-slate-600 hover:border-slate-500 flex items-center gap-2"
                title="Sign in with Google to save your deep dives"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
            )}
          </div>
        </header>
        
        {/* Main Content */}
        <div className="h-[calc(100vh-60px)]"> {/* Subtract header height */}
          <ThreadedChat ref={threadedChatRef} />
        </div>

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 w-96 border border-slate-600">
              <h2 className="text-xl font-bold text-white mb-4">
                {currentDeepDiveId ? 'Update Deep Dive' : 'Save Deep Dive'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-white text-sm font-medium mb-2 block">Title *</label>
                  <input
                    type="text"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    className="w-full bg-slate-700 text-white border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="Enter a title for your deep dive..."
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="text-white text-sm font-medium mb-2 block">Description</label>
                  <textarea
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    className="w-full bg-slate-700 text-white border border-slate-600 rounded-lg px-3 py-2 h-20 resize-none focus:outline-none focus:border-blue-500"
                    placeholder="Optional description..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveTitle('');
                    setSaveDescription('');
                  }}
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDeepDive}
                  disabled={isSaving || !saveTitle.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200"
                >
                  {isSaving ? 'Saving...' : currentDeepDiveId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Load Dialog */}
        {showLoadDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 w-[600px] max-h-[80vh] border border-slate-600">
              <h2 className="text-xl font-bold text-white mb-4">Load Saved Deep Dive</h2>
              
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="text-white">Loading your saved deep dives...</div>
                </div>
              ) : savedDeepDives.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400">No saved deep dives found.</div>
                  <div className="text-sm text-gray-500 mt-2">Start a conversation and save it to see it here!</div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {savedDeepDives.map((deepDive) => (
                    <div key={deepDive.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-white font-medium">{deepDive.title}</h3>
                          {deepDive.description && (
                            <p className="text-gray-300 text-sm mt-1">{deepDive.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                            <span>📝 {deepDive.metadata?.totalMessages || 0} messages</span>
                            <span>🧵 {deepDive.metadata?.totalThreads || 0} threads</span>
                            <span>🕒 {formatDate(deepDive.updatedAt)}</span>
                            <span>🤖 {deepDive.selectedModel}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleLoadDeepDive(deepDive)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteDeepDive(deepDive.id!, deepDive.title)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowLoadDialog(false)}
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold">🔧 Firebase Debug</h3>
              <button
                onClick={() => setShowDebugPanel(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <FirebaseTest />
          </div>
        </div>
      )}
    </>
  );
}
