'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || loading) {
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setResponse('');
    setLoading(true);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        // Append each decoded chunk to the response as it arrives
        setResponse((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setResponse(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
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
        01 — Streaming
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 8, marginBottom: 24 }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something..."
          disabled={loading}
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
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 20px',
            fontSize: 15,
            fontWeight: 500,
            background: loading ? '#ccc' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </form>

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
          {loading && <span style={{ opacity: 0.4 }}>▌</span>}
        </div>
      )}
    </main>
  );
}
