# Setup Instructions for AI Chat Threading

## Environment Variables Setup

To use the AI models, you need to create a `.env.local` file in the root directory with your API keys:

```env
# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API Key  
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Replicate API Token (for Claude 4 Sonnet)
REPLICATE_API_TOKEN=your_replicate_api_token_here
```

## Getting API Keys

### OpenAI (GPT-4)
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Create a new API key
4. Copy the key and paste it in your `.env.local` file

### Anthropic (Claude 3.5)
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Create a new API key
4. Copy the key and paste it in your `.env.local` file

### Replicate (Claude 4 Sonnet)
1. Go to [Replicate](https://replicate.com/account/api-tokens)
2. Sign up or log in
3. Create a new API token
4. Copy the token and paste it in your `.env.local` file

## Quick Setup Commands

```bash
# 1. Create environment file
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env.local
echo "ANTHROPIC_API_KEY=your_anthropic_api_key_here" >> .env.local
echo "REPLICATE_API_TOKEN=your_replicate_api_token_here" >> .env.local

# 2. Install dependencies (if not already done)
npm install

# 3. Start development server
npm run dev
```

## Features

- **Model Selection**: Switch between GPT-4, Claude 3.5, and Claude 4 Sonnet models
- **Threading**: Click on any AI response to create a new conversation thread
- **Context Preservation**: Each thread maintains context from the point it was created
- **Multi-column Layout**: View multiple conversation threads simultaneously

## UI Improvements Made

- ✅ Fixed text color in input field (now black)
- ✅ Centered and properly sized input field
- ✅ Added model selection buttons (GPT-4, Claude 3.5, and Claude 4 Sonnet via Replicate)
- ✅ Improved overall layout and spacing
- ✅ Added empty state with instructions

## Troubleshooting

If you're not getting responses:
1. Make sure your `.env.local` file exists with valid API keys
2. Restart the development server after adding API keys
3. Check the browser console for any error messages
4. Ensure you have credits/quota available on your API accounts 