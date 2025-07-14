import React, { useState, useEffect } from 'react';

interface LearningSnippet {
  id: string;
  text: string;
  timestamp: number;
  source: string;
}

interface Thread {
  id: string;
  title: string;
  messages: any[];
  selectedContext?: string;
}

interface ChatState {
  mainMessages: any[];
  threads: Thread[];
  learningSnippets: LearningSnippet[];
  selectedModel: string;
  activeThreadId: string | null;
  uiState: any;
}

interface LearningContentSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (selections: ContentSelections) => void;
  onSave?: () => void; // Optional save function
  chatState: ChatState | null;
}

interface ContentSelections {
  includeMainThread: boolean;
  includeAllThreads: boolean;
  includeAllSnippets: boolean;
  selectedThreadIds: string[];
  selectedSnippetIds: string[];
}

const LearningContentSelector: React.FC<LearningContentSelectorProps> = ({
  isOpen,
  onClose,
  onGenerate,
  onSave,
  chatState
}) => {
  const [selections, setSelections] = useState<ContentSelections>({
    includeMainThread: true,
    includeAllThreads: true,
    includeAllSnippets: true,
    selectedThreadIds: [],
    selectedSnippetIds: []
  });

  // Initialize selected IDs when chat state changes
  useEffect(() => {
    if (chatState) {
      setSelections(prev => ({
        ...prev,
        selectedThreadIds: chatState.threads.map(t => t.id),
        selectedSnippetIds: chatState.learningSnippets?.map(s => s.id) || []
      }));
    }
  }, [chatState]);

  // Handle "Include All Threads" toggle
  const handleAllThreadsToggle = (include: boolean) => {
    setSelections(prev => ({
      ...prev,
      includeAllThreads: include,
      selectedThreadIds: include ? (chatState?.threads.map(t => t.id) || []) : []
    }));
  };

  // Handle "Include All Snippets" toggle
  const handleAllSnippetsToggle = (include: boolean) => {
    setSelections(prev => ({
      ...prev,
      includeAllSnippets: include,
      selectedSnippetIds: include ? (chatState?.learningSnippets?.map(s => s.id) || []) : []
    }));
  };

  // Handle individual thread selection
  const handleThreadToggle = (threadId: string, isSelected: boolean) => {
    setSelections(prev => {
      const newSelectedThreadIds = isSelected 
        ? [...prev.selectedThreadIds, threadId]
        : prev.selectedThreadIds.filter(id => id !== threadId);
      
      return {
        ...prev,
        selectedThreadIds: newSelectedThreadIds,
        includeAllThreads: newSelectedThreadIds.length === (chatState?.threads.length || 0)
      };
    });
  };

  // Handle individual snippet selection
  const handleSnippetToggle = (snippetId: string, isSelected: boolean) => {
    setSelections(prev => {
      const newSelectedSnippetIds = isSelected 
        ? [...prev.selectedSnippetIds, snippetId]
        : prev.selectedSnippetIds.filter(id => id !== snippetId);
      
      return {
        ...prev,
        selectedSnippetIds: newSelectedSnippetIds,
        includeAllSnippets: newSelectedSnippetIds.length === (chatState?.learningSnippets?.length || 0)
      };
    });
  };

  const handleGenerate = () => {
    onGenerate(selections);
  };

  const hasContent = () => {
    return selections.includeMainThread || 
           selections.selectedThreadIds.length > 0 || 
           selections.selectedSnippetIds.length > 0;
  };

  const getContentSummary = () => {
    const parts = [];
    if (selections.includeMainThread) parts.push("Main conversation");
    if (selections.selectedThreadIds.length > 0) {
      parts.push(`${selections.selectedThreadIds.length} thread${selections.selectedThreadIds.length !== 1 ? 's' : ''}`);
    }
    if (selections.selectedSnippetIds.length > 0) {
      parts.push(`${selections.selectedSnippetIds.length} snippet${selections.selectedSnippetIds.length !== 1 ? 's' : ''}`);
    }
    return parts.join(", ");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-slate-700 border-b border-slate-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                🧠 Select Learning Content
              </h2>
              <p className="text-slate-300 mt-1">
                Choose what content to include in your learning tools
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Main Thread Section */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="main-thread"
                checked={selections.includeMainThread}
                onChange={(e) => setSelections(prev => ({ ...prev, includeMainThread: e.target.checked }))}
                className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-500 rounded focus:ring-purple-500 focus:ring-2"
              />
              <label htmlFor="main-thread" className="text-lg font-semibold text-white cursor-pointer">
                📝 Main Conversation
              </label>
              {chatState?.mainMessages && (
                <span className="text-sm text-slate-300 bg-slate-700 px-2 py-1 rounded">
                  {Math.floor(chatState.mainMessages.length / 2)} exchanges
                </span>
              )}
            </div>
            <p className="text-slate-400 text-sm ml-7">
              Include the primary conversation thread between you and the AI
            </p>
          </div>

          {/* Threads Section */}
          {chatState?.threads && chatState.threads.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="all-threads"
                  checked={selections.includeAllThreads}
                  onChange={(e) => handleAllThreadsToggle(e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-500 rounded focus:ring-purple-500 focus:ring-2"
                />
                <label htmlFor="all-threads" className="text-lg font-semibold text-white cursor-pointer">
                  🧵 All Threads ({chatState.threads.length})
                </label>
              </div>
              
              {/* Individual Thread Selection */}
              <div className="ml-7 space-y-2 max-h-32 overflow-y-auto">
                {chatState.threads.map((thread, index) => (
                  <div key={thread.id} className="flex items-center gap-3 p-2 bg-slate-700 rounded">
                    <input
                      type="checkbox"
                      id={`thread-${thread.id}`}
                      checked={selections.selectedThreadIds.includes(thread.id)}
                      onChange={(e) => handleThreadToggle(thread.id, e.target.checked)}
                      className="w-3 h-3 text-purple-600 bg-slate-700 border-slate-500 rounded focus:ring-purple-500 focus:ring-1"
                    />
                    <label htmlFor={`thread-${thread.id}`} className="text-sm cursor-pointer flex-1">
                      <span className="font-medium text-white">Thread {index + 1}:</span> <span className="text-slate-300">{thread.title || 'Untitled'}</span>
                      {thread.selectedContext && (
                        <span className="text-slate-400 ml-2">({thread.selectedContext})</span>
                      )}
                    </label>
                    <span className="text-xs text-slate-300 bg-slate-600 px-2 py-1 rounded">
                      {Math.floor(thread.messages.length / 2)} exchanges
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Snippets Section */}
          {chatState?.learningSnippets && chatState.learningSnippets.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="all-snippets"
                  checked={selections.includeAllSnippets}
                  onChange={(e) => handleAllSnippetsToggle(e.target.checked)}
                  className="w-4 h-4 text-violet-600 bg-slate-700 border-slate-500 rounded focus:ring-violet-500 focus:ring-2"
                />
                <label htmlFor="all-snippets" className="text-lg font-semibold text-white cursor-pointer">
                  🧠 All Learning Snippets ({chatState.learningSnippets.length})
                </label>
              </div>
              
              {/* Individual Snippet Selection */}
              <div className="ml-7 space-y-2 max-h-32 overflow-y-auto">
                {chatState.learningSnippets.map((snippet) => (
                  <div key={snippet.id} className="flex items-start gap-3 p-2 bg-slate-700 rounded">
                    <input
                      type="checkbox"
                      id={`snippet-${snippet.id}`}
                      checked={selections.selectedSnippetIds.includes(snippet.id)}
                      onChange={(e) => handleSnippetToggle(snippet.id, e.target.checked)}
                      className="w-3 h-3 text-violet-600 bg-slate-700 border-slate-500 rounded focus:ring-violet-500 focus:ring-1 mt-0.5"
                    />
                    <label htmlFor={`snippet-${snippet.id}`} className="text-sm cursor-pointer flex-1">
                      <div className="font-medium text-violet-400">{snippet.source}</div>
                      <div className="text-slate-300 line-clamp-2">
                        {snippet.text.length > 100 ? `${snippet.text.substring(0, 100)}...` : snippet.text}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {new Date(snippet.timestamp).toLocaleString()}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Summary */}
          {hasContent() && (
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
              <h4 className="font-semibold text-blue-400 mb-2">Selected Content:</h4>
              <p className="text-slate-300">{getContentSummary()}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-700 border-t border-slate-600 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {onSave && (
              <button
                onClick={onSave}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-4 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Save DeepDive
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!hasContent()}
              className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-6 py-2 rounded-md font-medium transition-all duration-200 flex items-center gap-2 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Generate Learning Tools
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningContentSelector; 