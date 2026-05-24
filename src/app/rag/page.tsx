'use client';

import { useState, useRef } from 'react';

type Source = {
  content: string;
  source: string;
  topic: string;
  similarity: string;
};

type Event =
  | { type: 'sources'; chunks: Source[] }
  | { type: 'text'; content: string };

export default function RagPage() {
  const [input, setInput] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || isLoading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setSources([]);
    setResponse('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/rag', {
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

          if (event.type === 'sources') {
            setSources(event.chunks);
          } else if (event.type === 'text') {
            setResponse((prev) => prev + event.content);
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setResponse(`Error: ${error.message}`);
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
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
        03 — RAG
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 8, marginBottom: 24 }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='Try "How does streaming work?" or "What is RAG?"'
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

      {sources.length > 0 && (
        <div style={{ marginBottom: 20 }}>
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
            Retrieved sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sources.map((source, index) => (
              <div
                key={index}
                style={{
                  padding: '8px 14px',
                  background: '#f0f4ff',
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <span style={{ color: '#333' }}>
                  {source.content.slice(0, 80)}...
                </span>
                <span style={{ color: '#4466cc', whiteSpace: 'nowrap' }}>
                  {source.source} · {source.similarity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {response && (
        <div
          style={{
            padding: 16,
            background: '#f9f9f9',
            borderRadius: 8,
            fontSize: 15,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {response}
          {isLoading && <span style={{ opacity: 0.4 }}>▌</span>}
        </div>
      )}
    </main>
  );
}
