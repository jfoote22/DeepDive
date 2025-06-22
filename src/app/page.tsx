'use client';

import { useRef } from 'react';
import ThreadedChat from "../components/ThreadedChat";

export default function Home() {
  const threadedChatRef = useRef<any>(null);

  const handleCopyAllResponses = () => {
    if (threadedChatRef.current) {
      threadedChatRef.current.copyAllAIResponses();
    }
  };

  const handleClearAll = () => {
    if (confirm('🧹 Clear all conversations and threads?\n\nThis will permanently delete:\n• Main chat conversation\n• All threads and their messages\n• All contexts and selections\n\nThis cannot be undone.')) {
      if (threadedChatRef.current) {
        threadedChatRef.current.clearAllAndStartFresh();
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      {/* Thin Header */}
      <header className="w-full bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">AI Chat with Contextual Threading</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearAll}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg flex items-center gap-2"
            title="Clear all conversations and start fresh"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear All
          </button>
          <button
            onClick={handleCopyAllResponses}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg flex items-center gap-2"
            title="Copy all AI responses to clipboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            Copy All Responses
          </button>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="h-[calc(100vh-60px)]"> {/* Subtract header height */}
        <ThreadedChat ref={threadedChatRef} />
      </div>
    </div>
  );
}
