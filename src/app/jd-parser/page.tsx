'use client';

import { useState, useRef } from 'react';
import type { ParsedJD } from '../api/jd-parser/route';
import { extractCompletedFields } from '../utils/jd-parser-helpers';
import Field from '@/app/components/jd-parser/Field';
import ArrayField from '@/app/components/jd-parser/ArrayField';

const SAMPLE_JD = `Forward Deployed Engineer
Anthropic | San Francisco, CA (Hybrid) | $180,000 - $280,000

About the Role
We're looking for a Forward Deployed Engineer to work directly with enterprise customers to deploy and scale Claude in production environments. You'll be embedded with customer teams, discover high-value workflows, and build production-grade AI systems.

Requirements
- 5+ years of software engineering experience
- Production experience with LLM APIs (Anthropic, OpenAI, or similar)
- Strong Python and TypeScript skills
- Experience building agents, RAG systems, or tool-calling workflows
- Ability to travel up to 30% for customer engagements
- Strong written and verbal communication skills

Nice to Haves
- Experience with MCP servers or sub-agents
- Familiarity with eval frameworks
- Background in enterprise software deployments
- Experience with vector databases (pgvector, Pinecone, Weaviate)

Tech Stack
Python, TypeScript, Next.js, Postgres, pgvector, Anthropic SDK, LangChain`;

const SENIORITY_COLORS: Record<string, string> = {
  junior: '#4CAF50',
  mid: '#2196F3',
  senior: '#9C27B0',
  staff: '#FF5722',
  unknown: '#9E9E9E',
};

export default function JDParserPage() {
  const [jdText, setJdText] = useState(SAMPLE_JD);
  const [partialData, setPartialData] = useState<Partial<ParsedJD>>({});
  const [completeData, setCompleteData] = useState<ParsedJD | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!jdText.trim() || isLoading) {
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setPartialData({});
    setCompleteData(null);
    setRawJson('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/jd-parser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: jdText }),
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

          if (event.type === 'delta') {
            setRawJson(event.accumulated);
            // Attempt incremental extraction from partial JSON
            const partial = extractCompletedFields(event.accumulated);
            setPartialData(partial);
          }

          if (event.type === 'complete') {
            setCompleteData(event.data);
            setPartialData({});
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

  // show complete data if done, otherwise show partial
  const display = completeData ?? partialData;

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
        08 — Streaming Structured Output
      </h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>
        Job description parser
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <textarea
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
          rows={10}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 8,
            resize: 'vertical',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !jdText.trim()}
          style={{
            marginTop: 8,
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
          {isLoading ? 'Parsing...' : 'Parse JD'}
        </button>
      </form>

      {(Object.keys(display).length > 0 || completeData) && (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Header fields */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            {(['title', 'company', 'location', 'salary_range'] as const).map(
              (field) => (
                <Field
                  key={field}
                  label={field.replace('_', ' ')}
                  value={display[field] as string}
                  complete={!!completeData}
                />
              ),
            )}
          </div>

          {/* seniority */}
          {display.seniority_level && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>
                SENIORITY
              </span>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  background: SENIORITY_COLORS[display.seniority_level] + '22',
                  color: SENIORITY_COLORS[display.seniority_level],
                }}
              >
                {display.seniority_level}
              </span>
              {!completeData && (
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  streaming...
                </span>
              )}
            </div>
          )}

          {/* array fields */}
          {(['requirements', 'nice_to_haves', 'tech_stack'] as const).map(
            (field) =>
              display[field] &&
              (display[field] as string[]).length > 0 && (
                <ArrayField
                  key={field}
                  label={field.replace(/_/g, ' ')}
                  items={display[field] as string[]}
                  complete={!!completeData}
                />
              ),
          )}

          {/* fit summary */}
          {display.fit_summary && (
            <Field
              label="fit summary"
              value={display.fit_summary}
              complete={!!completeData}
              multiline
            />
          )}
        </div>
      )}

      {/* raw JSON stream: useful for understanding what's happening */}
      {rawJson && !completeData && (
        <div style={{ marginTop: 24 }}>
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
            Raw stream
          </div>
          <pre
            style={{
              padding: 12,
              background: '#f9f9f9',
              borderRadius: 8,
              fontSize: 11,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 200,
              overflowY: 'auto',
              color: '#555',
            }}
          >
            {rawJson}
            <span style={{ opacity: 0.4 }}>▌</span>
          </pre>
        </div>
      )}
    </main>
  );
}
