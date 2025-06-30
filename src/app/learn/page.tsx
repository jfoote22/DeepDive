'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface LearningData {
  mainResponses: Array<{ content: string; index: number; }>;
  threadResponses: Array<{ 
    content: string; 
    threadTitle: string; 
    context: string; 
    threadIndex: number; 
    responseIndex: number; 
  }>;
}

type ViewMode = 'overview' | 'flashcards' | 'slides' | 'infographic';

export default function LearnPage() {
  const [learningData, setLearningData] = useState<LearningData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedModalItem, setSelectedModalItem] = useState<any>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const dataParam = searchParams.get('data');
    const idParam = searchParams.get('id');
    
    if (dataParam) {
      // Legacy URL parameter method (for backwards compatibility)
      try {
        const decoded = decodeURIComponent(dataParam);
        const parsed = JSON.parse(decoded);
        setLearningData(parsed);
      } catch (error) {
        console.error('Failed to parse learning data from URL:', error);
      }
    } else if (idParam) {
      // New Firebase method
      const loadFromFirebase = async () => {
        try {
          const { getLearningData } = await import('../../lib/firebase/firebaseUtils');
          const data = await getLearningData(idParam);
          setLearningData(data);
        } catch (error) {
          console.error('Failed to load learning data from Firebase:', error);
          alert(`Failed to load learning data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
      
      loadFromFirebase();
    }
  }, [searchParams]);

  // Handle keyboard events for modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedModalItem) {
        setSelectedModalItem(null);
      }
    };

    if (selectedModalItem) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent background scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [selectedModalItem]);

  if (!learningData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Loading learning content...</div>
          <div className="text-gray-400">If this takes too long, please go back and try again.</div>
          <button
            onClick={() => router.back()}
            className="mt-4 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const allContent = [
    ...learningData.mainResponses.map(r => ({
      title: `Main Response ${r.index}`,
      content: r.content,
      type: 'main' as const,
      id: `main-${r.index}`
    })),
    ...learningData.threadResponses.map(r => ({
      title: r.threadTitle || `Thread ${r.threadIndex}`,
      content: r.content,
      context: r.context,
      type: 'thread' as const,
      id: `thread-${r.threadIndex}-${r.responseIndex}`
    }))
  ];

  const generateFlashcards = () => {
    return allContent.map((item, index) => {
      // Create question from content
      const lines = item.content.split('\n').filter(line => line.trim());
      const firstLine = lines[0] || item.title;
      
      let question = `What is explained in "${item.title}"?`;
      if (item.type === 'thread' && item.context) {
        question = `Based on the context "${item.context.substring(0, 50)}...", what was explained?`;
      }
      
      // Find key points for the answer
      const keyPoints = lines
        .filter(line => line.includes('•') || line.includes('-') || line.includes('1.') || line.includes('2.'))
        .slice(0, 3);
      
      const answer = keyPoints.length > 0 
        ? keyPoints.join('\n') 
        : item.content.substring(0, 200) + '...';

      return {
        id: item.id,
        question,
        answer: answer,
        fullContent: item.content,
        title: item.title,
        context: item.type === 'thread' ? item.context : undefined
      };
    });
  };

  const generateSlides = () => {
    return allContent.map((item, index) => {
      const lines = item.content.split('\n').filter(line => line.trim());
      const title = item.title;
      const keyPoints = lines
        .filter(line => line.length > 20 && line.length < 150)
        .slice(0, 5);
      
      return {
        id: item.id,
        title,
        subtitle: item.type === 'thread' && item.context ? `Context: ${item.context.substring(0, 60)}...` : undefined,
        keyPoints,
        fullContent: item.content
      };
    });
  };

  const flashcards = generateFlashcards();
  const slides = generateSlides();

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const nextCard = () => {
    setCurrentCardIndex((prev) => (prev + 1) % flashcards.length);
    setShowAnswer(false);
  };

  const prevCard = () => {
    setCurrentCardIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    setShowAnswer(false);
  };

  const nextSlide = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const renderOverview = () => (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-bold text-white mb-4">📊 Learning Content Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-700 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-400">{learningData.mainResponses.length}</div>
            <div className="text-gray-300">Main Responses</div>
          </div>
          <div className="bg-slate-700 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-400">{learningData.threadResponses.length}</div>
            <div className="text-gray-300">Thread Responses</div>
          </div>
          <div className="bg-slate-700 rounded-lg p-4">
            <div className="text-3xl font-bold text-purple-400">{allContent.length}</div>
            <div className="text-gray-300">Total Items</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {allContent.map((item, index) => (
          <div key={item.id} className="bg-slate-800 rounded-lg border border-slate-700">
            <button
              onClick={() => toggleSection(item.id)}
              className="w-full text-left p-4 hover:bg-slate-700 transition-colors rounded-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">{item.title}</h3>
                  {item.type === 'thread' && item.context && (
                    <p className="text-gray-400 text-sm mt-1">Context: {item.context.substring(0, 100)}...</p>
                  )}
                </div>
                <div className="text-gray-400">
                  {expandedSections.has(item.id) ? '▼' : '▶'}
                </div>
              </div>
            </button>
            
            {expandedSections.has(item.id) && (
              <div className="p-4 border-t border-slate-700">
                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderFlashcards = () => {
    if (flashcards.length === 0) return <div className="text-center text-gray-400">No flashcards available</div>;

    const currentCard = flashcards[currentCardIndex];

    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">🃏 Flashcards</h2>
            <div className="text-gray-400">
              {currentCardIndex + 1} of {flashcards.length}
            </div>
          </div>
          
          <div className="bg-slate-700 rounded-lg p-8 min-h-[300px] flex flex-col justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-white mb-6">{currentCard.title}</h3>
              
              {!showAnswer ? (
                <div>
                  <p className="text-xl text-gray-300 mb-6">{currentCard.question}</p>
                  <button
                    onClick={() => setShowAnswer(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
                  >
                    Show Answer
                  </button>
                </div>
              ) : (
                <div>
                  <div className="bg-slate-600 rounded-lg p-4 mb-6">
                    <ReactMarkdown className="prose prose-invert text-left">
                      {currentCard.answer}
                    </ReactMarkdown>
                  </div>
                  <button
                    onClick={() => setShowAnswer(false)}
                    className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-3 rounded-lg font-medium"
                  >
                    Hide Answer
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={prevCard}
              className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              ← Previous
            </button>
            
            <div className="flex gap-2">
              {flashcards.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCurrentCardIndex(index);
                    setShowAnswer(false);
                  }}
                  className={`w-3 h-3 rounded-full ${
                    index === currentCardIndex ? 'bg-blue-500' : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>
            
            <button
              onClick={nextCard}
              className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSlides = () => {
    if (slides.length === 0) return <div className="text-center text-gray-400">No slides available</div>;

    const currentSlide = slides[currentSlideIndex];

    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-slate-800 rounded-lg p-8 min-h-[500px]">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-white">📊 Slide Deck</h2>
            <div className="text-gray-400">
              {currentSlideIndex + 1} of {slides.length}
            </div>
          </div>
          
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">{currentSlide.title}</h1>
            {currentSlide.subtitle && (
              <p className="text-xl text-gray-400 mb-8">{currentSlide.subtitle}</p>
            )}
            
            <div className="text-left max-w-4xl mx-auto">
              <ul className="space-y-4">
                {currentSlide.keyPoints.map((point, index) => (
                  <li key={index} className="text-lg text-gray-300 flex items-start gap-3">
                    <span className="text-blue-400 font-bold">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-12">
            <button
              onClick={prevSlide}
              className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-3 rounded-lg flex items-center gap-2"
            >
              ← Previous Slide
            </button>
            
            <div className="flex gap-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlideIndex(index)}
                  className={`w-3 h-3 rounded-full ${
                    index === currentSlideIndex ? 'bg-blue-500' : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>
            
            <button
              onClick={nextSlide}
              className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-3 rounded-lg flex items-center gap-2"
            >
              Next Slide →
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderInfographic = () => (
    <>
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-3xl font-bold text-white text-center mb-8">📈 Knowledge Infographic</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allContent.map((item, index) => (
              <div 
                key={item.id} 
                className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-all duration-200 cursor-pointer hover:bg-slate-600 group"
                onClick={() => setSelectedModalItem(item)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                    item.type === 'main' 
                      ? 'bg-blue-500' 
                      : 'bg-green-500'
                  }`}>
                    {item.type === 'main' ? '💬' : '🧵'}
                  </div>
                  <h3 className="text-white font-medium text-sm">{item.title}</h3>
                </div>
                
                {item.type === 'thread' && item.context && (
                  <div className="bg-slate-600 rounded p-2 mb-3">
                    <p className="text-xs text-gray-300">
                      <strong>Context:</strong> {item.context.substring(0, 60)}...
                    </p>
                  </div>
                )}
                
                <div className="text-gray-300 text-sm mb-3">
                  {item.content.substring(0, 150)}...
                </div>
                
                <div className="mt-3 pt-3 border-t border-slate-600">
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span>{item.type === 'main' ? 'Main Chat' : 'Thread'}</span>
                    <div className="flex items-center gap-2">
                      <span>{item.content.length} chars</span>
                      <span className="text-blue-400 group-hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to expand →
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 bg-slate-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-white mb-4">📊 Summary Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{learningData.mainResponses.length}</div>
                <div className="text-gray-300 text-sm">Main Responses</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{learningData.threadResponses.length}</div>
                <div className="text-gray-300 text-sm">Thread Responses</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {allContent.reduce((sum, item) => sum + item.content.length, 0)}
                </div>
                <div className="text-gray-300 text-sm">Total Characters</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {Math.round(allContent.reduce((sum, item) => sum + item.content.split(' ').length, 0))}
                </div>
                <div className="text-gray-300 text-sm">Total Words</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for detailed view */}
      {selectedModalItem && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedModalItem(null);
            }
          }}
        >
          <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-600">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                  selectedModalItem.type === 'main' 
                    ? 'bg-blue-500' 
                    : 'bg-green-500'
                }`}>
                  {selectedModalItem.type === 'main' ? '💬' : '🧵'}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedModalItem.title}</h2>
                  <p className="text-gray-400 text-sm">
                    {selectedModalItem.type === 'main' ? 'Main Chat Response' : 'Thread Response'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedModalItem(null)}
                className="text-gray-400 hover:text-white transition-colors p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {selectedModalItem.type === 'thread' && selectedModalItem.context && (
                <div className="bg-slate-700 rounded-lg p-4 mb-6 border-l-4 border-green-500">
                  <h3 className="text-white font-medium mb-2">📋 Context</h3>
                  <p className="text-gray-300 text-sm italic">"{selectedModalItem.context}"</p>
                </div>
              )}
              
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-white font-medium mb-4">📄 Full Content</h3>
                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown className="text-gray-300 leading-relaxed">
                    {selectedModalItem.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Content Statistics */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-400">
                    {selectedModalItem.content.split(' ').length}
                  </div>
                  <div className="text-xs text-gray-400">Words</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-green-400">
                    {selectedModalItem.content.length}
                  </div>
                  <div className="text-xs text-gray-400">Characters</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-purple-400">
                    {selectedModalItem.content.split('\n').filter((line: string) => line.trim()).length}
                  </div>
                  <div className="text-xs text-gray-400">Paragraphs</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-yellow-400">
                    {Math.ceil(selectedModalItem.content.split(' ').length / 200)}
                  </div>
                  <div className="text-xs text-gray-400">Min Read</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-6 border-t border-slate-700 bg-slate-750">
              <div className="text-sm text-gray-400">
                Press <kbd className="bg-slate-600 px-2 py-1 rounded text-xs">Esc</kbd> or click outside to close
              </div>
              <button
                onClick={() => setSelectedModalItem(null)}
                className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Chat
            </button>
            <h1 className="text-2xl font-bold text-white">🎓 AI Learning Hub</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              📋 Overview
            </button>
            <button
              onClick={() => setViewMode('flashcards')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'flashcards'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              🃏 Flashcards
            </button>
            <button
              onClick={() => setViewMode('slides')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'slides'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              📊 Slides
            </button>
            <button
              onClick={() => setViewMode('infographic')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'infographic'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white'
              }`}
            >
              📈 Infographic
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-6">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'flashcards' && renderFlashcards()}
        {viewMode === 'slides' && renderSlides()}
        {viewMode === 'infographic' && renderInfographic()}
      </main>
    </div>
  );
} 