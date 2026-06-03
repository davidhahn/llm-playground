# llm-playground

A progressive TypeScript sandbox for learning the Anthropic API from first principles. Each module builds on the last, covering the core patterns behind every production LLM feature — streaming, tool use, RAG, and structured output.

Built as part of a deliberate skill-building pivot into applied AI engineering. Not a demo — a working reference for patterns I actually use.

## Modules

### `01-streaming`

Streaming LLM responses to a Next.js UI via the Anthropic API.

Covers the `ReadableStream` bridge between Anthropic's async iterator and the Web API standard expected by the browser. Explores the SSE event envelope (`message_start` → `content_block_delta` → `message_stop`) and the producer/consumer model that makes incremental rendering work.

### `02-tool-use`

Multi-turn tool-calling agent with streaming.

The model decides mid-response to call a function, pauses generation, and resumes after receiving the result. Covers the full content block lifecycle (`content_block_start` for block type detection, `input_json_delta` for streaming JSON arguments, `content_block_stop` for safe parsing), conversation state management across turns, and NDJSON as the event protocol for mixed content types on the frontend.

### `03-rag-basic`

Retrieval-Augmented Generation with pgvector and OpenAI embeddings.

Covers the full RAG pipeline: chunking documents, generating embeddings, storing vectors in pgvector on PostgreSQL, and retrieving semantically relevant context at query time. Includes a debugging write-up on a pgvector behavior where referencing the same parameterized vector expression more than once in a single query silently returns empty results — and the subquery pattern that fixes it.

### `04-structured-output`

Forcing structured JSON output via two approaches: prompt-based and forced tool use with `tool_choice`.

Covers when each approach is appropriate, how property descriptions drive output quality when using forced tool use, and why the model's tool selection is opaque (and what that means for debugging and evals).

### `05-conversation-memory`

Multi-turn chat with persistent conversation history across page reloads.

The Anthropic API is stateless — every call is independent with no memory of prior turns. This module covers the pattern for solving that: the client owns and maintains the message history array, sends the full conversation context with every request, and receives the updated history back as a separate streaming event at the end of each response. Also covers context window and cost tradeoffs that make unbounded history growth impractical, the "last N turns" trimming strategy, and the two-stage storage design — in-memory for the active session, `sessionStorage` for persistence across page reloads.

## Stack

- **Next.js** (App Router) — frontend and API routes
- **TypeScript** — end to end
- **Anthropic SDK** — Claude claude-sonnet-4-20250514
- **OpenAI SDK** — embeddings (used in `03-rag-basic`)
- **pgvector on PostgreSQL** — vector store (via Docker)

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for pgvector in module 03)
- Anthropic API key
- OpenAI API key (module 03 only)

### Setup

```bash
git clone https://github.com/davidhahn/llm-playground.git
cd llm-playground
npm install
```

Create a `.env.local` file:

```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

For module 03, start the pgvector database:

```bash
docker-compose up -d
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
