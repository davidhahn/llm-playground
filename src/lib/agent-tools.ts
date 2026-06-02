import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Pool } from 'pg';

const openai = new OpenAI();

// mock employee database
const employees: Record<
  string,
  {
    name: string;
    role: string;
    department: string;
    tenure_years: number;
    manager: string;
    pto_balance: number;
    pto_used: number;
  }
> = {
  'alice.bob': {
    name: 'Alice Bob',
    role: 'Senior Frontend Engineer',
    department: 'Engineering',
    tenure_years: 3,
    manager: 'Charlie David',
    pto_balance: 20,
    pto_used: 5,
  },
  'charlie.david': {
    name: 'Charlie David',
    role: 'Engineering Manager',
    department: 'Engineering',
    tenure_years: 6,
    manager: 'Eric Frank',
    pto_balance: 25,
    pto_used: 8,
  },
};

export const tools: Anthropic.Tool[] = [
  {
    name: 'search_handbook',
    description:
      'Search the company handbook for policies, procedures, and guidelines. Use this for questions about PTO policy, benefits, remote work, expenses, equipment, performance reviews, parental leave, or any other company policy.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            "The search query — describe what policy or information you're looking for",
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_employee_info',
    description:
      "Look up an employee's profile information including their role, department, tenure, and manager. Use this when asked about a specific employee or when you need their tenure to answer a PTO question.",
    input_schema: {
      type: 'object' as const,
      properties: {
        username: {
          type: 'string',
          description:
            "The employee's username in format firstname.lastname, e.g. alice.bob",
        },
      },
      required: ['username'],
    },
  },
  {
    name: 'get_pto_balance',
    description:
      "Get an employee's current PTO balance and usage for the year. Use this when asked how much PTO someone has left or how much they've used.",
    input_schema: {
      type: 'object' as const,
      properties: {
        username: {
          type: 'string',
          description: "The employee's username in format firstname.lastname",
        },
      },
      required: ['username'],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, string>,
  pool: Pool,
): Promise<string> {
  if (name === 'search_handbook') {
    const results = await searchHandbook(input.query, pool);
    if (results.length === 0) {
      return JSON.stringify({
        results: [],
        message: 'No relevant handbook entries found.',
      });
    }
    return JSON.stringify({
      results: results.map((r) => ({
        content: r.content,
        section: r.metadata.section,
        topic: r.metadata.topic,
        similarity: Number(r.similarity).toFixed(3),
      })),
    });
  }

  if (name === 'get_employee_info') {
    const employee = employees[input.username];
    if (!employee) {
      return JSON.stringify({ error: `Employee ${input.username} not found.` });
    }
    return JSON.stringify(employee);
  }

  if (name === 'get_pto_balance') {
    const employee = employees[input.username];
    if (!employee) {
      return JSON.stringify({ error: `Employee ${input.username} not found.` });
    }
    return JSON.stringify({
      username: input.username,
      pto_balance: employee.pto_balance,
      pto_used: employee.pto_used,
      pto_remaining: employee.pto_balance - employee.pto_used,
    });
  }

  return JSON.stringify({ error: 'Unknown tool' });
}

async function searchHandbook(query: string, pool: Pool) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const vectorString = `[${response.data[0].embedding.join(',')}]`;

  const result = await pool.query(
    `SELECT content, metadata, similarity
     FROM (
       SELECT content, metadata, 1 - (embedding <=> $1::vector) AS similarity
       FROM handbook
     ) subq
     WHERE similarity > 0.3
     ORDER BY similarity DESC
     LIMIT 3`,
    [vectorString],
  );

  return result.rows;
}
