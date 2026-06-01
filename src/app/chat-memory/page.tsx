'use client';

import { useState, useRef, useEffect } from 'react';
import type { Message } from '../api/chat-memory/route';

const STORAGE_KEY = 'chat-memory-history';
const MAX_TURNS = 10;

export default function ChatMemoryPage() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // load history from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: Message[] = JSON.parse(stored);
      setHistory(parsed);
      setTurnCount(Math.floor(parsed.length / 2));
    }
  }, []);

  // Scroll to bottom when history updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streamingResponse]);

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMessage = input;
    setInput('');
    setStreamingResponse('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history }),
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

          const event = JSON.parse(line);

          if (event.type === 'text') {
            setStreamingResponse((prev) => prev + event.content);
          }

          if (event.type === 'history') {
            // server sends back the full updated history
            // persist to sessionStorage
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(event.messages));
            setHistory(event.messages);
            setTurnCount(Math.floor(event.messages.length / 2));
            setStreamingResponse('');
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error(error);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    sessionStorage.removeItem(STORAGE_KEY);
    setHistory([]);
    setTurnCount(0);
    setStreamingResponse('');
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '0 20px',
        fontFamily: 'system-ui',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 0 12px',
          borderBottom: '1px solid #eee',
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            05 — Conversation Memory
          </h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
            {turnCount} turn{turnCount !== 1 ? 's' : ''} · max {MAX_TURNS} ·
            persisted in sessionStorage
          </p>
        </div>
        <button
          onClick={handleClear}
          style={{
            fontSize: 13,
            padding: '6px 14px',
            border: '1px solid #ddd',
            borderRadius: 8,
            background: 'white',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          Clear history
        </button>
      </div>

      {/* messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {history.length === 0 && !streamingResponse && (
          <div
            style={{
              textAlign: 'center',
              color: '#aaa',
              fontSize: 14,
              marginTop: 60,
            }}
          >
            Start a conversation. Try asking about RAG, then ask a follow-up
            that references your first question.
          </div>
        )}

        {history.map((message, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              justifyContent:
                message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: message.role === 'user' ? '#111' : '#f5f5f5',
                color: message.role === 'user' ? '#fff' : '#111',
              }}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* streaming response */}
        {streamingResponse && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: '#f5f5f5',
                color: '#111',
              }}
            >
              {streamingResponse}
              <span style={{ opacity: 0.4 }}>▌</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div style={{ borderTop: '1px solid #eee', padding: '16px 0 24px' }}>
        {turnCount >= MAX_TURNS && (
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
            ⚠ History trimmed to last {MAX_TURNS} turns — older context is
            dropped
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Send a message..."
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
      </div>
    </main>
  );
}
