'use client';

import { useState, useRef, useEffect } from 'react';
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
  const [selectedModel, setSelectedModel] = useState<ModelProvider>('claude');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedMessageId, setSelectedMessageId] = useState<string>('');
  const [showRerunMenu, setShowRerunMenu] = useState<string | null>(null);
  // Add state for thread expansion
  const [expandedThread, setExpandedThread] = useState<string | 'main' | null>('main');
  // Track which message/thread context menu originated from
  const [contextMenuSource, setContextMenuSource] = useState<{ messageId: string; isFromThread: boolean; threadId?: string }>({ messageId: '', isFromThread: false });
  // Manual resize state
  const [manualMainWidth, setManualMainWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  
  // Store chat instances for each thread - each thread gets its own isolated chat
  const [threadChatInstances, setThreadChatInstances] = useState<{[key: string]: any}>({});

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

  const handleTextSelection = (messageId: string, isFromThread: boolean = false, threadId?: string) => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) {
      setShowContextMenu(false);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 10) return; // Minimum selection length

    setSelectedText(selectedText);
    setSelectedMessageId(messageId);
    setContextMenuSource({ messageId, isFromThread, threadId });
    
    // Get selection position for context menu
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Adjust positioning for thread context menus to avoid going off-screen
    let xPos = rect.left + rect.width / 2;
    let yPos = rect.bottom + 10;
    
    // If we're in a thread, adjust position to stay within bounds
    if (isFromThread) {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Keep context menu within screen bounds
      if (xPos > windowWidth - 250) xPos = windowWidth - 250;
      if (xPos < 50) xPos = 50;
      if (yPos > windowHeight - 200) yPos = rect.top - 120;
    }
    
    setContextMenuPosition({ x: xPos, y: yPos });
    setShowContextMenu(true);
  };

  const createNewThread = (context: string, autoExpand: boolean = false, autoSend: boolean = false) => {
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
      sourceType: sourceType
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
    
    // Close any open menus for this thread
    if (showRerunMenu === threadId) {
      setShowRerunMenu(null);
    }
  };

  const ContextMenu = () => {
    if (!showContextMenu) return null;

    return (
      <div 
        className="fixed z-50 bg-card/95 backdrop-blur-sm border border-custom rounded-lg shadow-xl py-2 min-w-[220px]"
        style={{ left: contextMenuPosition.x - 110, top: contextMenuPosition.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-xs text-muted border-b border-custom">
          Create new thread from selection
        </div>
        <button
          onClick={() => createNewThread(selectedText, false)}
          className="w-full px-4 py-2 text-left hover:bg-hover text-sm text-white font-medium transition-colors duration-200"
        >
          💬 Ask about this
        </button>
        <button
          onClick={() => createNewThread(selectedText, true)}
          className="w-full px-4 py-2 text-left hover:bg-hover text-sm text-white font-medium transition-colors duration-200"
        >
          🔍 Get more details
        </button>
        <button
          onClick={() => createNewThread(`Please explain this in the simplest terms possible, as if you're teaching it to someone who is completely new to the topic: "${selectedText}"`, false, true)}
          className="w-full px-4 py-2 text-left hover:bg-hover text-sm text-white font-medium transition-colors duration-200"
        >
          🎯 Simplify this
        </button>
        <button
          onClick={() => createNewThread(`Please provide 3-5 concrete, practical examples that illustrate or relate to: "${selectedText}". Make the examples diverse and easy to understand.`, false, true)}
          className="w-full px-4 py-2 text-left hover:bg-hover text-sm text-white font-medium transition-colors duration-200"
        >
          📝 Give examples
        </button>
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

  const ChatInput = ({ isThread = false, onSubmit, input, handleInputChange, isLoading }: any) => (
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
    </form>
  );

  const MessageContent = ({ message, isThread = false, threadId }: { message: any, isThread?: boolean, threadId?: string }) => {
    const isUser = message.role === 'user';
    
    return (
      <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} slide-in`}>
        <div
          className={`max-w-4xl px-4 py-3 rounded-lg border transition-all duration-200 ${
            isUser
              ? 'bg-accent-blue/20 text-white border-accent-blue/30 backdrop-blur-sm'
              : 'bg-card/80 text-white cursor-text select-text border-custom hover:bg-card/90 backdrop-blur-sm'
          }`}
          onMouseUp={() => !isUser && handleTextSelection(message.id, isThread, threadId)}
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
      </div>
    );
  };

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
    
    // Function to handle different types of context re-runs
    const handleContextRerun = (type: 'original' | 'different' | 'simplified') => {
      if (!thread.selectedContext) return;
      
      let prompt = '';
      switch (type) {
        case 'original':
          prompt = thread.selectedContext;
          break;
        case 'different':
          prompt = `Please explain this from a different perspective: "${thread.selectedContext}"`;
          break;
        case 'simplified':
          prompt = `Please explain this in the simplest terms possible: "${thread.selectedContext}"`;
          break;
      }
      
      threadChat.append({
        role: 'user',
        content: prompt
      });
    };

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
    
    return (
      <div className={`${threadPanelWidth} bg-card/60 backdrop-blur border-l-2 border-accent-blue/40 border-r border-custom shadow-lg flex flex-col h-full transition-all duration-300 ${isCollapsed || isMainExpanded ? 'min-w-80' : ''} slide-in mx-1`}>
        {/* Thread Header */}
        <div className="p-4 border-b-2 border-accent-blue/30 bg-card/80 backdrop-blur-sm shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-sm">Thread</h3>
              <span className="text-xs bg-accent-blue/20 text-accent-blue px-2 py-1 rounded-full border border-accent-blue/30">
                #{threads.findIndex(t => t.id === thread.id) + 1}
              </span>
              {thread.rowId !== undefined && thread.rowId > 0 && (
                <span className="text-xs bg-accent-purple/20 text-accent-purple px-2 py-1 rounded-full border border-accent-purple/30">
                  Row {thread.rowId + 1}
                </span>
              )}
              <span className="text-xs text-muted">
                ID: {thread.id.split('-').pop()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleThreadExpansion(thread.id)}
                className={`p-1 rounded-lg hover:bg-hover transition-colors ${
                  isExpanded ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-400 hover:text-white'
                }`}
                title={isExpanded ? 'Collapse thread' : 'Expand thread'}
              >
                {isExpanded ? '📖' : '📑'}
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
            <div className="mt-2 p-3 bg-accent-yellow/10 border border-accent-yellow/20 rounded-lg text-xs backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-accent-yellow">Context:</div>
                <div className="relative">
                  <button
                    onClick={() => setShowRerunMenu(showRerunMenu === thread.id ? null : thread.id)}
                    className="text-accent-yellow hover:text-accent-yellow/80 text-xs px-2 py-1 bg-accent-yellow/20 hover:bg-accent-yellow/30 rounded-lg transition-colors flex items-center gap-1 border border-accent-yellow/30"
                    title="Re-run this context"
                  >
                    🔄 Re-run <span className="text-xs">▼</span>
                  </button>
                  {showRerunMenu === thread.id && (
                    <div 
                      className="absolute right-0 top-full mt-1 bg-card/90 backdrop-blur border border-custom rounded-lg shadow-xl py-1 min-w-[180px] z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          handleContextRerun('original');
                          setShowRerunMenu(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-hover text-xs text-white transition-colors"
                      >
                        🔄 Re-run original
                      </button>
                      <button
                        onClick={() => {
                          handleContextRerun('different');
                          setShowRerunMenu(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-hover text-xs text-white transition-colors"
                      >
                        🔀 Different perspective
                      </button>
                      <button
                        onClick={() => {
                          handleContextRerun('simplified');
                          setShowRerunMenu(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-hover text-xs text-white transition-colors"
                      >
                        🎯 Simplified version
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-accent-yellow/90 italic">"{thread.selectedContext}"</div>
            </div>
          )}
        </div>

        {/* Thread Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-transparent to-slate-900/10">
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
        <div className="border-t border-custom p-4 bg-card/40 backdrop-blur-sm">
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
      // Balanced view: main takes 50%, threads share 50%
      return { mainWidth: 'w-1/2', threadWidth: 'w-1/2', mainWidthPercent: 50, threadWidthPercent: 50 };
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
    return (
      <div className="flex flex-1 min-h-0">
        {rowThreads.map((thread) => (
          <ThreadPanel key={thread.id} thread={thread} />
        ))}
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
      className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" 
      onClick={() => {
        setShowContextMenu(false);
        setShowRerunMenu(null);
      }}
    >
      {/* Main chat area - dynamic width based on expansion state */}
      <div className={`${hasActiveThreads ? mainWidth : 'w-full'} flex flex-col transition-all duration-300 ${hasActiveThreads ? 'border-r-2 border-accent-blue/30 shadow-lg' : 'border-r border-transparent'}`}>
        {/* Header with model selector */}
        <div className="border-b border-custom bg-card/80 backdrop-blur-sm p-4">
          <div className={`mx-auto ${expandedThread && expandedThread !== 'main' ? 'max-w-full px-2' : 'max-w-4xl'} transition-all duration-300`}>
            <div className="flex items-center justify-between mb-4">
              <h1 className={`font-bold text-white ${expandedThread && expandedThread !== 'main' ? 'text-lg' : 'text-2xl'} transition-all duration-300`}>
                {expandedThread && expandedThread !== 'main' ? 'Main Chat' : 'AI Chat with Contextual Threading'}
              </h1>
              {hasActiveThreads && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleThreadExpansion('main')}
                    className={`p-2 rounded-lg hover:bg-hover transition-colors ${
                      expandedThread === 'main' ? 'bg-accent-blue/20 text-accent-blue' : 'text-gray-400 hover:text-white'
                    }`}
                    title={expandedThread === 'main' ? 'Collapse main chat' : 'Expand main chat'}
                  >
                    {expandedThread === 'main' ? '📖' : '📑'}
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
            </div>
            <ModelSelector />
            {hasActiveThreads && (
              <div className="mt-2 text-sm text-muted">
                💡 Select text in any AI response to create contextual threads - drill deeper into topics!
                {threadRows.length > 1 && (
                  <div className="mt-1 text-xs text-accent-purple bg-accent-purple/10 px-3 py-2 rounded-lg border border-accent-purple/20">
                    📚 Multi-row layout active - {threadRows.length} rows of threads
                  </div>
                )}
                {manualMainWidth !== null && !expandedThread && (
                  <div className="mt-1 text-xs text-accent-orange bg-accent-orange/10 px-3 py-2 rounded-lg border border-accent-orange/20">
                    📏 Manual width: {Math.round(manualMainWidth)}% main, {100 - Math.round(manualMainWidth)}% threads
                  </div>
                )}
                {expandedThread === 'main' && (
                  <div className="mt-1 text-xs text-accent-blue bg-accent-blue/10 px-3 py-2 rounded-lg border border-accent-blue/20">
                    🔍 Main chat expanded (75% width) for easier reading
                  </div>
                )}
                {expandedThread && expandedThread !== 'main' && (
                  <div className="mt-1 text-xs text-accent-green bg-accent-green/10 px-3 py-2 rounded-lg border border-accent-green/20">
                    🔍 Thread #{threads.findIndex(t => t.id === expandedThread) + 1} expanded - Main chat minimized to 20%
                  </div>
                )}
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
            <div className={`mx-auto space-y-4 transition-all duration-300 ${
              expandedThread && expandedThread !== 'main' 
                ? 'max-w-full p-2' 
                : hasActiveThreads 
                  ? 'max-w-full p-4' 
                  : 'max-w-4xl p-4'
            }`}>
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
          <div className={`mx-auto transition-all duration-300 ${
            expandedThread && expandedThread !== 'main' 
              ? 'max-w-full px-2' 
              : hasActiveThreads 
                ? 'max-w-full' 
                : 'max-w-4xl'
          }`}>
            <ChatInput 
              onSubmit={mainChat.handleSubmit}
              input={mainChat.input}
              handleInputChange={mainChat.handleInputChange}
              isLoading={mainChat.isLoading}
            />
          </div>
        </div>
      </div>

      {/* Resizer handle */}
      <Resizer />

      {/* Thread panels - dynamic width with multi-row support */}
      {hasActiveThreads && (
        <div className={`${threadWidth} flex flex-col transition-all duration-300 p-2 space-y-2`}>
          {threadRows.map((rowThreads, rowIndex) => (
            <div key={rowIndex} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 flex min-h-0">
                {rowThreads.map((thread) => (
                  <ThreadPanel key={thread.id} thread={thread} />
                ))}
              </div>
              {/* Row separator for visual clarity */}
              {rowIndex < threadRows.length - 1 && (
                <div className="h-1 bg-card/40 border-t border-custom">
                  <div className="h-full bg-gradient-to-r from-transparent via-accent-blue/30 to-transparent"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Context Menu */}
      <ContextMenu />
    </div>
  );
} 