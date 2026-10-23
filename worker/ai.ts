const SYSTEM = `あなたはタスク管理アプリの整理係です。ユーザーのメモ（多くは音声入力で、誤変換や句読点の抜けがある）を読み、実行できるタスクの一覧に分けます。
- 音声認識の誤変換や言い間違いは、文脈から正しい言葉に直す
- 1つのタスクに1つの行動。短く（40文字以内）、「〜する」の形で終える
- メモにない作業を足さない。挨拶・感想・前置きは捨てる
- 最大12個。順番はメモの流れのまま
出力は JSON のみ：{"tasks":["…"]}`;

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'tasks',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['tasks'],
      properties: { tasks: { type: 'array', maxItems: 12, items: { type: 'string' } } },
    },
  },
} as const;

function clean(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const t = item.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 12);
}

/** モデルの答えから {"tasks": [...]} を取り出す。前後に余計な文字があっても読む */
export function parseTasks(content: unknown): string[] {
  if (content && typeof content === 'object') return clean((content as { tasks?: unknown }).tasks);
  if (typeof content !== 'string') return [];
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    return clean(JSON.parse(content.slice(start, end + 1)).tasks);
  } catch {
    return [];
  }
}

function mockSplit(text: string) {
  return clean(text.split(/[。\n、]|それから|あと/).map((s) => s.trim()));
}

export async function splitMemo(env: Env, text: string, mock: boolean): Promise<string[]> {
  if (mock) return mockSplit(text);
  const result = (await env.AI.run(env.AI_MODEL as keyof AiModels, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: text },
    ],
    response_format: RESPONSE_FORMAT,
    max_completion_tokens: 600,
    temperature: 0.2,
    // 考える過程は出さずに、すぐ答えさせる（速さと消費量のため）
    chat_template_kwargs: { enable_thinking: false },
  } as never)) as { choices?: { message?: { content?: unknown } }[]; response?: unknown };
  const content = result.choices?.[0]?.message?.content ?? result.response;
  const tasks = parseTasks(content);
  if (!tasks.length) throw new Error('empty answer');
  return tasks;
}
