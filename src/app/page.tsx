'use client';

import { useState, useRef } from 'react';

type Event =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_result'; name: string; result: Record<string, string> };

export default function Home() {
  const [input, setInput] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setEvents([]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error('No response body');
      }

      // Read the stream chunk by chunk
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // chunks may split across JSON lines, so buffer and split on newlines
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // last element may be incomplete. keep it in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const event: Event = JSON.parse(line);

          if (event.type === 'text') {
            // append text to the last text event if it exists, otherwise push new one
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setEvents([{ type: 'text', content: `Error: ${err.message}` }]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 680,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        02 — Tool Use
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 8, marginBottom: 24 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Try "What's the weather in Chicago?" or "What time is it in Tokyo?"`}
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
          {isLoading ? '...' : 'Send'}
        </button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((event, i) => {
          if (event.type === 'tool_start') {
            return (
              <div
                key={i}
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
                key={i}
                style={{
                  padding: '8px 14px',
                  background: '#f0fff4',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#336644',
                  fontFamily: 'monospace',
                }}
              >
                ✓ {event.name} → {JSON.stringify(event.result)}
              </div>
            );
          }
          return (
            <div
              key={i}
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
              {isLoading && i === events.length - 1 && (
                <span style={{ opacity: 0.4 }}>▌</span>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
