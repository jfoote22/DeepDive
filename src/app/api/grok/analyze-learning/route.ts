import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { learningData } = await req.json();
    
    // Create a custom OpenAI-compatible client for X.AI's API
    const grok = createOpenAI({
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY || "",
    });
    
    // Prepare the content for analysis
    const mainContent = learningData.mainResponses
      .map((response: any, index: number) => 
        `=== MAIN RESPONSE ${index + 1} ===\n${response.content}\n`
      ).join('\n');
    
    const threadContent = learningData.threadResponses
      .map((response: any, index: number) => 
        `=== THREAD: ${response.threadTitle} (Context: ${response.context}) ===\n${response.content}\n`
      ).join('\n');
    
    const fullContent = `${mainContent}\n${threadContent}`;
    
    const systemPrompt = `You are Grok4, an expert educational content creator. Your task is to analyze a DeepDive learning session and create comprehensive, intelligent learning tools.

ANALYSIS TASK:
1. Analyze the conversation content to identify key concepts, facts, processes, and insights
2. Extract the most important learning objectives and educational value
3. Create engaging, educational content that helps users learn and retain information
4. Generate content that goes beyond simple copying - synthesize and organize information pedagogically

REQUIRED OUTPUT FORMAT (JSON):
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
      "options": ["Option A", "Option B", "Option C", "Option D"], // for multiple choice
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

Analyze the following DeepDive session content and generate comprehensive learning tools:`;

    const result = await generateText({
      model: grok('grok-4'),
      prompt: `${systemPrompt}\n\n${fullContent}`,
      maxTokens: 4000,
      temperature: 0.3, // Lower temperature for more consistent educational content
    });

    // Parse the JSON response
    let analysisResult;
    try {
      analysisResult = JSON.parse(result.text);
    } catch (parseError) {
      console.error('Failed to parse Grok response as JSON:', parseError);
      // Return a fallback structure if JSON parsing fails
      analysisResult = {
        summary: result.text,
        learningObjectives: ["Review the generated content"],
        keyTopics: ["General knowledge"],
        flashcards: [{
          question: "What was the main topic of this DeepDive session?",
          answer: "Please review the generated content for specific details.",
          category: "General",
          difficulty: "beginner"
        }],
        quizQuestions: [{
          question: "What was covered in this DeepDive session?",
          type: "short_answer",
          correctAnswer: "Review the content for specific details",
          explanation: "This session covered various topics that should be reviewed."
        }],
        studyGuide: {
          mainConcepts: ["Review the generated analysis"],
          processes: ["Examine the content for procedural information"],
          keyInsights: ["Key insights from the session"],
          practicalApplications: ["Applications to be determined from content"]
        },
        reviewSessions: [{
          title: "General Review",
          content: "Review all content from this DeepDive session",
          timeEstimate: "15-30 minutes",
          difficulty: "intermediate"
        }]
      };
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: analysisResult,
        metadata: {
          analyzed_at: new Date().toISOString(),
          main_responses_count: learningData.mainResponses.length,
          thread_responses_count: learningData.threadResponses.length,
          model: 'grok-4'
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Grok Learning Analysis error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to analyze learning content with Grok4',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 