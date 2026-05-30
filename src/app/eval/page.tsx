'use client';

import { useState } from 'react';
import type { EvalScore } from '../api/eval/route';

const DEFAULT_QUESTION = 'How does streaming work in the Anthropic API?';
const DEFAULT_ANSWER =
  'Streaming in the Anthropic API works by delivering responses token by token using server-sent events. You can process each token as it arrives rather than waiting for the full response.';
const DEFAULT_SOURCES = [
  'The Anthropic API supports streaming responses using server-sent events. You can stream text completions token by token as they are generated.',
  'RAG stands for Retrieval Augmented Generation. It combines semantic search over a knowledge base with LLM generation.',
];

export default function EvalPage() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [answer, setAnswer] = useState(DEFAULT_ANSWER);
  const [sources, setSources] = useState(DEFAULT_SOURCES.join('\n---\n'));
  const [method, setMethod] = useState<'prompt' | 'tool'>('tool');
  const [result, setResult] = useState<{
    score: EvalScore;
    method: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    setIsLoading(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          answer,
          sources: sources
            .split('---')
            .map((s) => s.trim())
            .filter(Boolean),
          method,
        }),
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  }

  const score = result?.score;

  return (
    <main
      style={{
        maxWidth: 760,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        04 — Structured Output
      </h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
        RAG response evaluator
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Question
          </label>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid #ddd',
              borderRadius: 8,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Answer to evaluate
          </label>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid #ddd',
              borderRadius: 8,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        <div>
          <label
            style={{
              fontSize: 13,
              fontWeight: 500,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Sources{' '}
            <span style={{ fontWeight: 400, color: '#888' }}>
              (separate with ---)
            </span>
          </label>
          <textarea
            value={sources}
            onChange={(e) => setSources(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid #ddd',
              borderRadius: 8,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['tool', 'prompt'] as const).map((methodOption) => (
              <label
                key={methodOption}
                style={{
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  value={methodOption}
                  checked={method === methodOption}
                  onChange={() => setMethod(methodOption)}
                />
                {methodOption === 'tool'
                  ? 'Tool use (reliable)'
                  : 'Prompt-based (simple)'}
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginLeft: 'auto',
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 500,
              background: isLoading ? '#ccc' : '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: isLoading ? 'default' : 'pointer',
            }}
          >
            {isLoading ? 'Scoring...' : 'Score response'}
          </button>
        </div>
      </form>

      {error && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#fff0f0',
            borderRadius: 8,
            color: '#cc0000',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {score && (
        <div style={{ marginTop: 32 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: score.overall_score >= 7 ? '#2a7a2a' : '#cc4400',
              }}
            >
              {score.overall_score}/10
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                background: score.verdict === 'pass' ? '#e8f5e9' : '#fdecea',
                color: score.verdict === 'pass' ? '#2a7a2a' : '#cc0000',
              }}
            >
              {score.verdict.toUpperCase()}
            </span>
            <span style={{ fontSize: 13, color: '#888' }}>
              via {result?.method}
            </span>
            {score.flags.length > 0 &&
              score.flags.map((f) => (
                <span
                  key={f}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontSize: 12,
                    background: '#fff3cd',
                    color: '#856404',
                  }}
                >
                  ⚠ {f.replace(/_/g, ' ')}
                </span>
              ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            {(['accuracy', 'citation_quality', 'confidence'] as const).map(
              (criterion) => (
                <div
                  key={criterion}
                  style={{
                    padding: 16,
                    background: '#f9f9f9',
                    borderRadius: 8,
                  }}
                >
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
                    {criterion.replace('_', ' ')}
                  </div>
                  <div
                    style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}
                  >
                    {score[criterion].score}/10
                  </div>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                    {score[criterion].reasoning}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </main>
  );
}
