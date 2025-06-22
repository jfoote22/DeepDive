'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import React from 'react';
import { chatSessionManager } from '../lib/chatSessions';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface Thread {
  id: string;
  messages: Message[];
  parentThreadId?: string;
  selectedContext?: string;
  title?: string;
  rowId?: number; // Track which row this thread belongs to
  sourceType?: 'main' | 'thread'; // Track if created from main chat or another thread
  actionType?: 'ask' | 'details' | 'simplify' | 'examples' | 'synthesis'; // Track which context action was used
}

type ModelProvider = 'openai' | 'claude' | 'anthropic';

// Custom hook for thread chat instances - creates isolated chat for each thread
function useThreadChat(selectedModel: ModelProvider, threadId: string) {
  const getApiEndpoint = (model: ModelProvider) => {
    switch (model) {
      case 'openai':
        return '/api/openai/chat';
      case 'claude':
        return '/api/anthropic/chat';
      case 'anthropic':
        return '/api/anthropic/chat';
      default:
        return '/api/anthropic/chat';
    }
  };

  // Create a unique chat instance for this specific thread
  return useChat({
    id: `thread-${threadId}`, // Unique ID ensures complete isolation
    api: getApiEndpoint(selectedModel),
    onError: (error) => {
      console.error(`Thread ${threadId} chat error:`, error);
    },
  });
}

