import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRuntimeMessages, parseSSE } from '../engine.mjs';

test('图片以本地 base64 传递给推理引擎，保留多轮消息', () => {
  const result = toRuntimeMessages([
    { role: 'user', content: '译文', images: ['aGVsbG8='] },
    { role: 'assistant', content: 'hello' },
  ]);
  assert.equal(result[0].content[1].image_url.url, 'data:image/jpeg;base64,aGVsbG8=');
  assert.equal(result[1].content, 'hello');
});
test('SSE 解析能处理跨块 UTF-8、CRLF 与最终 DONE', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"中文"}\r\n\r\ndata: [DONE]\n\n');
  async function* input() {
    for (let i = 0; i < bytes.length; i += 2) yield bytes.slice(i, i + 2);
  }
  const result = [];
  for await (const event of parseSSE(input())) result.push(event);
  assert.deepEqual(result, ['{"text":"中文"}', '[DONE]']);
});

test('长上下文裁剪完整旧轮次，保留系统提示和最新图片且不修改原始记录', async () => {
  const { prepareContext } = await import('../engine.mjs');
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: '旧问题'.repeat(4000) },
    { role: 'assistant', content: '旧答案' },
    { role: 'user', content: '最新图片', images: ['image'] },
  ];
  const result = prepareContext(messages, 16384);
  assert.deepEqual(result.messages, [messages[0], messages[3]]);
  assert.equal(result.maxTokens, 4096);
  assert.equal(messages.length, 4);
});

test('单轮超长输入不截断当前问题，留给引擎准确判断；短对话完整保留', async () => {
  const { prepareContext, dropOldestTurn } = await import('../engine.mjs');
  const messages = [
    { role: 'system', content: 's' },
    { role: 'user', content: 'x'.repeat(20000) },
  ];
  assert.equal(dropOldestTurn(messages), null);
  assert.deepEqual(prepareContext(messages, 16384).messages, messages);
  const short = [{ role: 'user', content: '你好' }];
  assert.deepEqual(prepareContext(short, 8192), { messages: short, maxTokens: 2048 });
});
