# AI Chatbot

A minimal chat interface built with React Router, Vercel AI SDK, and Tailwind CSS.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory with your OpenAI API key:

```
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_API_BASE=base-url
STRAPI_URL=strapi-url
STRAPI_TOKEN=read-token
```

3. Run the development server:

```bash
npm run dev
```

## Tech Stack

- **React Router v7** - Full-stack React framework with loaders/actions
- **Vercel AI SDK** - Streaming AI responses
- **OpenAI GPT-4o** - Language model
- **Tailwind CSS v4** - Styling

## Project Structure

```
app/
├── routes/
│   └── home.tsx    # Chat interface with action for AI streaming
├── root.tsx        # App layout and error boundary
└── app.css         # Global styles
```
