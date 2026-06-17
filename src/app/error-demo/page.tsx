'use client';

import { useState } from 'react';
import type { ScenarioResult } from '@/lib/error-scenarios';

const SCENARIOS = [
  {
    id: 'happy_path',
    label: 'Happy path',
    description: 'Baseline — everything works',
    color: '#2a7a2a',
  },
  {
    id: 'bad_json',
    label: 'Malformed JSON',
    description: 'Model returns mixed content — extract JSON from noise',
    color: '#cc6600',
  },
  {
    id: 'truncated',
    label: 'Truncated response',
    description: 'max_tokens too low — retry with progressively higher limits',
    color: '#cc6600',
  },
  {
    id: 'tool_failure',
    label: 'Flaky tool',
    description: 'Tool fails 2/3 calls — model retries via tool_result error',
    color: '#cc6600',
  },
  {
    id: 'permanent_error',
    label: 'Permanent error',
    description: "Invalid API key — detect and don't retry",
    color: '#cc0000',
  },
];

const STATUS_STYLES: Record<
  string,
  { bg: string; color: string; icon: string }
> = {
  trying: { bg: '#f0f4ff', color: '#4466cc', icon: '⟳' },
  retrying: { bg: '#fff8e1', color: '#cc6600', icon: '↺' },
  failed: { bg: '#fdecea', color: '#cc0000', icon: '✗' },
  succeeded: { bg: '#f0fff4', color: '#2a7a2a', icon: '✓' },
};

export default function ErrorDemoPage() {
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  async function runScenario(scenarioId: string) {
    setIsLoading((prev) => ({ ...prev, [scenarioId]: true }));
    setResults((prev) => ({
      ...prev,
      [scenarioId]: undefined as unknown as ScenarioResult,
    }));

    try {
      const res = await fetch('/api/error-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioId }),
      });
      const data: ScenarioResult = await res.json();
      setResults((prev) => ({ ...prev, [scenarioId]: data }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [scenarioId]: {
          success: false,
          attempts: 0,
          error: err instanceof Error ? err.message : 'Request failed',
          timeline: [],
        },
      }));
    } finally {
      setIsLoading((prev) => ({ ...prev, [scenarioId]: false }));
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
        09 — Error Handling & Retries
      </h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 32 }}>
        Trigger each failure mode and observe recovery behavior
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {SCENARIOS.map((scenario) => {
          const result = results[scenario.id];
          const isLoadingScenario = isLoading[scenario.id];

          return (
            <div
              key={scenario.id}
              style={{
                border: '1px solid #eee',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {/* header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  background: '#fafafa',
                  borderBottom: result ? '1px solid #eee' : 'none',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: scenario.color,
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {scenario.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {scenario.description}
                  </div>
                </div>
                <button
                  onClick={() => runScenario(scenario.id)}
                  disabled={isLoadingScenario}
                  style={{
                    padding: '8px 18px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: isLoadingScenario ? '#ccc' : '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: isLoadingScenario ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isLoadingScenario ? 'Running...' : 'Run'}
                </button>
              </div>

              {/* result */}
              {result && (
                <div style={{ padding: '16px 20px' }}>
                  {/* summary */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background: result.success ? '#e8f5e9' : '#fdecea',
                        color: result.success ? '#2a7a2a' : '#cc0000',
                      }}
                    >
                      {result.success ? 'RECOVERED' : 'FAILED'}
                    </span>
                    <span style={{ fontSize: 13, color: '#888' }}>
                      {result.attempts} attempt
                      {result.attempts !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* timeline */}
                  {result.timeline.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        marginBottom: 12,
                      }}
                    >
                      {result.timeline.map((event, i) => {
                        const style = STATUS_STYLES[event.status];
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              padding: '6px 10px',
                              borderRadius: 6,
                              background: style.bg,
                              fontSize: 12,
                              fontFamily: 'monospace',
                            }}
                          >
                            <span
                              style={{
                                color: style.color,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {style.icon}
                            </span>
                            <span style={{ color: '#333' }}>
                              attempt {event.attempt}: {event.message}
                              {event.delayMs && (
                                <span style={{ color: '#aaa', marginLeft: 6 }}>
                                  (waiting {event.delayMs}ms)
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* final result or error */}
                  {result.result && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: '#f9f9f9',
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#333',
                        fontFamily: 'monospace',
                      }}
                    >
                      {result.result}
                    </div>
                  )}
                  {result.error && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: '#fdecea',
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#cc0000',
                        fontFamily: 'monospace',
                      }}
                    >
                      {result.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
