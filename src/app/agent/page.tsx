'use client';

import { useState, useRef } from 'react';

type Event =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_result'; name: string; result: Record<string, unknown> };

const SUGGESTED_QUERIES = [
  'How much PTO does alice.bob have left this year?',
  "What's the policy for requesting time off?",
  "How much PTO would alice.bob get if he's been here 3 years?",
  "What's the learning and development budget and how do I use it?",
  'Can I work from home every day?',
  'What happens if I have to work on a federal holiday?',
];

export default function AgentPage() {
  const [input, setInput] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setEvents([]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const event: Event = JSON.parse(line);

          if (event.type === 'text') {
            setEvents((prev) => {
              const last = prev[prev.length - 1];
              if (last?.type === 'text') {
                return [
                  ...prev.slice(0, -1),
                  { type: 'text', content: last.content + event.content },
                ];
              }
              return [...prev, event];
            });
          } else {
            setEvents((prev) => [...prev, event]);
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setEvents([{ type: 'text', content: `Error: ${error.message}` }]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
        06 — Tool Use + RAG
      </h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
        Acme Corp internal assistant
      </p>

      {/* Suggested queries */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}
        >
          Try these
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTED_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => setInput(q)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                border: '1px solid #ddd',
                borderRadius: 20,
                background: 'white',
                cursor: 'pointer',
                color: '#333',
                textAlign: 'left',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 8, marginBottom: 24 }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask anything about Acme Corp policies or employees..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: 15,
            border: '1px solid #ddd',
            borderRadius: 8,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '10px 20px',
            fontSize: 15,
            fontWeight: 500,
            background: isLoading ? '#ccc' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          {isLoading ? '...' : 'Ask'}
        </button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((event, index) => {
          if (event.type === 'tool_start') {
            return (
              <div
                key={index}
                style={{
                  padding: '8px 14px',
                  background: '#f0f4ff',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#4466cc',
                  fontFamily: 'monospace',
                }}
              >
                ⚙ calling {event.name}...
              </div>
            );
          }
          if (event.type === 'tool_result') {
            return (
              <div
                key={index}
                style={{
                  padding: '8px 14px',
                  background: '#f0fff4',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#336644',
                  fontFamily: 'monospace',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  ✓ {event.name}
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(event.result, null, 2)}
                </pre>
              </div>
            );
          }
          return (
            <div
              key={index}
              style={{
                padding: 16,
                background: '#f9f9f9',
                borderRadius: 8,
                fontSize: 15,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {event.content}
              {isLoading && index === events.length - 1 && (
                <span style={{ opacity: 0.4 }}>▌</span>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
