import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export const runtime = "edge";

// Type definitions for the analysis result
interface AnalysisResult {
  summary: string;
  learningObjectives: string[];
  flashcards: {
    front: string;
    back: string;
  }[];
  quizQuestions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  studyGuide: {
    keyTopics: {
      title: string;
      content: string;
    }[];
    importantConcepts: string[];
    practiceQuestions: string[];
  };
}

// Add timeout wrapper for API calls
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Grok 4 Analysis API called at:', new Date().toISOString());
    
    const { learningData } = await req.json();
    
    // Detailed logging for debugging
    console.log('📊 Request data:', {
      mainResponses: learningData.mainResponses?.length || 0,
      threadResponses: learningData.threadResponses?.length || 0,
      hasApiKey: !!process.env.XAI_API_KEY,
      apiKeyLength: process.env.XAI_API_KEY?.length || 0,
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    // Check API key
    if (!process.env.XAI_API_KEY) {
      throw new Error('XAI_API_KEY environment variable is not set');
    }
    
    // Validate input data
    if (!learningData || (!learningData.mainResponses && !learningData.threadResponses)) {
      throw new Error('Invalid learning data: no content to analyze');
    }
    
    // Check data size to prevent edge function limits
    const dataSize = JSON.stringify(learningData).length;
    console.log('📏 Data size:', `${Math.round(dataSize / 1024)}KB`);
    
    if (dataSize > 1024 * 1024) { // 1MB limit
      throw new Error('Learning data too large for processing');
    }
    
    // Create OpenAI client with error handling
    let grok;
    try {
      grok = createOpenAI({
        baseURL: "https://api.x.ai/v1",
        apiKey: process.env.XAI_API_KEY,
      });
      console.log('✅ OpenAI client created successfully');
    } catch (clientError) {
      console.error('❌ Failed to create OpenAI client:', clientError);
      throw new Error(`Failed to create API client: ${clientError instanceof Error ? clientError.message : 'Unknown error'}`);
    }
    
    // Prepare content for analysis with smaller size limit
    const mainContent = learningData.mainResponses?.map((response: any) => response.content).join('\n\n') || '';
    const threadContent = learningData.threadResponses?.map((response: any) => response.content).join('\n\n') || '';
    
    // Reduce content size to prevent timeouts - limit to 6000 characters total
    const maxContentLength = 6000;
    let fullContent = (mainContent + '\n\n' + threadContent).substring(0, maxContentLength);
    
    // If content was truncated, add a note
    if ((mainContent + '\n\n' + threadContent).length > maxContentLength) {
      fullContent += '\n\n[Content truncated for processing...]';
    }

    console.log('📝 Content prepared:', {
      mainContentLength: mainContent.length,
      threadContentLength: threadContent.length,
      totalContentLength: fullContent.length,
      wasTruncated: (mainContent + '\n\n' + threadContent).length > maxContentLength,
      timestamp: new Date().toISOString()
    });
    
    const systemPrompt = `
You are an AI learning assistant that analyzes educational content and creates comprehensive learning materials.

CRITICAL: You must respond with ONLY valid JSON. No markdown, no code blocks, no explanations - just pure JSON.

Analyze the provided learning content and create:
1. A comprehensive summary
2. Learning objectives
3. Interactive flashcards (minimum 8, maximum 15)
4. Quiz questions (minimum 6, maximum 12)
5. A detailed study guide

Respond with this EXACT JSON structure:
{
  "summary": "A comprehensive summary of the learning content",
  "learningObjectives": [
    "Objective 1",
    "Objective 2"
  ],
  "flashcards": [
    {
      "front": "Question or concept",
      "back": "Answer or explanation"
    }
  ],
  "quizQuestions": [
    {
      "question": "Multiple choice question",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Why this answer is correct"
    }
  ],
  "studyGuide": {
    "keyTopics": [
      {
        "title": "Topic Title",
        "content": "Detailed explanation"
      }
    ],
    "importantConcepts": [
      "Concept 1",
      "Concept 2"
    ],
    "practiceQuestions": [
      "Practice question 1",
      "Practice question 2"
    ]
  }
}

IMPORTANT: 
- Ensure all strings are properly escaped
- Do not include any trailing commas
- Do not include any comments in the JSON
- Keep all content concise but comprehensive
- Make sure the JSON is complete and valid
`;

    console.log('🚀 Starting Grok 4 API call...');
    
    // Use only Grok 4 - increased timeout to 60 seconds
    let result;
    try {
      result = await withTimeout(
        generateText({
          model: grok('grok-4'),
          prompt: `${systemPrompt}\n\n${fullContent}`,
          maxTokens: 3000, // Reduced tokens for faster processing
          temperature: 0.3,
        }),
        60000 // Increased to 60 second timeout
      );
      
      console.log('✅ Grok 4 API call completed successfully');
      
    } catch (apiError) {
      console.error('❌ Grok 4 API call failed:', apiError);
      
      // Log detailed error information
      if (apiError instanceof Error) {
        console.error('Error details:', {
          message: apiError.message,
          stack: apiError.stack?.substring(0, 500),
          name: apiError.name
        });
        
        // Special handling for timeout errors
        if (apiError.message.includes('timed out')) {
          throw new Error('Grok 4 API is taking too long to respond. Try with smaller content or try again later.');
        }
      }
      
      throw new Error(`Grok 4 API failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ API call completed in ${elapsed}ms`);
    console.log('📄 Response preview:', result.text.substring(0, 200));
    
    // Parse JSON response with better error handling
    let analysisResult: AnalysisResult;
    try {
      // Clean the response text more thoroughly
      let cleanedText = result.text.trim();
      
      // Remove any markdown code blocks
      cleanedText = cleanedText.replace(/```json\n?/gi, '').replace(/```\n?/g, '');
      
      // Remove any leading/trailing non-JSON text
      cleanedText = cleanedText.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      
      // Try to find and extract the JSON object
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }
      
      console.log('🧹 Cleaned response length:', cleanedText.length);
      console.log('🧹 Response starts with:', cleanedText.substring(0, 100));
      console.log('🧹 Response ends with:', cleanedText.substring(cleanedText.length - 100));
      
      analysisResult = JSON.parse(cleanedText);
      console.log('✅ JSON parsed successfully');
      
      // Validate the structure more thoroughly
      if (!analysisResult.summary || !analysisResult.learningObjectives || 
          !analysisResult.flashcards || !analysisResult.quizQuestions || 
          !analysisResult.studyGuide) {
        throw new Error('Invalid analysis structure - missing required fields');
      }
      
      // Validate arrays have content
      if (!Array.isArray(analysisResult.flashcards) || analysisResult.flashcards.length === 0) {
        throw new Error('Invalid analysis structure - flashcards must be a non-empty array');
      }
      
      if (!Array.isArray(analysisResult.quizQuestions) || analysisResult.quizQuestions.length === 0) {
        throw new Error('Invalid analysis structure - quizQuestions must be a non-empty array');
      }
      
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError);
      console.error('Raw response length:', result.text.length);
      console.error('Raw response sample (first 500 chars):', result.text.substring(0, 500));
      console.error('Raw response sample (last 500 chars):', result.text.substring(result.text.length - 500));
      
      // Try to salvage partial JSON or provide fallback
      throw new Error(`JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}. Response length: ${result.text.length} chars`);
    }
    
    const totalElapsed = Date.now() - startTime;
    console.log(`🎯 Analysis completed successfully in ${totalElapsed}ms`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: analysisResult,
        metadata: {
          analyzed_at: new Date().toISOString(),
          main_responses_count: learningData.mainResponses?.length || 0,
          thread_responses_count: learningData.threadResponses?.length || 0,
          model: 'grok-4',
          processing_time_ms: totalElapsed,
          data_size_kb: Math.round(dataSize / 1024)
        }
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Grok 4 Analysis failed after ${elapsed}ms:`, error);
    
    // More detailed error information
    let errorMessage = 'Unknown error';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to analyze learning content with Grok 4',
        details: errorMessage,
        debug: {
          processing_time_ms: elapsed,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'unknown',
          hasApiKey: !!process.env.XAI_API_KEY,
          apiKeyLength: process.env.XAI_API_KEY?.length || 0,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          errorStack: errorDetails.substring(0, 500)
        }
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 