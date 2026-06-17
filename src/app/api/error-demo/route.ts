import {
  scenarioBadJson,
  scenarioHappyPath,
  scenarioPermanentError,
  scenarioToolFailure,
  scenarioTruncated,
  type ScenarioResult,
} from '@/lib/error-scenarios';

const scenarios: Record<string, () => Promise<ScenarioResult>> = {
  happy_path: scenarioHappyPath,
  bad_json: scenarioBadJson,
  truncated: scenarioTruncated,
  tool_failure: scenarioToolFailure,
  permanent_error: scenarioPermanentError,
};

export async function POST(req: Request) {
  const { scenario } = await req.json();

  const fn = scenarios[scenario];
  if (!fn) {
    return Response.json(
      { error: `Unknown scenario: ${scenario}` },
      { status: 400 },
    );
  }

  try {
    const result = await fn();
    return Response.json(result);
  } catch (error) {
    return Response.json({
      success: false,
      attempts: 0,
      error: error instanceof Error ? error.message : 'Unexpected error',
      timeline: [],
    });
  }
}