export default function ThreadedChat() {
  const [selectedModel, setSelectedModel] = useState<ModelProvider>('anthropic');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedMessageId, setSelectedMessageId] = useState<string>('');

  // Add state for thread expansion
  const [expandedThread, setExpandedThread] = useState<string | 'main' | null>('main');
  // Track which message/thread context menu originated from
  const [contextMenuSource, setContextMenuSource] = useState<{ messageId: string; isFromThread: boolean; threadId?: string }>({ messageId: '', isFromThread: false });
  // Manual resize state
  const [manualMainWidth, setManualMainWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  // Row collapse state
  const [collapsedRows, setCollapsedRows] = useState<Set<number>>(new Set());
  // Context collapse state - start with all contexts collapsed by default
  const [collapsedContexts, setCollapsedContexts] = useState<Set<string>>(new Set());
  
  // Store chat instances for each thread - each thread gets its own isolated chat
  const [threadChatInstances, setThreadChatInstances] = useState<{[key: string]: any}>({});
  
  // Session management state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState(chatSessionManager.getAllSessions());
  const [showSessionMenu, setShowSessionMenu] = useState(false);

  const getApiEndpoint = (model: ModelProvider) => {
    switch (model) {
      case 'openai':
        return '/api/openai/chat';
      case 'claude':
        return '/api/anthropic/chat';
      case 'anthropic':
        return '/api/anthropic/chat';
      default:
        return '/api/anthropic/chat';
    }
  };

  // Main chat hook
  const mainChat = useChat({
    api: getApiEndpoint(selectedModel),
    onError: (error) => {
      console.error('Main chat error:', error);
    },
  });

  const handleTextSelection = React.useCallback((messageId: string, isFromThread: boolean = false, threadId?: string) => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      setShowContextMenu(false);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 10) return; // Minimum selection length

    console.log('Text selected:', selectedText); // Debug log

    setSelectedText(selectedText);
    setSelectedMessageId(messageId);
    setContextMenuSource({ messageId, isFromThread, threadId });
    
    // Always position the context menu in the center of the screen
    const xPos = window.innerWidth / 2;
    const yPos = window.innerHeight / 2;
    
    console.log('Setting context menu position:', { x: xPos, y: yPos }); // Debug log
    
    setContextMenuPosition({ x: xPos, y: yPos });
    setShowContextMenu(true);
    
    console.log('Context menu should be showing'); // Debug log
  }, []);

  const createNewThread = (context: string, autoExpand: boolean = false, autoSend: boolean = false, actionType: 'ask' | 'details' | 'simplify' | 'examples' | 'synthesis' = 'ask') => {
    // Create a unique thread ID with timestamp and random component for complete uniqueness
    const newThreadId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create a more descriptive title based on context
    let title = context.substring(0, 60) + (context.length > 60 ? '...' : '');
    
    // Handle special cases for auto-generated prompts
    if (context.includes('Please explain this in the simplest terms possible')) {
      const match = context.match(/"([^"]+)"/);
      if (match) {
        title = `🎯 Simplify: ${match[1].substring(0, 40)}${match[1].length > 40 ? '...' : ''}`;
      }
    } else if (context.includes('Please provide 3-5 concrete, practical examples')) {
      const match = context.match(/"([^"]+)"/);
      if (match) {
        title = `📝 Examples: ${match[1].substring(0, 40)}${match[1].length > 40 ? '...' : ''}`;
      }
    } else if (context.includes('Please provide more details about')) {
      const match = context.match(/"([^"]+)"/);
      if (match) {
        title = `🔍 Details: ${match[1].substring(0, 40)}${match[1].length > 40 ? '...' : ''}`;
      }
    } else if (context.includes('Based on the original topic and the detailed exploration')) {
      // This is a synthesis thread
      const originalTopicMatch = context.match(/\*\*Original Topic:\*\*\s*"([^"]+)"/);
      if (originalTopicMatch) {
        title = `🔗 Synthesis: ${originalTopicMatch[1].substring(0, 35)}${originalTopicMatch[1].length > 35 ? '...' : ''}`;
      } else {
        title = '🔗 Synthesis Summary';
      }
    } else {
      // If it's a question or statement, try to extract the key topic
      const sentences = context.split(/[.!?]+/);
      if (sentences.length > 0 && sentences[0].trim().length > 10) {
        const firstSentence = sentences[0].trim();
        if (firstSentence.length <= 50) {
          title = firstSentence;
        }
      }
    }

    // Determine row assignment based on source
    let rowId = 0;
    let sourceType: 'main' | 'thread' = 'main';
    
    if (contextMenuSource.isFromThread && contextMenuSource.threadId) {
      // Thread created from another thread - stays in same row
      const parentThread = threads.find(t => t.id === contextMenuSource.threadId);
      rowId = parentThread?.rowId || 0;
      sourceType = 'thread';
    } else {
      // Thread created from main chat
      sourceType = 'main';
      // Find existing threads from main chat to determine row
      const mainChatThreads = threads.filter(t => t.sourceType === 'main');
      const existingRows = Array.from(new Set(mainChatThreads.map(t => t.rowId || 0)));
      
      if (mainChatThreads.length === 0) {
        // First thread from main chat - goes to row 0
        rowId = 0;
      } else {
        // Second+ thread from main chat - create new row
        rowId = Math.max(...existingRows) + 1;
      }
    }
    
    const newThread: Thread = {
      id: newThreadId,
      messages: [],
      selectedContext: context,
      title: title,
      rowId: rowId,
      sourceType: sourceType,
      actionType: actionType,
      parentThreadId: (contextMenuSource.isFromThread && contextMenuSource.threadId) ? contextMenuSource.threadId : undefined
    };

    // Add thread to the list - each thread is completely independent
    setThreads(prev => {
      console.log(`Creating new thread: ${newThreadId}`, { 
        context: context.substring(0, 100), 
        rowId, 
        sourceType,
        totalThreads: prev.length + 1 
      });
      return [...prev, newThread];
    });
    
    setActiveThreadId(newThreadId);
    setShowContextMenu(false);

    // Handle auto-expansion for "Get more details"
    if (autoExpand) {
      setTimeout(() => {
        const event = new CustomEvent('autoExpandThread', {
          detail: { threadId: newThreadId, context: context }
        });
        window.dispatchEvent(event);
      }, 100);
    }
    
    // Handle auto-send for "Simplify this" and "Give examples"
    if (autoSend) {
      setTimeout(() => {
        const event = new CustomEvent('autoSendToThread', {
          detail: { threadId: newThreadId, message: context }
        });
        window.dispatchEvent(event);
      }, 100);
    }
  };

  const closeThread = (threadId: string) => {
    console.log(`Closing thread: ${threadId}`);
    
    // Remove thread from the list
    setThreads(prev => {
      const filtered = prev.filter(t => t.id !== threadId);
      console.log(`Remaining threads: ${filtered.length}`);
      return filtered;
    });
    
    // Clean up any stored chat instances for this thread
    setThreadChatInstances(prev => {
      const newInstances = { ...prev };
      delete newInstances[threadId];
      return newInstances;
    });
    
    // Clear active thread if it's the one being closed
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
    }
  };

  // Function to gather all thread content for synthesis
  const gatherThreadContent = (messageId: string, isFromThread: boolean = false, threadId?: string) => {
    let originalMessage = '';
    let allThreadContent: { threadTitle: string; messages: any[]; context: string }[] = [];

    // Get the original message
    if (isFromThread && threadId) {
      // Find the thread's selected context
      const thread = threads.find(t => t.id === threadId);
      if (thread) {
        originalMessage = thread.selectedContext || '';
      }
    } else {
      // Get from main chat
      const message = mainChat.messages.find(m => m.id === messageId);
      if (message) {
        originalMessage = message.content;
      }
    }

    // Find all threads that originated from this message/thread
    const relatedThreads = threads.filter(thread => {
      if (isFromThread && threadId) {
        return thread.parentThreadId === threadId;
      } else {
        return thread.sourceType === 'main' && !thread.parentThreadId;
      }
    });

    // For now, we'll gather just the thread context and titles
    // The actual thread messages would need to be accessed via individual chat instances
    // which is complex with the current architecture
    relatedThreads.forEach(thread => {
      allThreadContent.push({
        threadTitle: thread.title || 'Thread',
        messages: [], // We'll populate this differently
        context: thread.selectedContext || ''
      });
    });

    return { originalMessage, allThreadContent, relatedThreadsCount: relatedThreads.length };
  };

  // Function to create synthesis thread
  const createSynthesisThread = (messageId: string, isFromThread: boolean = false, threadId?: string) => {
    const { originalMessage, allThreadContent, relatedThreadsCount } = gatherThreadContent(messageId, isFromThread, threadId);

    if (allThreadContent.length === 0) {
      console.log('No thread content to synthesize');
      return;
    }

    // Create synthesis prompt
    let synthesisPrompt = `Based on the original topic and the detailed exploration through ${relatedThreadsCount} threads, please provide a comprehensive synthesis summary.

**Original Topic:**
"${originalMessage}"

**Deep Dive Exploration Areas:**
`;

    allThreadContent.forEach((thread, index) => {
      synthesisPrompt += `\n**Thread ${index + 1}: ${thread.threadTitle}**\n`;
      synthesisPrompt += `Context explored: "${thread.context}"\n`;
      synthesisPrompt += `This thread focused on: ${thread.threadTitle.toLowerCase().replace(/^(🎯|📝|🔍|💬)\s*/, '')}\n\n`;
    });

    synthesisPrompt += `\n**Please analyze and synthesize:**

Given that I've created ${relatedThreadsCount} different threads to explore various aspects of the original topic, please provide a comprehensive synthesis that:

1. **Integrates all perspectives:** Connect the insights from the different exploration angles (details, examples, simplifications, questions, etc.)

2. **Identifies key themes:** What are the most important concepts that emerged across multiple threads?

3. **Provides actionable insights:** What are the main takeaways and practical implications?

4. **Creates a coherent narrative:** Tie everything together into a unified understanding of the topic.

5. **Highlights connections:** What patterns or relationships became clear through this multi-threaded exploration?

Present this as a well-structured, comprehensive synthesis that captures the essence of the entire deep dive exploration. Make it clear how the different threads complemented each other to create a fuller understanding of the topic.`;

    // Create the synthesis thread
    createNewThread(synthesisPrompt, true, true, 'synthesis');
  };

  // Session management functions
  const saveCurrentSession = () => {
    const title = chatSessionManager.generateSessionTitle(mainChat.messages, threads);
    const sessionId = chatSessionManager.saveSession({
      title,
      mainChatMessages: mainChat.messages,
      threads: threads
    });
    
    setCurrentSessionId(sessionId);
    setSavedSessions(chatSessionManager.getAllSessions());
    
    // Show success message (you could use a toast library here)
    console.log('Session saved:', sessionId);
  };

  const loadSession = (sessionId: string) => {
    const session = chatSessionManager.getSession(sessionId);
    if (!session) return;

    // Clear current state
    setThreads([]);
    setActiveThreadId(null);
    setExpandedThread('main');
    
    // Load session data
    mainChat.setMessages(session.mainChatMessages);
    setThreads(session.threads);
    setCurrentSessionId(sessionId);
    setShowSessionMenu(false);
  };

  const createShareableLink = () => {
    if (!currentSessionId) {
      // Save first if not already saved
      saveCurrentSession();
      return;
    }
    
    try {
      const shareUrl = chatSessionManager.createShareableLink(currentSessionId);
      
      // Copy to clipboard
      navigator.clipboard.writeText(shareUrl).then(() => {
        console.log('Share link copied to clipboard:', shareUrl);
        // You could show a toast notification here
      });
    } catch (error) {
      console.error('Failed to create share link:', error);
    }
  };

  const startNewSession = () => {
    // Reset all state
    setThreads([]);
    setActiveThreadId(null);
    setExpandedThread('main');
    setCurrentSessionId(null);
    mainChat.setMessages([]);
    setShowSessionMenu(false);
  };

  const deleteSession = (sessionId: string) => {
    chatSessionManager.deleteSession(sessionId);
    setSavedSessions(chatSessionManager.getAllSessions());
    
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  };

  const SessionMenu = () => {
    if (!showSessionMenu) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-96 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Sessions</h3>
            <button
              onClick={() => setShowSessionMenu(false)}
              className="text-white hover:text-gray-300 text-xl"
            >
              ×
            </button>
          </div>

          {/* Actions */}
          <div className="p-4 border-b border-slate-600">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={saveCurrentSession}
                className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                disabled={mainChat.messages.length === 0 && threads.length === 0}
              >
                <span>💾</span>
                Save Current
              </button>
              <button
                onClick={createShareableLink}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                disabled={!currentSessionId && mainChat.messages.length === 0}
              >
                <span>🔗</span>
                Share
              </button>
              <button
                onClick={startNewSession}
                className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <span>✨</span>
                New
              </button>
            </div>
          </div>

          {/* Saved Sessions List */}
          <div className="p-4">
            <h4 className="text-white font-medium mb-3">Saved Sessions ({savedSessions.length})</h4>
            {savedSessions.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No saved sessions yet</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {savedSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      currentSessionId === session.id
                        ? 'bg-blue-600/20 border-blue-500/50'
                        : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'
                    }`}
                    onClick={() => loadSession(session.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {session.title}
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          {new Date(session.updatedAt).toLocaleDateString()} • 
                          {session.threads.length} threads
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        className="text-gray-400 hover:text-red-400 ml-2 p-1"
                        title="Delete session"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ContextMenu = () => {
    if (!showContextMenu) return null;

    const menuItems = [
      {
        action: 'ask',
        icon: '💬',
        label: 'Ask about this',
        onClick: () => createNewThread(selectedText, false, false, 'ask'),
        colorScheme: getActionColorScheme('ask')
      },
      {
        action: 'details',
        icon: '🔍',
        label: 'Get more details',
        onClick: () => createNewThread(selectedText, true, false, 'details'),
        colorScheme: getActionColorScheme('details')
      },
      {
        action: 'simplify',
        icon: '🎯',
        label: 'Simplify this',
        onClick: () => createNewThread(`Please explain this in the simplest terms possible, as if you're teaching it to someone who is completely new to the topic: "${selectedText}"`, false, true, 'simplify'),
        colorScheme: getActionColorScheme('simplify')
      },
      {
        action: 'examples',
        icon: '📝',
        label: 'Give examples',
        onClick: () => createNewThread(`Please provide 3-5 concrete, practical examples that illustrate or relate to: "${selectedText}". Make the examples diverse and easy to understand.`, false, true, 'examples'),
        colorScheme: getActionColorScheme('examples')
      }
    ];

    console.log('Rendering context menu at position:', contextMenuPosition); // Debug log
    
    return (
      <div 
        data-context-menu
        className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-2 min-w-[240px]"
        style={{ 
          left: contextMenuPosition.x - 120, // Center horizontally (240px width / 2)
          top: contextMenuPosition.y - 140,  // Center vertically (approximate menu height / 2)
          transform: 'translateZ(0)', // Force hardware acceleration for smooth positioning
          pointerEvents: 'auto', // Ensure it can be clicked
          zIndex: 99999 // Ensure it's above everything else
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()} // Prevent text selection from being cleared
      >
        <div className="px-3 py-2 text-xs text-muted border-b border-custom">
          Create new thread from selection
        </div>
        <div className="py-1">
          {menuItems.map((item) => (
            <button
              key={item.action}
              onClick={item.onClick}
              className={`w-full px-3 py-2 text-left text-sm font-medium transition-all duration-200 flex items-center gap-3 hover:scale-[1.02] ${item.colorScheme.bg}/20 hover:${item.colorScheme.bg}/30 border-l-4 ${item.colorScheme.border} mx-1 my-1 rounded-r-lg`}
            >
              <div className={`w-6 h-6 rounded-full ${item.colorScheme.bg} flex items-center justify-center text-xs`}>
                {item.icon}
              </div>
              <span className="text-white">{item.label}</span>
              <div className="ml-auto">
                <div className={`w-3 h-3 rounded-full ${item.colorScheme.bg} opacity-80`}></div>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-custom mt-1 pt-1">
          <button
            onClick={() => setShowContextMenu(false)}
            className="w-full px-4 py-2 text-left hover:bg-hover text-sm text-muted font-medium transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const ModelSelector = () => (
    <div className="flex flex-wrap gap-2">
      {[
        { value: 'openai' as ModelProvider, label: 'GPT-4', emoji: '🧠', color: 'green' },
        { value: 'claude' as ModelProvider, label: 'Claude 4 Opus', emoji: '🤖', color: 'blue' },
        { value: 'anthropic' as ModelProvider, label: 'Claude 3.5 Sonnet', emoji: '🎯', color: 'purple' }
      ].map((model) => (
        <button
          key={model.value}
          onClick={() => setSelectedModel(model.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border backdrop-blur-sm ${
            selectedModel === model.value
              ? model.color === 'green' 
                ? 'bg-accent-green/20 text-accent-green border-accent-green/50 shadow-lg' 
                : model.color === 'blue'
                ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/50 shadow-lg'
                : 'bg-accent-purple/20 text-accent-purple border-accent-purple/50 shadow-lg'
              : 'bg-card/60 text-muted hover:bg-hover hover:text-white border-custom'
          }`}
        >
          {model.emoji} {model.label}
        </button>
      ))}
    </div>
  );

  const ChatInput = ({ isThread = false, onSubmit, input, handleInputChange, isLoading, onStop }: any) => (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex space-x-3">
        <textarea
          value={input}
          onChange={handleInputChange}
          placeholder={isThread ? "Ask about the selected context..." : "Type your message..."}
          disabled={isLoading}
          className="flex-1 p-4 border border-custom bg-white/90 backdrop-blur-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue/50 disabled:bg-gray-200 disabled:cursor-not-allowed text-black placeholder-gray-500 transition-all duration-200"
          rows={1}
          style={{ minHeight: '56px', maxHeight: '120px' }}
          onKeyDown={(e: any) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isLoading && input.trim()) {
                onSubmit(e);
              }
            }
          }}
        />
        <div className="flex space-x-2">
          {/* Stop button - only show when loading */}
          {isLoading && (
            <button
              type="button"
              onClick={onStop}
              className="bg-accent-red text-white px-4 py-4 rounded-lg font-medium hover:bg-accent-red/80 transition-all duration-200 shadow-lg"
              title="Stop response"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
              </svg>
            </button>
          )}
          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-accent-blue text-white px-6 py-4 rounded-lg font-medium hover:bg-accent-blue/80 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
          >
            {isLoading ? (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </form>
  );

  // Helper function to get action label based on action type
  const getActionLabel = (actionType?: string) => {
    switch (actionType) {
      case 'ask':
        return 'Ask about this';
      case 'details':
        return 'Get more details';
      case 'simplify':
        return 'Simplify this';
      case 'examples':
        return 'Give examples';
      case 'synthesis':
        return 'Synthesis Summary';
      default:
        return 'Thread';
    }
  };

  // Helper function to get context source description
  const getContextSource = (thread: Thread) => {
    if (thread.sourceType === 'main') {
      return 'Context from main chat';
    } else if (thread.sourceType === 'thread' && thread.parentThreadId) {
      // Find the parent thread to get its number
      const parentThreadIndex = threads.findIndex(t => t.id === thread.parentThreadId);
      if (parentThreadIndex !== -1) {
        return `Context from thread ${parentThreadIndex + 1}`;
      }
    }
    return 'Context from main chat'; // Default fallback
  };

  // Helper function to get color scheme based on action type
  const getActionColorScheme = (actionType?: string) => {
    switch (actionType) {
      case 'ask':
        return {
          bg: 'bg-accent-blue',
          border: 'border-accent-blue',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      case 'details':
        return {
          bg: 'bg-accent-green',
          border: 'border-accent-green',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      case 'simplify':
        return {
          bg: 'bg-accent-orange',
          border: 'border-accent-orange',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      case 'examples':
        return {
          bg: 'bg-accent-purple',
          border: 'border-accent-purple',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      case 'synthesis':
        return {
          bg: 'bg-gradient-to-r from-yellow-600 to-amber-600',
          border: 'border-yellow-500',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      default:
        return {
          bg: 'bg-card/80',
          border: 'border-custom',
          text: 'text-white',
          badgeBg: 'bg-slate-700/30',
          badgeText: 'text-slate-300',
          badgeBorder: 'border-slate-600'
        };
    }
  };

  const MessageContent = React.memo(({ message, isThread = false, threadId }: { message: any, isThread?: boolean, threadId?: string }) => {
    const isUser = message.role === 'user';
    
    const handleMouseUp = React.useCallback(() => {
      if (!isUser) {
        handleTextSelection(message.id, isThread, threadId);
      }
    }, [message.id, isThread, threadId, isUser]);
    
    // Check if this message has related threads (for synthesis button)
    const hasRelatedThreads = React.useMemo(() => {
      if (isUser) return false;
      
      if (isThread && threadId) {
        // Check if this thread has child threads
        return threads.some(thread => thread.parentThreadId === threadId);
      } else {
        // Check if this main chat message has threads
        return threads.some(thread => thread.sourceType === 'main' && !thread.parentThreadId);
      }
    }, [isUser, isThread, threadId, threads, message.id]);
    
    return (
      <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
        <div className="flex flex-col items-end gap-2">
          <div
            className={`max-w-4xl px-4 py-3 rounded-lg border ${
              isUser
                ? 'bg-accent-blue/20 text-white border-accent-blue/30 backdrop-blur-sm'
                : 'bg-card/80 text-white cursor-text select-text border-custom backdrop-blur-sm'
            }`}
            onMouseUp={handleMouseUp}
          >
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </div>
            {!isUser && (
              <div className="mt-2 text-xs text-muted opacity-60">
                Select text to create a new thread
              </div>
            )}
          </div>
          
          {/* Synthesis Button - only show for AI messages that have related threads */}
          {hasRelatedThreads && !isUser && (
            <button
              onClick={() => createSynthesisThread(message.id, isThread, threadId)}
              className="bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg flex items-center gap-2 border border-yellow-500/50"
              title="Create a synthesis summary of all related threads"
            >
              <span>🔗</span>
              <span>Synthesize Threads</span>
              <span className="bg-white/20 px-2 py-1 rounded text-xs">
                {threads.filter(thread => {
                  if (isThread && threadId) {
                    return thread.parentThreadId === threadId;
                  } else {
                    return thread.sourceType === 'main' && !thread.parentThreadId;
                  }
                }).length} threads
              </span>
            </button>
          )}
        </div>
      </div>
    );
  });

  const ThreadPanel = ({ thread }: { thread: Thread }) => {
    // Create a dedicated, isolated chat instance for this specific thread
    const threadChat = useThreadChat(selectedModel, thread.id);
    
    // Thread automatically includes context with user messages when they ask questions
    
    // Handle auto-expansion for "Get more details"
    React.useEffect(() => {
      const handleAutoExpand = (event: any) => {
        if (event.detail.threadId === thread.id) {
          const followUpPrompt = `Please provide more details about: "${event.detail.context}"`;
          threadChat.append({
            role: 'user',
            content: followUpPrompt
          });
        }
      };

      window.addEventListener('autoExpandThread', handleAutoExpand);
      return () => window.removeEventListener('autoExpandThread', handleAutoExpand);
    }, [thread.id, threadChat]);
    
    // Handle auto-send for "Simplify this" and "Give examples"
    React.useEffect(() => {
      const handleAutoSend = (event: any) => {
        if (event.detail.threadId === thread.id) {
          console.log(`Auto-sending message to thread ${thread.id}:`, event.detail.message);
          threadChat.append({
            role: 'user',
            content: event.detail.message
          });
        }
      };

      window.addEventListener('autoSendToThread', handleAutoSend);
      return () => window.removeEventListener('autoSendToThread', handleAutoSend);
    }, [thread.id, threadChat]);
    


    // Calculate thread width based on expansion state
    const isExpanded = expandedThread === thread.id;
    const isCollapsed = expandedThread && expandedThread !== thread.id && expandedThread !== 'main';
    const isMainExpanded = expandedThread === 'main';
    
    const threadPanelWidth = isExpanded 
      ? 'flex-1' // Takes most of the thread area
      : isCollapsed 
        ? 'w-80' // Standard size when another thread is expanded
        : isMainExpanded
          ? 'w-80' // Standard size when main is expanded
          : 'flex-1'; // Equal share in balanced view
    
    // Get color scheme based on action type
    const colorScheme = getActionColorScheme(thread.actionType);
    
    return (
      <div className={`${threadPanelWidth} bg-card/60 backdrop-blur border-l-2 border-accent-blue/40 border-r border-custom shadow-lg flex flex-col h-full transition-all duration-300 ${isCollapsed || isMainExpanded ? 'min-w-80' : ''} rounded-lg overflow-hidden`}>
        {/* Thread Header */}
        <div className={`flex-shrink-0 p-3 border-b-2 ${colorScheme.border} ${colorScheme.bg} shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Large, prominent thread number */}
              <div className={`text-2xl font-bold ${colorScheme.badgeText} ${colorScheme.badgeBg} px-3 py-1 rounded-lg border-2 ${colorScheme.badgeBorder} shadow-md`}>
                #{threads.findIndex(t => t.id === thread.id) + 1}
              </div>
              {/* Action label */}
              <h3 className="font-semibold text-white text-sm">{getActionLabel(thread.actionType)}</h3>
              {/* Context Source Information */}
              <span className="font-semibold text-white text-sm">{getContextSource(thread)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleThreadExpansion(thread.id)}
                className={`p-1 rounded-lg hover:bg-hover transition-colors ${
                  isExpanded ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-400 hover:text-white'
                }`}
                title={isExpanded ? 'Collapse thread' : 'Expand thread'}
              >
                <span className="text-xl font-bold">
                  {isExpanded ? '←' : '→'}
                </span>
              </button>
              <button
                onClick={() => closeThread(thread.id)}
                className="text-gray-400 hover:text-accent-red text-lg transition-colors"
              >
                ×
              </button>
            </div>
          </div>
          {thread.selectedContext && (
            <div className="mt-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-gray-200/20 rounded-lg text-xs">
              <div 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                onClick={() => toggleContextCollapse(thread.id)}
              >
                <div className="font-medium text-accent-yellow">Context:</div>
                <button className="text-accent-yellow hover:text-accent-yellow/80 transition-colors">
                  <svg 
                    className={`w-4 h-4 transition-transform duration-200 ${collapsedContexts.has(thread.id) ? 'rotate-180' : 'rotate-0'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {collapsedContexts.has(thread.id) && (
                <div className="px-3 pb-3">
                  <div className="text-accent-yellow/90 italic bg-slate-800/30 p-2 rounded">&quot;{thread.selectedContext}&quot;</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Thread Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-transparent to-slate-900/10 min-h-0">
          {threadChat.messages.length === 0 && (
            <div className="text-center text-muted text-sm py-8">
              <div className="mb-2">💭</div>
              <div className="text-white">Ask a question about the selected context above</div>
              <div className="text-xs text-accent-green mt-3 bg-accent-green/10 px-3 py-2 rounded-lg border border-accent-green/20">
                ✓ Context will be automatically included with your questions
              </div>
            </div>
          )}
          {threadChat.messages.map((message) => (
            <MessageContent key={message.id} message={message} isThread={true} threadId={thread.id} />
          ))}
          {threadChat.isLoading && (
            <div className="flex justify-start">
              <div className="bg-card/80 backdrop-blur-sm p-3 rounded-lg border border-custom">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-accent-blue rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-accent-blue rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-accent-blue rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
          {threadChat.messages.length > 0 && (
            <div className="text-xs text-muted text-center py-2 border-t border-custom mt-4">
              💡 Select any AI response text to create deeper threads
            </div>
          )}
        </div>

        {/* Thread Input */}
        <div className="flex-shrink-0 border-t border-custom p-3 bg-card/40 backdrop-blur-sm">
          <ChatInput 
            isThread={true}
            onSubmit={(e: any) => {
              e.preventDefault();
              if (!threadChat.input.trim()) return;
              
              // Include context with the user's message for better AI understanding
              let messageWithContext = threadChat.input;
              if (thread.selectedContext && threadChat.messages.length <= 1) {
                // Only add context for the first few messages to establish context
                messageWithContext = `Context: "${thread.selectedContext}"

Question: ${threadChat.input}`;
              }
              
              // Send the message with context
              threadChat.append({
                role: 'user',
                content: messageWithContext
              });
              
              // Clear the input
              threadChat.setInput('');
            }}
            input={threadChat.input}
            handleInputChange={threadChat.handleInputChange}
            isLoading={threadChat.isLoading}
            onStop={threadChat.stop}
          />
        </div>
      </div>
    );
  };

  // Add toggle functions for expansion
  const toggleThreadExpansion = (threadId: string | 'main') => {
    if (expandedThread === threadId) {
      // If clicking the already expanded thread, collapse it to balanced view
      setExpandedThread(null);
    } else {
      // Expand the clicked thread
      setExpandedThread(threadId);
    }
  };

  // Toggle row collapse/expand
  const toggleRowCollapse = (rowIndex: number) => {
    setCollapsedRows(prev => {
      const newCollapsed = new Set(prev);
      if (newCollapsed.has(rowIndex)) {
        newCollapsed.delete(rowIndex);
      } else {
        newCollapsed.add(rowIndex);
      }
      return newCollapsed;
    });
  };

  // Toggle context collapse/expand
  const toggleContextCollapse = (threadId: string) => {
    setCollapsedContexts(prev => {
      const newCollapsed = new Set(prev);
      if (newCollapsed.has(threadId)) {
        newCollapsed.delete(threadId);
      } else {
        newCollapsed.add(threadId);
      }
      return newCollapsed;
    });
  };

  // Handle manual resize
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(manualMainWidth || 50); // Default to 50% if no manual width set
    e.preventDefault();
  };

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const containerWidth = window.innerWidth;
    const deltaX = e.clientX - startX;
    const deltaPercent = (deltaX / containerWidth) * 100;
    const newWidth = Math.max(20, Math.min(80, startWidth + deltaPercent)); // Constrain between 20% and 80%
    
    setManualMainWidth(newWidth);
  }, [isResizing, startX, startWidth]);

  const handleMouseUp = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners for resize
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Calculate widths based on expansion state and manual resize
  const getLayoutWidths = () => {
    const hasThreads = threads.length > 0;
    if (!hasThreads) {
      return { mainWidth: 'w-full', threadWidth: 'w-0', mainWidthPercent: 100, threadWidthPercent: 0 };
    }

    // If user has manually resized, use that width (unless thread is expanded)
    if (manualMainWidth !== null && !expandedThread) {
      const mainPercent = Math.round(manualMainWidth);
      const threadPercent = 100 - mainPercent;
      return { 
        mainWidth: `w-[${mainPercent}%]`, 
        threadWidth: `w-[${threadPercent}%]`,
        mainWidthPercent: mainPercent,
        threadWidthPercent: threadPercent
      };
    }

    if (expandedThread === 'main') {
      // Main expanded: main takes ~75%, threads share ~25%
      return { mainWidth: 'w-[75%]', threadWidth: 'w-[25%]', mainWidthPercent: 75, threadWidthPercent: 25 };
    } else if (expandedThread && expandedThread !== 'main') {
      // Specific thread expanded: main takes ~20%, expanded thread gets most of the remaining ~80%
      return { mainWidth: 'w-[20%]', threadWidth: 'w-[80%]', mainWidthPercent: 20, threadWidthPercent: 80 };
    } else {
      // Default view with threads: main takes minimal space (20%), threads get maximum space (80%)
      return { mainWidth: 'w-1/5', threadWidth: 'w-4/5', mainWidthPercent: 20, threadWidthPercent: 80 };
    }
  };

    const { mainWidth, threadWidth, mainWidthPercent, threadWidthPercent } = getLayoutWidths();
  
  // Organize threads into rows
  const getThreadRows = () => {
    const rows: Thread[][] = [];
    const sortedThreads = [...threads].sort((a, b) => (a.rowId || 0) - (b.rowId || 0));
    
    sortedThreads.forEach(thread => {
      const rowId = thread.rowId || 0;
      if (!rows[rowId]) {
        rows[rowId] = [];
      }
      rows[rowId].push(thread);
    });
    
    return rows.filter(row => row.length > 0); // Remove empty rows
  };

  // ThreadRow component to handle a single row of threads
  const ThreadRow = ({ threads: rowThreads, rowIndex }: { threads: Thread[], rowIndex: number }) => {
    const isCollapsed = collapsedRows.has(rowIndex);
    
    if (isCollapsed) {
      // Collapsed view - thin horizontal bar with color indicators and context previews
      return (
        <div className="flex-shrink-0 h-16 bg-card/40 border border-custom rounded-lg transition-all duration-300">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleRowCollapse(rowIndex)}
                className="text-accent-blue hover:text-accent-blue/80 transition-colors"
                title="Expand row"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
              <div className="text-sm text-white font-medium">
                Row {rowIndex + 1}
              </div>
              <div className="flex items-center gap-2">
                {rowThreads.map((thread, idx) => {
                  const colorScheme = getActionColorScheme(thread.actionType);
                  const contextPreview = thread.selectedContext 
                    ? thread.selectedContext.substring(0, 30) + (thread.selectedContext.length > 30 ? '...' : '')
                    : 'No context';
                  
                  return (
                    <div key={thread.id} className="flex items-center gap-1">
                      <div className={`px-2 py-1 rounded-lg ${colorScheme.bg} border ${colorScheme.border} flex items-center gap-1`}>
                        <span className="text-xs text-white font-medium">
                          #{threads.findIndex(t => t.id === thread.id) + 1}
                        </span>
                        <span className="text-xs text-white/80 max-w-24 truncate">
                          {contextPreview}
                        </span>
                      </div>
                      {idx < rowThreads.length - 1 && <span className="text-muted">•</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-muted">
              {rowThreads.length} thread{rowThreads.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      );
    }

    // Expanded view - full thread panels with collapse button
    return (
      <div className="h-full flex flex-col relative">
        {/* Row header with collapse button */}
        <div className="flex-shrink-0 flex items-center justify-between p-2 bg-card/30 backdrop-blur-sm rounded-t-lg border border-custom mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleRowCollapse(rowIndex)}
              className="text-accent-blue hover:text-accent-blue/80 transition-colors"
              title="Collapse row"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
            <span className="text-xs text-white font-medium">
              Row {rowIndex + 1}
            </span>
          </div>
          <div className="text-xs text-muted">
            {rowThreads.length} thread{rowThreads.length !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Thread panels container */}
        <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
          {rowThreads.map((thread) => (
            <ThreadPanel key={thread.id} thread={thread} />
          ))}
        </div>
      </div>
    );
  };

  const threadRows = getThreadRows();
  const hasActiveThreads = threads.length > 0;

  // Resizer component
  const Resizer = () => {
    if (!hasActiveThreads) return null;
    
    return (
      <div
        className={`w-2 bg-accent-blue/20 hover:bg-accent-blue/40 cursor-col-resize transition-colors duration-200 relative group border-l border-r border-accent-blue/30 ${
          isResizing ? 'bg-accent-blue/60' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        {/* Visual indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-0.5 h-12 bg-accent-blue/60 group-hover:bg-accent-blue transition-colors duration-200 rounded-full"></div>
        </div>
        {/* Hover area for easier grabbing */}
        <div className="absolute -left-2 -right-2 inset-y-0"></div>
      </div>
    );
  };

  return (
    <div 
      className="h-full p-4" 
      onClick={(e) => {
        // Only close context menu if clicking outside of it and the preview window
        if (!showContextMenu) return;
        const target = e.target as HTMLElement;
        if (!target.closest('[data-context-menu]') && !target.closest('[data-context-preview]')) {
          setShowContextMenu(false);
        }
      }}
      style={{
        // Preserve text selection styling
        userSelect: showContextMenu ? 'none' : 'auto'
      }}
    >
      <div className={`mx-auto h-full ${hasActiveThreads ? 'max-w-none w-full' : 'max-w-4xl'} bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-2xl overflow-hidden flex`}>
        {/* Main chat area - dynamic width based on expansion state */}
        <div className={`${hasActiveThreads ? mainWidth : 'w-full'} flex flex-col transition-all duration-300 ${hasActiveThreads ? 'border-r-2 border-accent-blue/30 shadow-lg' : 'border-r border-transparent'} ${!hasActiveThreads ? 'rounded-xl' : 'rounded-l-xl'}`}>
          {/* Header with model selector */}
          <div className="border-b border-custom bg-card/80 backdrop-blur-sm p-4">
            <div className="mx-auto max-w-full px-4">
              {hasActiveThreads && (
                <div className="flex items-center justify-end gap-2 mb-4">
                  <button
                    onClick={() => toggleThreadExpansion('main')}
                    className={`p-2 rounded-lg hover:bg-hover transition-colors ${
                      expandedThread === 'main' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-400 hover:text-white'
                    }`}
                    title={expandedThread === 'main' ? 'Collapse main chat' : 'Expand main chat'}
                  >
                    <span className="text-xl font-bold">
                      {expandedThread === 'main' ? '←' : '→'}
                    </span>
                  </button>
                  {manualMainWidth !== null && (
                    <button
                      onClick={() => setManualMainWidth(null)}
                      className="p-1 text-xs bg-accent-orange/20 text-accent-orange hover:bg-accent-orange/30 rounded-lg transition-colors"
                      title="Reset to automatic sizing"
                    >
                      🔄 Reset
                    </button>
                  )}
                </div>
              )}
              
              {/* DeepDive Header */}
              <div className="text-center mb-4 -mt-2 relative">
                <h1 className="text-5xl font-bold text-white tracking-wide">DeepDive</h1>
                
                {/* Sessions Button */}
                <button
                  onClick={() => setShowSessionMenu(true)}
                  className="absolute top-0 right-4 bg-slate-700/80 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg flex items-center gap-2 border border-slate-600/50"
                  title="Manage Sessions"
                >
                  <span>📁</span>
                  <span>Sessions</span>
                  {savedSessions.length > 0 && (
                    <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs min-w-[20px] text-center">
                      {savedSessions.length}
                    </span>
                  )}
                </button>
              </div>
              
              <ModelSelector />
              {hasActiveThreads && (
                <div className="mt-2 text-sm text-muted">
                  💡 Select text in any AI response to create contextual threads - drill deeper into topics!
                </div>
              )}
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-slate-900/20">
            {mainChat.messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-4">💬</div>
                  <h2 className="text-xl font-semibold text-white mb-2">Start a conversation</h2>
                  <p className="text-muted mb-4">Type a message below to begin chatting with AI</p>
                  <div className="text-sm text-gray-400 max-w-md bg-card/40 p-4 rounded-lg border border-custom">
                    <strong className="text-accent-blue">Pro tip:</strong> After getting an AI response, you can select any part of the text and create a new threaded conversation about that specific context!
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto space-y-4 max-w-full p-4">
                {mainChat.messages.map((message) => (
                  <MessageContent key={message.id} message={message} />
                ))}
                {mainChat.isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-card/80 backdrop-blur-sm p-4 rounded-lg max-w-xs border border-custom">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-accent-blue rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-accent-blue rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-accent-blue rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Chat Input */}
          <div className="border-t border-custom bg-card/60 backdrop-blur-sm p-6">
            <div className="mx-auto max-w-full">
              <ChatInput 
                onSubmit={mainChat.handleSubmit}
                input={mainChat.input}
                handleInputChange={mainChat.handleInputChange}
                isLoading={mainChat.isLoading}
                onStop={mainChat.stop}
              />
            </div>
          </div>
        </div>

        {/* Resizer handle */}
        <Resizer />

        {/* Thread Container */}
        {hasActiveThreads && (
          <div className={`${threadWidth} bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden flex flex-col transition-all duration-300 rounded-r-xl`}>
            {/* Thread Header */}
            <div className="flex-shrink-0 bg-card/40 backdrop-blur-sm border-b border-custom">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Threads</h2>
                  <div className="flex items-center gap-3">
                    {collapsedRows.size > 0 && (
                      <span className="text-sm text-muted bg-card/50 px-2 py-1 rounded-lg">
                        {collapsedRows.size} row{collapsedRows.size !== 1 ? 's' : ''} collapsed
                      </span>
                    )}
                    {threads.length > 0 && (
                      <span className="text-sm text-muted bg-card/50 px-2 py-1 rounded-lg">
                        {threads.length} thread{threads.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Thread Rows Container */}
            <div className="flex-1 overflow-hidden p-2">
              <div className="h-full flex flex-col gap-2">
                {threadRows.map((rowThreads, rowIndex) => {
                  const isCollapsed = collapsedRows.has(rowIndex);
                  const expandedRowsCount = threadRows.length - collapsedRows.size;
                  const heightClass = isCollapsed 
                    ? "flex-shrink-0" 
                    : expandedRowsCount > 0 
                      ? `flex-1 min-h-0` 
                      : "flex-1";
                  
                  return (
                    <div key={rowIndex} className={heightClass}>
                      <ThreadRow threads={rowThreads} rowIndex={rowIndex} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Preview Window - Shows selected text */}
      {showContextMenu && (
        <div 
          data-context-preview
          className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-2xl min-w-[300px] max-w-[500px] z-[100000]"
          style={{ 
            left: '50%',
            top: '35%', // Position in upper-middle of screen
            transform: 'translate(-50%, -50%)', // Center both horizontally and vertically
            pointerEvents: 'auto' // Ensure it can be clicked
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()} // Prevent text selection from being cleared
        >
          <div className="px-3 py-2 text-xs text-muted border-b border-slate-600">
            Selected Context
          </div>
          <div className="py-2 px-3 max-h-32 overflow-y-auto">
            <div className="text-sm text-white leading-relaxed">
              "{selectedText}"
            </div>
          </div>
          <div className="px-3 py-2 text-xs text-muted text-center border-t border-slate-600">
            Choose an action below to create a thread with this context
          </div>
        </div>
      )}

      {/* Context Menu - Always rendered at screen center when active */}
      {showContextMenu && (
        <div 
          data-context-menu
          className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-2 min-w-[240px] z-[99999]"
          style={{ 
            left: '50%',
            top: '55%', // Position below the preview window
            transform: 'translate(-50%, -50%)', // Center both horizontally and vertically
            pointerEvents: 'auto' // Ensure it can be clicked
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()} // Prevent text selection from being cleared
        >
          <div className="px-3 py-2 text-xs text-muted border-b border-custom">
            Create new thread from selection
          </div>
          <div className="py-1">
            {[
              {
                action: 'ask',
                icon: '💬',
                label: 'Ask about this',
                onClick: () => createNewThread(selectedText, false, false, 'ask'),
                colorScheme: getActionColorScheme('ask')
              },
              {
                action: 'details',
                icon: '🔍',
                label: 'Get more details',
                onClick: () => createNewThread(selectedText, true, false, 'details'),
                colorScheme: getActionColorScheme('details')
              },
              {
                action: 'simplify',
                icon: '🎯',
                label: 'Simplify this',
                onClick: () => createNewThread(`Please explain this in the simplest terms possible, as if you're teaching it to someone who is completely new to the topic: "${selectedText}"`, false, true, 'simplify'),
                colorScheme: getActionColorScheme('simplify')
              },
              {
                action: 'examples',
                icon: '📝',
                label: 'Give examples',
                onClick: () => createNewThread(`Please provide 3-5 concrete, practical examples that illustrate or relate to: "${selectedText}". Make the examples diverse and easy to understand.`, false, true, 'examples'),
                colorScheme: getActionColorScheme('examples')
              }
            ].map((item) => (
              <button
                key={item.action}
                onClick={item.onClick}
                className={`w-full px-3 py-2 text-left text-sm font-medium transition-all duration-200 flex items-center gap-3 hover:scale-[1.02] ${item.colorScheme.bg}/20 hover:${item.colorScheme.bg}/30 border-l-4 ${item.colorScheme.border} mx-1 my-1 rounded-r-lg`}
              >
                <div className={`w-6 h-6 rounded-full ${item.colorScheme.bg} flex items-center justify-center text-xs`}>
                  {item.icon}
                </div>
                <span className="text-white">{item.label}</span>
                <div className="ml-auto">
                  <div className={`w-3 h-3 rounded-full ${item.colorScheme.bg} opacity-80`}></div>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-custom mt-1 pt-1">
            <button
              onClick={() => setShowContextMenu(false)}
              className="w-full px-4 py-2 text-left hover:bg-hover text-sm text-muted font-medium transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Session Menu */}
      <SessionMenu />
    </div>
  );
} 