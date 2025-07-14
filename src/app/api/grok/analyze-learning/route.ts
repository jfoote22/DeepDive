import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export const runtime = "edge";

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
    
    const systemPrompt = `You are Grok4, an expert educational content creator. Your task is to analyze a DeepDive learning session and create comprehensive, intelligent learning tools.

ANALYSIS TASK:
1. Analyze the conversation content to identify key concepts, facts, processes, and insights
2. Extract the most important learning objectives and educational value
3. Create engaging, educational content that helps users learn and retain information
4. Generate content that goes beyond simple copying - synthesize and organize information pedagogically

REQUIRED OUTPUT FORMAT (Valid JSON only):
{
  "summary": "A comprehensive summary of what was learned in this DeepDive session",
  "learningObjectives": ["List of 3-5 specific learning objectives"],
  "keyTopics": ["List of main topics covered"],
  "flashcards": [
    {
      "question": "Thoughtfully crafted question that tests understanding",
      "answer": "Clear, educational answer with context",
      "category": "Topic category",
      "difficulty": "beginner|intermediate|advanced"
    }
  ],
  "quizQuestions": [
    {
      "question": "Multiple choice or short answer question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Correct answer or option letter",
      "explanation": "Why this is correct and what it teaches",
      "type": "multiple_choice|short_answer|true_false"
    }
  ],
  "studyGuide": {
    "mainConcepts": ["List of core concepts with brief explanations"],
    "processes": ["Step-by-step processes or workflows discussed"],
    "keyInsights": ["Important insights or takeaways"],
    "practicalApplications": ["How this knowledge can be applied"]
  },
  "reviewSessions": [
    {
      "title": "Review session title",
      "content": "Structured review content focusing on specific aspects",
      "timeEstimate": "Estimated study time",
      "difficulty": "beginner|intermediate|advanced"
    }
  ]
}

GUIDELINES:
- Create 8-15 flashcards focusing on different aspects and difficulty levels
- Generate 5-10 quiz questions of varying types and difficulties
- Ensure questions test understanding, not just memorization
- Include practical applications and real-world relevance
- Make content engaging and educationally valuable
- Focus on synthesis rather than simple repetition
- Tailor difficulty to match the complexity of the source content
- CRITICAL: Return ONLY valid JSON - no extra text, no markdown formatting

Analyze the following DeepDive session content and generate comprehensive learning tools:`;

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
    let analysisResult;
    try {
      // Clean the response text
      let cleanedText = result.text.trim();
      
      // Remove any markdown code blocks
      cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Try to find JSON within the response
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }
      
      analysisResult = JSON.parse(cleanedText);
      console.log('✅ JSON parsed successfully');
      
      // Validate the structure
      if (!analysisResult.summary || !analysisResult.flashcards || !analysisResult.quizQuestions) {
        throw new Error('Invalid analysis structure - missing required fields');
      }
      
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError);
      console.error('Raw response (first 1000 chars):', result.text.substring(0, 1000));
      
      // More specific error for JSON parsing issues
      throw new Error(`JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
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