'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { User } from 'firebase/auth';

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

interface EnhancedLearningData {
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

interface GrokAnalysis {
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

type ViewMode = 'ai-flashcards' | 'ai-quiz' | 'study-guide';

function LearnPageContent() {
  const [learningData, setLearningData] = useState<LearningData | EnhancedLearningData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('ai-flashcards');
  const [selectedModalItem, setSelectedModalItem] = useState<any>(null);
  
  // AI Features State
  const [currentAICardIndex, setCurrentAICardIndex] = useState(0);
  const [showAIAnswer, setShowAIAnswer] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: number }>({});
  const [showResults, setShowResults] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  
  // Authentication state
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const searchParams = useSearchParams();
  const router = useRouter();

  // Helper function to normalize learning data
  const getNormalizedLearningData = (data: LearningData | EnhancedLearningData | null): LearningData | null => {
    if (!data) return null;
    
    if ('originalData' in data) {
      return data.originalData;
    }
    
    return data;
  };

  // Helper function to get enhanced features
  const getEnhancedFeatures = (data: LearningData | EnhancedLearningData | null): { 
    analysis: GrokAnalysis | null, 
    metadata: EnhancedLearningData['metadata'] | null 
  } => {
    if (!data || !('originalData' in data)) {
      return { analysis: null, metadata: null };
    }
    
    return { 
      analysis: data.analysis, 
      metadata: data.metadata 
    };
  };

  // Reset state when switching view modes
  useEffect(() => {
    if (viewMode === 'ai-flashcards') {
      setCurrentAICardIndex(0);
      setShowAIAnswer(false);
    } else if (viewMode === 'ai-quiz') {
      setCurrentQuizIndex(0);
      setUserAnswers({});
      setShowResults(false);
      setSelectedAnswer('');
    }
  }, [viewMode]);

