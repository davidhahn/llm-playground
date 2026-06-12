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

### `06-tool-use-rag`

An HR agent that combines tool use and RAG — where retrieval becomes a decision, not a default.
Instead of retrieval running unconditionally on every query, the model decides at runtime which tools to invoke: a vector search over a policy handbook, a live employee data lookup, a PTO balance check, or none at all. Covers parallel vs. sequential tool call patterns (and why the routing layer must be a loop, not a branch), why system prompt ordering is as important as tool descriptions for reliable agent behavior, and how the model synthesizes results across multiple data sources into answers richer than any single tool could return. The architecture mirrors real enterprise FDE deployments — swapping the mocked tools for real HR and payroll APIs is a one-line change.

### `07-evals`

Automated evaluation framework comparing 03-rag-basic and 06-tool-use-rag across 10 test cases each, scored on accuracy, citation quality, and confidence using LLM-as-judge with forced tool use.

The core lesson came from a false negative: the agent scored 1.5–4/10 on employee lookup questions despite returning correct answers. The scorer was applying document-citation criteria to live tool data responses — a bad eval criterion, not a broken system. The fix was a case_type field on each test case that switches the citation rubric based on whether the response comes from retrieval or a live API. After the fix, both systems hit 100% pass rate; the remaining delta (-0.8) is entirely in citation quality and is fixable with a targeted system prompt change.

Final numbers: RAG scores 9.1/10 at 8.6s average latency; the agent scores 8.3/10 at 12.3s with higher accuracy (9.8 vs 9.3) due to live data access. The latency cost of additional tool calls is real and has to be accounted for in production system design.

### `08-streaming-structured-output`

Progressive JSON field rendering as the model streams a structured object, before the complete response arrives.

04-structured-output waited for content_block_stop before parsing — correct and simple, but leaves a blank UI until the full object is ready. This module adds incremental extraction using regex over the accumulated input_json_delta string: completed fields render as they arrive, and a guaranteed-valid full parse at content_block_stop replaces the partial state. The frontend switches between partialData and completeData via a single null-coalescing swap.

The honest engineering question this module answers is when the added complexity is justified: the incremental approach earns its cost only when the object has fields useful before the whole thing is done, generation is slow enough to notice, and partial state makes sense to display. For backend pipelines, eval scorers, or short objects, buffering until content_block_stop is simpler and equally correct.

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
