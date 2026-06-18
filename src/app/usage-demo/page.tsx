'use client';

import { useState } from 'react';
import { formatCost } from '@/lib/model-pricing';

type UsageRow = {
  label: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: string;
  latency_ms: number;
  stop_reason: string;
  created_at: string;
};

const QUERY_TYPES = [
  {
    id: 'short',
    label: 'Short query',
    description: 'One sentence answer — minimal tokens',
  },
  {
    id: 'long',
    label: 'Long query',
    description: 'Thorough explanation — maximum tokens',
  },
  {
    id: 'structured',
    label: 'Structured output',
    description: 'Forced tool call — compare vs prose',
  },
];

export default function UsageDemoPage() {
  const [response, setResponse] = useState('');
  const [logs, setLogs] = useState<UsageRow[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  async function runQuery(queryType: string) {
    setIsLoading(queryType);
    setResponse('');

    try {
      const res = await fetch('/api/usage-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_type: queryType }),
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
            setResponse((prev) => prev + event.content);
          }
          if (event.type === 'logs') {
            setLogs(event.data);
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(null);
    }
  }

  const totalCost = logs.reduce((sum, row) => sum + Number(row.cost_usd), 0);
  const avgLatency =
    logs.length > 0
      ? logs.reduce((sum, row) => sum + row.latency_ms, 0) / logs.length
      : 0;

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
        10 — Cost & Latency Tracking
      </h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 32 }}>
        Run queries and observe token usage, cost, and latency per call
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        {QUERY_TYPES.map((q) => (
          <button
            key={q.id}
            onClick={() => runQuery(q.id)}
            disabled={!!isLoading}
            style={{
              flex: 1,
              padding: '12px 16px',
              textAlign: 'left',
              border: '1px solid #ddd',
              borderRadius: 10,
              background: isLoading === q.id ? '#f5f5f5' : 'white',
              cursor: isLoading ? 'default' : 'pointer',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              {q.label}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>{q.description}</div>
            {isLoading === q.id && (
              <div style={{ fontSize: 11, color: '#4466cc', marginTop: 4 }}>
                Running...
              </div>
            )}
          </button>
        ))}
      </div>

      {response && (
        <div
          style={{
            padding: 16,
            background: '#f9f9f9',
            borderRadius: 8,
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: 32,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {response}
        </div>
      )}

      {/* aggregate stats */}
      {logs.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {[
            { label: 'Total calls', value: logs.length },
            { label: 'Total cost', value: formatCost(totalCost) },
            { label: 'Avg latency', value: `${Math.round(avgLatency)}ms` },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ padding: 16, background: '#f9f9f9', borderRadius: 8 }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 4,
                }}
              >
                {stat.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* log table */}
      {logs.length > 0 && (
        <div>
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
            Recent calls
          </div>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                {['Label', 'In', 'Out', 'Total', 'Cost', 'Latency', 'Stop'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '6px 8px',
                        color: '#888',
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td
                    style={{
                      padding: '8px 8px',
                      fontFamily: 'monospace',
                      fontSize: 12,
                    }}
                  >
                    {row.label}
                  </td>
                  <td style={{ padding: '8px 8px' }}>{row.input_tokens}</td>
                  <td style={{ padding: '8px 8px' }}>{row.output_tokens}</td>
                  <td style={{ padding: '8px 8px', fontWeight: 500 }}>
                    {row.total_tokens}
                  </td>
                  <td
                    style={{
                      padding: '8px 8px',
                      color:
                        Number(row.cost_usd) > 0.001 ? '#cc4400' : '#2a7a2a',
                    }}
                  >
                    {formatCost(Number(row.cost_usd))}
                  </td>
                  <td style={{ padding: '8px 8px' }}>{row.latency_ms}ms</td>
                  <td
                    style={{ padding: '8px 8px', color: '#888', fontSize: 11 }}
                  >
                    {row.stop_reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
