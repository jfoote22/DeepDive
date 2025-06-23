'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useChat } from 'ai/react';
import React from 'react';

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
  actionType?: 'ask' | 'details' | 'simplify' | 'examples' | 'links' | 'videos'; // Track which context action was used
}

type ModelProvider = 'openai' | 'claude' | 'anthropic';

// Custom hook for thread chat instances - creates isolated chat for each thread
function useThreadChat(selectedModel: ModelProvider, threadId: string, initialMessages?: Message[]) {
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

  // Convert our Message format to the format expected by useChat
  const formattedInitialMessages = initialMessages?.map(msg => ({
    id: msg.id,
    content: msg.content,
    role: msg.role as 'user' | 'assistant',
  })) || [];

  // Create a unique chat instance for this specific thread
  return useChat({
    id: `thread-${threadId}`, // Unique ID ensures complete isolation
    api: getApiEndpoint(selectedModel),
    initialMessages: formattedInitialMessages,
    onError: (error) => {
      console.error(`Thread ${threadId} chat error:`, error);
    },
  });
}

const ThreadedChat = forwardRef<any, {}>((props, ref) => {
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
  // Fullscreen state for threads
  const [fullscreenThread, setFullscreenThread] = useState<string | null>(null);
  
  // Store chat instances for each thread - each thread gets its own isolated chat
  const [threadChatInstances, setThreadChatInstances] = useState<{[key: string]: any}>({});
  
  // Track messages that need to be loaded into thread chat instances
  const [threadMessagesToLoad, setThreadMessagesToLoad] = useState<{[key: string]: Message[]}>({});

  // Store references to thread chat instances for copying
  const threadChatRefs = useRef<{[key: string]: any}>({});

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

  // Function to expand all collapsed rows
  const expandAllRows = () => {
    const threadRowsData = getThreadRows();
    const allRowIndices = threadRowsData.map((_, index) => index);
    
    // Clear all collapsed rows (expand everything)
    setCollapsedRows(new Set());
  };

  // Function to copy all AI responses to clipboard
  const copyAllAIResponses = async () => {
    try {
      // First, expand all rows to ensure all threads are visible
      const hadCollapsedRows = collapsedRows.size > 0;
      if (hadCollapsedRows) {
        expandAllRows();
        // Wait a moment for the UI to update and render all threads
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      let allResponses = '';
      
      // Add main chat AI responses
      const mainAIResponses = mainChat.messages.filter(msg => msg.role === 'assistant');
      if (mainAIResponses.length > 0) {
        allResponses += '=== MAIN CHAT RESPONSES ===\n\n';
        mainAIResponses.forEach((msg, index) => {
          allResponses += `[Main Response ${index + 1}]\n${msg.content}\n\n`;
        });
      }
      
      // Add thread AI responses - now all should be rendered and accessible
      if (threads.length > 0) {
        allResponses += '=== THREAD RESPONSES ===\n\n';
        
        threads.forEach((thread, threadIndex) => {
          // Find rendered messages in the DOM for this thread
          const threadElement = document.querySelector(`[data-thread-id="${thread.id}"]`);
          if (threadElement) {
            const assistantMessages = threadElement.querySelectorAll('[data-role="assistant"]');
            
            if (assistantMessages.length > 0) {
              allResponses += `--- Thread ${threadIndex + 1}: ${thread.title || 'Untitled'} ---\n`;
              if (thread.selectedContext) {
                allResponses += `Context: "${thread.selectedContext}"\n\n`;
              }
              
              assistantMessages.forEach((msgElement, msgIndex) => {
                const content = msgElement.textContent || '';
                if (content.trim()) {
                  // Remove the "Select text to create a new thread" text that appears at the end
                  const cleanContent = content.replace(/Select text to create a new thread$/, '').trim();
                  if (cleanContent) {
                    allResponses += `[Thread ${threadIndex + 1} Response ${msgIndex + 1}]\n${cleanContent}\n\n`;
                  }
                }
              });
            } else {
              // Thread exists but has no messages yet
              allResponses += `--- Thread ${threadIndex + 1}: ${thread.title || 'Untitled'} ---\n`;
              if (thread.selectedContext) {
                allResponses += `Context: "${thread.selectedContext}"\n\n`;
              }
              allResponses += `[Thread ${threadIndex + 1}] No AI responses yet - conversation not started.\n\n`;
            }
          }
        });
      }
      
      if (allResponses.trim() === '' || allResponses.trim() === '=== MAIN CHAT RESPONSES ===') {
        allResponses = 'No AI responses found to copy. Make sure you have had conversations with the AI first.';
      }
      
      // Copy to clipboard
      await navigator.clipboard.writeText(allResponses);
      
      // Show success feedback with more details
      const threadCount = threads.length;
      const mainResponseCount = mainChat.messages.filter(msg => msg.role === 'assistant').length;
      console.log('All AI responses copied to clipboard!');
      
      const expandMessage = hadCollapsedRows ? '\n\n✨ Auto-expanded all collapsed rows to access all responses!' : '';
      alert(`Copied to clipboard!\n- Main chat: ${mainResponseCount} responses\n- Threads: ${threadCount} threads${expandMessage}`);
      
    } catch (error) {
      console.error('Failed to copy responses:', error);
      alert('Failed to copy responses. Please try again.');
    }
  };

  // Function to get current state for saving
  const getCurrentState = () => {
    // Collect messages from all thread chat instances
    const threadsWithMessages = threads.map(thread => {
      const threadChatInstance = threadChatRefs.current[thread.id];
      let currentMessages = thread.messages || [];
      
      // If we have a live chat instance, get its current messages
      if (threadChatInstance && threadChatInstance.messages) {
        currentMessages = threadChatInstance.messages.map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          timestamp: msg.timestamp || Date.now(),
        }));
      }
      
      return {
        ...thread,
        messages: currentMessages,
      };
    });

    console.log('📊 getCurrentState - Thread message counts:', 
      threadsWithMessages.map(t => ({ id: t.id, messageCount: t.messages.length }))
    );

    return {
      mainMessages: mainChat.messages,
      threads: threadsWithMessages,
      selectedModel: selectedModel,
      activeThreadId: activeThreadId,
    };
  };

  // Function to load state from saved deep dive
  const loadState = (state: any) => {
    console.log('🔄 Loading deep dive state...', {
      title: state.title || 'Unknown',
      mainMessagesCount: state.mainMessages?.length || 0,
      threadsCount: state.threads?.length || 0,
      selectedModel: state.selectedModel
    });

    try {
      // Clear current state first
      clearAllAndStartFresh();
      
      // Wait a bit for the clear to take effect
      setTimeout(() => {
        // Set model first
        setSelectedModel(state.selectedModel || 'anthropic');
        
        // Set threads - ensure they have all required properties
        const loadedThreads = (state.threads || []).map((thread: any) => ({
          id: thread.id || `thread-${Date.now()}-${Math.random()}`,
          messages: thread.messages || [],
          selectedContext: thread.selectedContext || '',
          title: thread.title || 'Untitled Thread',
          rowId: thread.rowId || 0,
          sourceType: thread.sourceType || 'main',
          actionType: thread.actionType || 'ask',
          parentThreadId: thread.parentThreadId || undefined,
        }));
        
        // Store thread messages to be loaded into chat instances when they're ready
        const messagesToLoad: {[key: string]: Message[]} = {};
        loadedThreads.forEach((thread: Thread) => {
          if (thread.messages && thread.messages.length > 0) {
            messagesToLoad[thread.id] = thread.messages;
          }
        });
        setThreadMessagesToLoad(messagesToLoad);
        
        setThreads(loadedThreads);
        
        // Set active thread
        setActiveThreadId(state.activeThreadId || null);
        
        // Load main chat messages - try different approaches
        if (state.mainMessages && state.mainMessages.length > 0) {
          console.log('📧 Loading main chat messages:', state.mainMessages.length);
          
          // Try the setMessages method if it exists
          if (mainChat.setMessages && typeof mainChat.setMessages === 'function') {
            console.log('✅ Using setMessages method');
            mainChat.setMessages(state.mainMessages);
          } else {
            console.warn('⚠️ setMessages method not available on useChat hook');
            // Alternative approach: We'll need to manually populate the messages
            // This is a limitation - the useChat hook may not support direct message setting
            console.log('ℹ️ Note: Messages may not load directly due to useChat limitations');
            console.log('💡 Consider refreshing the conversation or manually re-asking questions');
          }
        }
        
        // Reset UI state
        setExpandedThread('main');
        setCollapsedRows(new Set());
        setCollapsedContexts(new Set());
        setManualMainWidth(null);
        
        // Clear context menu
        setShowContextMenu(false);
        setSelectedText('');
        setSelectedMessageId('');
        
        console.log('✅ Deep dive state loaded successfully');
      }, 100);
      
    } catch (error) {
      console.error('❌ Error loading deep dive state:', error);
      throw error;
    }
  };

  // Function to clear all threads and main chat for a fresh start
  const clearAllAndStartFresh = () => {
    // Clear all threads
    setThreads([]);
    
    // Clear active thread
    setActiveThreadId(null);
    
    // Clear main chat messages
    mainChat.setMessages([]);
    
    // Clear any stored thread chat instances
    setThreadChatInstances({});
    
    // Clear thread messages to load
    setThreadMessagesToLoad({});
    
    // Clear thread chat references
    threadChatRefs.current = {};
    
    // Reset UI state
    setExpandedThread('main');
    setCollapsedRows(new Set());
    setCollapsedContexts(new Set());
    setManualMainWidth(null);
    
    // Clear context menu
    setShowContextMenu(false);
    setSelectedText('');
    setSelectedMessageId('');
    
    console.log('🧹 Cleared all threads and main chat - fresh start!');
  };

  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    copyAllAIResponses,
    clearAllAndStartFresh,
    getCurrentState,
    loadState,
  }));

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

  const createNewThread = (context: string, autoExpand: boolean = false, autoSend: boolean = false, actionType: 'ask' | 'details' | 'simplify' | 'examples' | 'links' | 'videos' = 'ask') => {
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
      
      // If this is the first thread being created, collapse the main chat and expand this thread
      if (prev.length === 0) {
        setExpandedThread(newThreadId);
      }
      
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
    
    // If this was the fullscreen thread, reset fullscreen
    if (fullscreenThread === threadId) {
      setFullscreenThread(null);
    }

  };

  const ContextMenu = () => {
    if (!showContextMenu) return null;

    // Context menu buttons in the requested order: Get more details (Green), Get links (Blue), Get videos (Yellow), Give examples (Purple), Simplify this (Orange), Ask about this (Cyan)
    const menuItems = [
      {
        action: 'details',
        icon: '🔍',
        label: 'Get more details',
        onClick: () => createNewThread(selectedText, true, false, 'details'),
        colorScheme: getActionColorScheme('details')
      },
      {
        action: 'links',
        icon: '🔗',
        label: 'Get links',
        onClick: () => createNewThread(`Please provide relevant links and resources related to: "${selectedText}". Include authoritative sources, documentation, articles, and useful websites that would help someone learn more about this topic.`, false, true, 'links'),
        colorScheme: getActionColorScheme('links')
      },
      {
        action: 'videos',
        icon: '🎥',
        label: 'Get videos',
        onClick: () => createNewThread(`Please suggest relevant YouTube videos, tutorials, and video content related to: "${selectedText}". Include educational videos, tutorials, documentaries, and other video resources that would help understand this topic better.`, false, true, 'videos'),
        colorScheme: getActionColorScheme('videos')
      },
      {
        action: 'examples',
        icon: '📝',
        label: 'Give examples',
        onClick: () => createNewThread(`Please provide 3-5 concrete, practical examples that illustrate or relate to: "${selectedText}". Make the examples diverse and easy to understand.`, false, true, 'examples'),
        colorScheme: getActionColorScheme('examples')
      },
      {
        action: 'simplify',
        icon: '🎯',
        label: 'Simplify this',
        onClick: () => createNewThread(`Please explain this in the simplest terms possible, as if you're teaching it to someone who is completely new to the topic: "${selectedText}"`, false, true, 'simplify'),
        colorScheme: getActionColorScheme('simplify')
      },
      {
        action: 'ask',
        icon: '💬',
        label: 'Ask about this',
        onClick: () => createNewThread(selectedText, false, false, 'ask'),
        colorScheme: getActionColorScheme('ask')
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

  const handleMainSubmit = (e: any) => {
    e.preventDefault();
    if (!mainChat.input.trim()) return;
    // Append the user message to the main chat (identical to thread behavior)
    mainChat.append({
      role: 'user',
      content: mainChat.input.trim(),
    });
    // Clear the input after sending
    mainChat.setInput('');
  };

  const ChatInput = ({ isThread = false, onSubmit, input, handleInputChange, isLoading, threadChat }: any) => {
    const [localInput, setLocalInput] = useState('');

    const handleSubmit = (e: any) => {
      e.preventDefault();
      if (!localInput.trim()) return;
      
      if (!isThread && mainChat) {
        // Main chat submission
        mainChat.append({
          role: 'user',
          content: localInput.trim()
        });
      } else if (isThread && threadChat) {
        // Thread chat submission - use the thread's chat instance
        threadChat.append({
          role: 'user',
          content: localInput.trim()
        });
      }
      setLocalInput('');
    };

    return (
      <form onSubmit={handleSubmit} className="w-full flex gap-2">
        <input 
          type="text"
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          className="flex-1 p-4 bg-white text-black border border-gray-300"
          placeholder={isThread ? "Ask about the selected context..." : "Type a message"}
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className="px-4 bg-blue-500 text-white disabled:bg-gray-400"
          disabled={isLoading || !localInput.trim()}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
    );
  };

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
      case 'links':
        return 'Get links';
      case 'videos':
        return 'Get videos';
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
          bg: 'bg-cyan-500',
          border: 'border-cyan-500',
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
      case 'links':
        return {
          bg: 'bg-accent-blue',
          border: 'border-accent-blue',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      case 'videos':
        return {
          bg: 'bg-accent-yellow',
          border: 'border-accent-yellow',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
      default:
        return {
          bg: 'bg-muted',
          border: 'border-custom',
          text: 'text-white',
          badgeBg: 'bg-white/20',
          badgeText: 'text-white',
          badgeBorder: 'border-white/30'
        };
    }
  };

  // Utility function to convert URLs in text to clickable links
  const linkifyText = (text: string) => {
    // Regular expression to match URLs
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;
    
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // Ensure the URL has a protocol
        let href = part;
        if (!part.startsWith('http://') && !part.startsWith('https://')) {
          href = part.startsWith('www.') ? `https://${part}` : `https://${part}`;
        }
        
        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline transition-colors duration-200"
            onClick={(e) => e.stopPropagation()} // Prevent text selection when clicking links
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const MessageContent = React.memo(({ message, isThread = false, threadId }: { message: any, isThread?: boolean, threadId?: string }) => {
    const isUser = message.role === 'user';
    
    const handleMouseUp = React.useCallback(() => {
      if (!isUser) {
        handleTextSelection(message.id, isThread, threadId);
      }
    }, [message.id, isThread, threadId, isUser]);
    
    return (
      <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`max-w-4xl px-4 py-3 rounded-lg border ${
            isUser
              ? 'bg-accent-blue/20 text-white border-accent-blue/30 backdrop-blur-sm'
              : 'bg-card/80 text-white cursor-text select-text border-custom backdrop-blur-sm'
          }`}
          onMouseUp={handleMouseUp}
          data-role={message.role}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {linkifyText(message.content)}
          </div>
          {!isUser && (
            <div className="mt-2 text-xs text-muted opacity-60">
              Select text to create a new thread
            </div>
          )}
        </div>
      </div>
    );
  });
  MessageContent.displayName = 'MessageContent';

  const ThreadPanel = ({ thread }: { thread: Thread }) => {
    // Get initial messages for this thread if available
    const initialMessages = threadMessagesToLoad[thread.id] || thread.messages || [];
    
    // Create a dedicated, isolated chat instance for this specific thread with initial messages
    const threadChat = useThreadChat(selectedModel, thread.id, initialMessages);
    
    // Store the thread chat instance reference for accessing messages during save
    React.useEffect(() => {
      threadChatRefs.current[thread.id] = threadChat;
      
      // Cleanup when thread is unmounted
      return () => {
        delete threadChatRefs.current[thread.id];
      };
    }, [thread.id, threadChat]);
    
    // Clear the messages from loading queue when thread is rendered with initial messages
    React.useEffect(() => {
      if (threadMessagesToLoad[thread.id] && threadMessagesToLoad[thread.id].length > 0) {
        console.log(`✅ Thread ${thread.id} initialized with ${threadMessagesToLoad[thread.id].length} messages`);
        
        // Clear the messages from the loading queue since they're now loaded via initialMessages
        setThreadMessagesToLoad(prev => {
          const updated = { ...prev };
          delete updated[thread.id];
          return updated;
        });
      }
    }, [thread.id]);
    
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
    


    // Calculate thread width based on expansion state and fullscreen mode
    const isExpanded = expandedThread === thread.id;
    const isCollapsed = expandedThread && expandedThread !== thread.id && expandedThread !== 'main';
    const isMainExpanded = expandedThread === 'main';
    const isFullscreen = fullscreenThread === thread.id;
    
    const threadPanelWidth = isFullscreen
      ? 'w-full' // Fullscreen thread takes entire thread area
      : isExpanded 
        ? 'flex-1' // Takes most of the thread area
        : isCollapsed 
          ? 'w-80' // Standard size when another thread is expanded
          : isMainExpanded
            ? 'w-80' // Standard size when main is expanded
            : 'flex-1'; // Equal share in balanced view
    
    // Get color scheme based on action type
    const colorScheme = getActionColorScheme(thread.actionType);
    
    return (
      <div 
        className={`${threadPanelWidth} bg-card/60 backdrop-blur border-l-2 border-accent-blue/40 border-r border-custom shadow-lg flex flex-col h-full transition-all duration-300 ${isCollapsed || isMainExpanded ? 'min-w-80' : ''} rounded-lg overflow-hidden`}
        data-thread-id={thread.id}
      >
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
                onClick={() => toggleThreadFullscreen(thread.id)}
                className={`p-1 rounded-lg hover:bg-hover transition-colors ${
                  fullscreenThread === thread.id ? 'bg-accent-green/20 text-accent-green' : 'text-gray-400 hover:text-white'
                }`}
                title={fullscreenThread === thread.id ? 'Exit fullscreen' : 'Fullscreen thread'}
              >
                <span className="text-xl font-bold">
                  {fullscreenThread === thread.id ? '⊡' : '⊞'}
                </span>
              </button>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7m7 7V3" />
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
            <MessageContent 
              key={message.id} 
              message={message} 
              isThread={true}
              threadId={thread.id}
            />
          ))}
        </div>

        {/* Thread Input */}
        <div className="flex-shrink-0 p-3 bg-gradient-to-t from-slate-900/40 to-transparent border-t border-custom">
          <ChatInput
            isThread={true}
            input={threadChat.input}
            handleInputChange={threadChat.handleInputChange}
            isLoading={threadChat.isLoading}
            threadChat={threadChat}
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

  // Toggle thread fullscreen mode
  const toggleThreadFullscreen = (threadId: string) => {
    setFullscreenThread(prev => prev === threadId ? null : threadId);
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

  // Expanded view - full thread panels with collapse button
  const expandRow = (rowIndex: number) => {
    // Get all row indices except the current one
    const allRowIndices = getThreadRows().map((_, index) => index);
    const otherRowIndices = allRowIndices.filter(index => index !== rowIndex);
    
    // Collapse all other rows and expand the current one
    setCollapsedRows(new Set(otherRowIndices));
  };

  const closeRow = (rowThreads: Thread[]) => {
    // Get all thread IDs from the threads passed to this row
    const threadIds = rowThreads.map(t => t.id);
    
    // Close each thread in the row
    threadIds.forEach(threadId => {
      closeThread(threadId);
    });
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
            <button
              onClick={() => expandRow(rowIndex)}
              className="text-accent-green hover:text-accent-green/80 transition-colors"
              title="Expand this row and collapse others"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <span className="text-xs text-white font-medium">
              Row {rowIndex + 1}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-muted">
              {rowThreads.length} thread{rowThreads.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={() => closeRow(rowThreads)}
              className="text-gray-400 hover:text-accent-red transition-colors"
              title="Close all threads in this row"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Thread panels container */}
        <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
          {rowThreads
            .filter(thread => {
              // If any thread in this row is fullscreen, only show that thread
              const hasFullscreenInRow = rowThreads.some(t => fullscreenThread === t.id);
              return hasFullscreenInRow ? fullscreenThread === thread.id : true;
            })
            .map((thread) => (
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
              <div className="text-center mb-4 -mt-2">
                <h1 className="text-5xl font-bold text-white tracking-wide">DeepDive</h1>
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
                onSubmit={handleMainSubmit}
                input={mainChat.input}
                handleInputChange={mainChat.handleInputChange}
                isLoading={mainChat.isLoading}
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
                {threadRows
                  .filter((rowThreads, rowIndex) => {
                    // If any thread is fullscreen, only show the row containing that thread
                    if (fullscreenThread) {
                      return rowThreads.some(thread => thread.id === fullscreenThread);
                    }
                    return true;
                  })
                  .map((rowThreads, rowIndex) => {
                    const isCollapsed = collapsedRows.has(rowIndex);
                    const visibleRows = threadRows.filter((_, idx) => {
                      if (fullscreenThread) {
                        return threadRows[idx].some(thread => thread.id === fullscreenThread);
                      }
                      return true;
                    });
                    const expandedRowsCount = visibleRows.length - collapsedRows.size;
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
              &quot;{selectedText}&quot;
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
                onClick: () => createNewThread(`Please explain this in the simplest terms possible, as if you're teaching it to someone who is completely new to the topic: &quot;${selectedText}&quot;`, false, true, 'simplify'),
                colorScheme: getActionColorScheme('simplify')
              },
              {
                action: 'examples',
                icon: '📝',
                label: 'Give examples',
                onClick: () => createNewThread(`Please provide 3-5 concrete, practical examples that illustrate or relate to: &quot;${selectedText}&quot;. Make the examples diverse and easy to understand.`, false, true, 'examples'),
                colorScheme: getActionColorScheme('examples')
              },
              {
                action: 'links',
                icon: '🔗',
                label: 'Get links',
                onClick: () => createNewThread(`Please provide relevant links and resources related to: "${selectedText}". Include authoritative sources, documentation, articles, and useful websites that would help someone learn more about this topic.`, false, true, 'links'),
                colorScheme: getActionColorScheme('links')
              },
              {
                action: 'videos',
                icon: '🎥',
                label: 'Get videos',
                onClick: () => createNewThread(`Please suggest relevant YouTube videos, tutorials, and video content related to: "${selectedText}". Include educational videos, tutorials, documentaries, and other video resources that would help understand this topic better.`, false, true, 'videos'),
                colorScheme: getActionColorScheme('videos')
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
    </div>
  );
});

ThreadedChat.displayName = 'ThreadedChat';

export default ThreadedChat; 