  // Monitor authentication state
  useEffect(() => {
    const monitorAuth = async () => {
      try {
        const { auth } = await import('../../lib/firebase/firebase');
        
        if (!auth) {
          console.warn('Firebase auth not configured');
          setAuthLoading(false);
          return;
        }

        const unsubscribe = auth.onAuthStateChanged((user: User | null) => {
          console.log('🔐 Auth state changed:', user ? 'User authenticated' : 'No user');
          setAuthLoading(false);
          
          if (!user) {
            setAuthError('Authentication required to load learning data');
          } else {
            setAuthError(null);
          }
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Failed to monitor auth state:', error);
        setAuthLoading(false);
      }
    };

    monitorAuth();
  }, []);

  // Load learning data after authentication is ready
  useEffect(() => {
    // Wait for auth to be ready
    if (authLoading) {
      console.log('⏳ Waiting for authentication to load...');
      return;
    }

    const dataParam = searchParams.get('data');
    const idParam = searchParams.get('id');
    
    if (dataParam) {
      // Legacy URL parameter method (for backwards compatibility)
      try {
        const decoded = decodeURIComponent(dataParam);
        const parsed = JSON.parse(decoded);
        setLearningData(parsed);
        console.log('✅ Learning data loaded from URL parameter');
      } catch (error) {
        console.error('Failed to parse learning data from URL:', error);
        setAuthError('Failed to parse learning data from URL');
      }
    } else if (idParam) {
      // Firebase method - now with proper auth state
      const loadFromFirebase = async () => {
        try {
          console.log('🔄 Loading learning data from Firebase...');
          const { getLearningData } = await import('../../lib/firebase/firebaseUtils');
          const data = await getLearningData(idParam);
          setLearningData(data);
          console.log('✅ Learning data loaded from Firebase successfully');
        } catch (error) {
          console.error('Failed to load learning data from Firebase:', error);
          setAuthError(`Failed to load learning data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
      
      loadFromFirebase();
    }
  }, [searchParams, authLoading]); // Depend on authLoading to wait for auth

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

  const normalizedData = getNormalizedLearningData(learningData);
  const { analysis, metadata } = getEnhancedFeatures(learningData);

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">🔐 Authenticating...</div>
          <div className="text-gray-400">Please wait while we verify your access.</div>
          <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  // Show auth error state
  if (authError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-2xl font-bold text-white mb-4">Authentication Required</h1>
          <p className="text-gray-400 mb-4">{authError}</p>
          <div className="space-x-4">
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Go to Home & Sign In
            </button>
            <button
              onClick={() => router.back()}
              className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while data is being fetched
  if (!learningData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">📚 Loading learning content...</div>
          <div className="text-gray-400">If this takes too long, please go back and try again.</div>
          <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
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

  // Show error state if no data is available
  if (!normalizedData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🎓</div>
          <h1 className="text-2xl font-bold text-white mb-4">No Learning Data Available</h1>
          <p className="text-gray-400">Unable to load your learning content. Please try again.</p>
        </div>
      </div>
    );
  }

  // Show error state if no AI analysis is available
  if (!analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-2xl font-bold text-white mb-4">Grok 4 Analysis Failed</h1>
          <p className="text-gray-400 mb-6">
            The AI analysis with Grok 4 failed to complete. This could be due to API timeouts or content processing issues.
          </p>
          <div className="bg-slate-800/50 p-4 rounded-lg mb-6">
            <p className="text-sm text-gray-300 mb-2">AI Features require successful analysis:</p>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>🧠 AI-Generated Flashcards</li>
              <li>📝 AI-Powered Quiz</li>
              <li>📚 Intelligent Study Guide</li>
            </ul>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Create New Learning Content
            </button>
            <button
              onClick={() => router.back()}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const allContent = normalizedData ? [
    ...normalizedData.mainResponses.map(r => ({
      title: `Main Response ${r.index}`,
      content: r.content,
      type: 'main' as const,
      id: `main-${r.index}`
    })),
    ...normalizedData.threadResponses.map(r => ({
      title: r.threadTitle || `Thread ${r.threadIndex}`,
      content: r.content,
      context: r.context,
      type: 'thread' as const,
      id: `thread-${r.threadIndex}-${r.responseIndex}`
    }))
  ] : [];

  const renderAIFlashcards = () => {
    if (!analysis || !analysis.flashcards || analysis.flashcards.length === 0) {
      return (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🧠</div>
            <h2 className="text-2xl font-bold text-white mb-4">No AI Flashcards Available</h2>
            <p className="text-gray-400">Enhanced flashcards are only available when your learning content was analyzed by Grok 4.</p>
          </div>
        </div>
      );
    }

    const nextAICard = () => {
      setCurrentAICardIndex((prev) => (prev + 1) % analysis.flashcards.length);
      setShowAIAnswer(false);
    };

    const prevAICard = () => {
      setCurrentAICardIndex((prev) => (prev - 1 + analysis.flashcards.length) % analysis.flashcards.length);
      setShowAIAnswer(false);
    };

    const card = analysis.flashcards[currentAICardIndex];

    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">🧠 AI-Generated Flashcards</h2>
              <p className="text-gray-400 mt-1">Enhanced flashcards created by Grok 4 analysis</p>
            </div>
            <div className="text-sm text-gray-400">
              {currentAICardIndex + 1} of {analysis.flashcards.length}
            </div>
          </div>

          <div className="bg-slate-700 rounded-lg p-8 mb-6 min-h-[300px] flex flex-col justify-center">
            <div className="text-center">
              <div className="text-lg font-semibold text-white mb-6">
                {card.front}
              </div>

              {showAIAnswer && (
                <div className="mt-4 p-4 bg-slate-800 rounded-lg">
                  <div className="text-gray-300">
                    <ReactMarkdown>{card.back}</ReactMarkdown>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowAIAnswer(!showAIAnswer)}
                className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                {showAIAnswer ? 'Hide Answer' : 'Show Answer'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={prevAICard}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              ← Previous
            </button>
            
            <div className="text-sm text-gray-400">
              Progress: {Math.round(((currentAICardIndex + 1) / analysis.flashcards.length) * 100)}%
            </div>
            
            <button
              onClick={nextAICard}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAIQuiz = () => {
    if (!analysis || !analysis.quizQuestions || analysis.quizQuestions.length === 0) {
      return (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-white mb-4">No AI Quiz Available</h2>
            <p className="text-gray-400">Quiz questions are only available when your learning content was analyzed by Grok 4.</p>
          </div>
        </div>
      );
    }

    const currentQuestion = analysis.quizQuestions[currentQuizIndex];
    const isLastQuestion = currentQuizIndex === analysis.quizQuestions.length - 1;

    const handleAnswerSubmit = () => {
      if (selectedAnswer !== '') {
        // Store the selected answer index instead of the text
        const selectedIndex = analysis.quizQuestions[currentQuizIndex].options.indexOf(selectedAnswer);
        setUserAnswers(prev => ({ ...prev, [currentQuizIndex]: selectedIndex }));
        
        if (isLastQuestion) {
          setShowResults(true);
        } else {
          setCurrentQuizIndex(prev => prev + 1);
          setSelectedAnswer('');
        }
      }
    };

    const calculateScore = () => {
      let correct = 0;
      analysis.quizQuestions.forEach((question, index) => {
        if (userAnswers[index] === question.correctAnswer) {
          correct++;
        }
      });
      return Math.round((correct / analysis.quizQuestions.length) * 100);
    };

    if (showResults) {
      const score = calculateScore();
      return (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-4">Quiz Complete!</h2>
            <div className="text-5xl font-bold text-green-400 mb-4">{score}%</div>
            <p className="text-gray-400 mb-8">
              You scored {Object.values(userAnswers).filter((answer, index) => answer === analysis.quizQuestions[index].correctAnswer).length} out of {analysis.quizQuestions.length} questions correctly
            </p>
            
            <button
              onClick={() => {
                setCurrentQuizIndex(0);
                setUserAnswers({});
                setShowResults(false);
                setSelectedAnswer('');
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Take Quiz Again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">🎯 AI-Generated Quiz</h2>
              <p className="text-gray-400 mt-1">Test your knowledge with questions created by Grok 4</p>
            </div>
            <div className="text-sm text-gray-400">
              Question {currentQuizIndex + 1} of {analysis.quizQuestions.length}
            </div>
          </div>

          <div className="bg-slate-700 rounded-lg p-8 mb-6">
            <h3 className="text-xl font-semibold text-white mb-6">
              {analysis.quizQuestions[currentQuizIndex].question}
            </h3>

            <div className="space-y-3">
              {analysis.quizQuestions[currentQuizIndex].options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedAnswer(option)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedAnswer === option
                      ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                      : 'border-slate-600 bg-slate-800 text-gray-300 hover:border-slate-500'
                  }`}
                >
                  {String.fromCharCode(65 + index)}. {option}
                </button>
              ))}
            </div>

            <button
              onClick={handleAnswerSubmit}
              disabled={!selectedAnswer}
              className="mt-6 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
            >
              {isLastQuestion ? 'Finish Quiz' : 'Next Question'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Progress: {Math.round(((currentQuizIndex + 1) / analysis.quizQuestions.length) * 100)}%
            </div>
            <div className="w-full max-w-xs mx-4 bg-slate-600 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentQuizIndex + 1) / analysis.quizQuestions.length) * 100}%` }}
              ></div>
            </div>
            <div className="text-sm text-gray-400">
              {currentQuizIndex + 1}/{analysis.quizQuestions.length}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStudyGuide = () => {
    if (!analysis || !analysis.studyGuide) {
      return (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-2xl font-bold text-white mb-4">No Study Guide Available</h2>
            <p className="text-gray-400">Study guides are only available when your learning content was analyzed by Grok 4.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Summary */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-4">📚 AI Study Guide</h2>
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{analysis.summary}</ReactMarkdown>
          </div>
        </div>

        {/* Learning Objectives */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">🎯 Learning Objectives</h3>
          <ul className="space-y-2">
            {analysis.learningObjectives.map((objective, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <span className="text-gray-300">{objective}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Main Concepts */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">💡 Main Concepts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.studyGuide.keyTopics.map((topic, index) => (
              <div key={index} className="bg-slate-700 rounded-lg p-4">
                <div className="text-gray-300">
                  <ReactMarkdown>{topic.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Important Concepts */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">💡 Important Concepts</h3>
          <ul className="space-y-2">
            {analysis.studyGuide.importantConcepts.map((concept, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <span className="text-gray-300">{concept}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Practice Questions */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">🚀 Practice Questions</h3>
          <ul className="space-y-2">
            {analysis.studyGuide.practiceQuestions.map((question, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
                <span className="text-gray-300">{question}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

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
          
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setViewMode('ai-flashcards')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'ai-flashcards'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : 'bg-gradient-to-r from-slate-700 to-slate-600 text-gray-300 hover:from-slate-600 hover:to-slate-500 hover:text-white'
              }`}
            >
              🧠 AI Flashcards
            </button>
            <button
              onClick={() => setViewMode('ai-quiz')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'ai-quiz'
                  ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white'
                  : 'bg-gradient-to-r from-slate-700 to-slate-600 text-gray-300 hover:from-slate-600 hover:to-slate-500 hover:text-white'
              }`}
            >
              🎯 AI Quiz
            </button>
            <button
              onClick={() => setViewMode('study-guide')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'study-guide'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'bg-gradient-to-r from-slate-700 to-slate-600 text-gray-300 hover:from-slate-600 hover:to-slate-500 hover:text-white'
              }`}
            >
              📚 Study Guide
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-6">
        {viewMode === 'ai-flashcards' && renderAIFlashcards()}
        {viewMode === 'ai-quiz' && renderAIQuiz()}
        {viewMode === 'study-guide' && renderStudyGuide()}
      </main>
    </div>
  );
}

// Loading component for Suspense fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <div className="text-white text-xl mb-4">Loading learning tools...</div>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
      </div>
    </div>
  );
}

// Main export wrapped with Suspense
export default function LearnPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LearnPageContent />
    </Suspense>
  );
} 