export type EvalCase = {
  id: string;
  question: string;
  expected_topics: string[]; // what the answer should cover
  should_use_tool?: string; // which tool should fire, if any
  case_type: 'retrieval' | 'live_data';
};

export const ragCases: EvalCase[] = [
  {
    id: 'rag-01',
    question: 'How does streaming work in the Anthropic API?',
    expected_topics: ['token by token', 'server-sent events', 'incremental'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-02',
    question: 'What is RAG?',
    expected_topics: ['retrieval', 'augmented', 'generation', 'knowledge base'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-03',
    question: 'What is pgvector used for?',
    expected_topics: ['vector', 'embeddings', 'similarity search', 'postgres'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-04',
    question: 'What are embeddings?',
    expected_topics: [
      'numerical representation',
      'semantic',
      'vector',
      'similarity',
    ],
    case_type: 'retrieval',
  },
  {
    id: 'rag-05',
    question: 'What does stop_reason mean in an Anthropic response?',
    expected_topics: ['end_turn', 'tool_use', 'stop reason'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-06',
    question: 'What is the capital of France?', // out of domain — should say it doesn't know
    expected_topics: [],
    case_type: 'retrieval',
  },
  {
    id: 'rag-07',
    question: 'How do I use tool use with Claude?',
    expected_topics: ['function', 'tool_use block', 'arguments', 'result'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-08',
    question: 'What model should I use for embeddings?',
    expected_topics: ['embedding', 'model'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-09',
    question: 'How is RAG different from fine-tuning?',
    expected_topics: ['retrieval', 'knowledge base', 'query time'],
    case_type: 'retrieval',
  },
  {
    id: 'rag-10',
    question: 'What distance metric does pgvector use?',
    expected_topics: ['cosine', 'L2', 'inner product', 'distance'],
    case_type: 'retrieval',
  },
];

export const agentCases: EvalCase[] = [
  {
    id: 'agent-01',
    question: 'What is the PTO policy at Acme Corp?',
    expected_topics: ['15 days', '20 days', '25 days', 'tenure'],
    should_use_tool: 'search_handbook',
    case_type: 'retrieval',
  },
  {
    id: 'agent-02',
    question: 'How do I request time off?',
    expected_topics: ['Workday', '5 business days', 'manager'],
    should_use_tool: 'search_handbook',
    case_type: 'retrieval',
  },
  {
    id: 'agent-03',
    question: 'How much PTO does alice.bob have remaining?',
    expected_topics: ['balance', 'used', 'remaining'],
    should_use_tool: 'get_pto_balance',
    case_type: 'live_data',
  },
  {
    id: 'agent-04',
    question: 'What is the learning and development budget?',
    expected_topics: ['2000', 'courses', 'pre-approved'],
    should_use_tool: 'search_handbook',
    case_type: 'retrieval',
  },
  {
    id: 'agent-05',
    question: 'What are the remote work rules?',
    expected_topics: ['3 days', 'core hours', '10am', '3pm'],
    should_use_tool: 'search_handbook',
    case_type: 'retrieval',
  },
  {
    id: 'agent-06',
    question: "What is alice.bob's role and department?",
    expected_topics: ['engineer', 'engineering'],
    should_use_tool: 'get_employee_info',
    case_type: 'live_data',
  },
  {
    id: 'agent-07',
    question: 'How does the on-call rotation work?',
    expected_topics: ['one week', 'P1', 'P2', '500'],
    should_use_tool: 'search_handbook',
    case_type: 'retrieval',
  },
  {
    id: 'agent-08',
    question: 'What is the parental leave policy?',
    expected_topics: ['16 weeks', '6 weeks', 'primary', 'secondary'],
    should_use_tool: 'search_handbook',
    case_type: 'retrieval',
  },
  {
    id: 'agent-09',
    question: 'How much PTO does alice.bob get given his tenure?',
    expected_topics: ['20 days', '2-5 years', 'tenure'],
    should_use_tool: 'search_handbook',
    case_type: 'live_data',
  },
  {
    id: 'agent-10',
    question: 'What is the weather in Chicago?', // out of domain
    expected_topics: [],
    case_type: 'retrieval',
  },
];
