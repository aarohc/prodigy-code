import { describe, it, expect } from 'vitest';
import { parseResponsesStream } from './parseResponsesStream.js';

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index < chunks.length) {
        const chunk = chunks[index++];
        controller.enqueue(encoder.encode(chunk));
      } else {
        controller.close();
      }
    },
  });
}

describe('parseResponsesStream - Responses API Tool Calls', () => {
  it('should parse complete tool calls from Responses API events', async () => {
    const chunks = [
      'data: {"type":"response.output_item.added","sequence_number":4,"output_index":1,"item":{"id":"fc_123","type":"function_call","status":"in_progress","arguments":"","call_id":"call_abc123","name":"get_weather"}}\n\n',
      'event: response.function_call_arguments.delta\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":5,"item_id":"fc_123","output_index":1,"delta":"{\\"location\\":"}\n\n',
      'event: response.function_call_arguments.delta\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":6,"item_id":"fc_123","output_index":1,"delta":"\\"San Francisco, CA\\"}"}\n\n',
      'event: response.function_call_arguments.done\n',
      'data: {"type":"response.function_call_arguments.done","sequence_number":7,"item_id":"fc_123","output_index":1,"arguments":"{\\"location\\":\\"San Francisco, CA\\"}"}\n\n',
      'data: {"type":"response.output_item.done","sequence_number":8,"output_index":1,"item":{"id":"fc_123","type":"function_call","status":"completed","arguments":"{\\"location\\":\\"San Francisco, CA\\"}","call_id":"call_abc123","name":"get_weather"}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    // Should have one message with tool calls
    const toolCallMessage = messages.find((m) => m.tool_calls);
    expect(toolCallMessage).toBeDefined();
    expect(toolCallMessage?.tool_calls).toHaveLength(1);
    expect(toolCallMessage?.tool_calls?.[0]).toEqual({
      id: 'call_abc123',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"location":"San Francisco, CA"}',
      },
    });
  });

  it('should handle tool calls with streaming arguments', async () => {
    const chunks = [
      'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"id":"fc_456","type":"function_call","status":"in_progress","arguments":"","call_id":"call_def456","name":"search_products"}}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":2,"item_id":"fc_456","output_index":0,"delta":"{\\"query\\":"}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":3,"item_id":"fc_456","output_index":0,"delta":"\\"laptop\\","}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":4,"item_id":"fc_456","output_index":0,"delta":"\\"max_price\\":"}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":5,"item_id":"fc_456","output_index":0,"delta":"1500}"}\n\n',
      'data: {"type":"response.output_item.done","sequence_number":6,"output_index":0,"item":{"id":"fc_456","type":"function_call","status":"completed","arguments":"{\\"query\\":\\"laptop\\",\\"max_price\\":1500}","call_id":"call_def456","name":"search_products"}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    const toolCallMessage = messages.find((m) => m.tool_calls);
    expect(toolCallMessage?.tool_calls?.[0]).toEqual({
      id: 'call_def456',
      type: 'function',
      function: {
        name: 'search_products',
        arguments: '{"query":"laptop","max_price":1500}',
      },
    });
  });

  it('should handle multiple concurrent tool calls', async () => {
    const chunks = [
      // First tool call starts
      'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"id":"fc_001","type":"function_call","status":"in_progress","arguments":"","call_id":"call_001","name":"tool1"}}\n\n',
      // Second tool call starts
      'data: {"type":"response.output_item.added","sequence_number":2,"output_index":1,"item":{"id":"fc_002","type":"function_call","status":"in_progress","arguments":"","call_id":"call_002","name":"tool2"}}\n\n',
      // Arguments for first tool
      'data: {"type":"response.function_call_arguments.delta","sequence_number":3,"item_id":"fc_001","output_index":0,"delta":"{\\"a\\":1}"}\n\n',
      // Arguments for second tool
      'data: {"type":"response.function_call_arguments.delta","sequence_number":4,"item_id":"fc_002","output_index":1,"delta":"{\\"b\\":2}"}\n\n',
      // Complete first tool
      'data: {"type":"response.output_item.done","sequence_number":5,"output_index":0,"item":{"id":"fc_001","type":"function_call","status":"completed","arguments":"{\\"a\\":1}","call_id":"call_001","name":"tool1"}}\n\n',
      // Complete second tool
      'data: {"type":"response.output_item.done","sequence_number":6,"output_index":1,"item":{"id":"fc_002","type":"function_call","status":"completed","arguments":"{\\"b\\":2}","call_id":"call_002","name":"tool2"}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    const toolCallMessages = messages.filter((m) => m.tool_calls);
    expect(toolCallMessages).toHaveLength(2);

    const tool1 = toolCallMessages.find(
      (m) => m.tool_calls?.[0].function.name === 'tool1',
    );
    expect(tool1?.tool_calls?.[0]).toEqual({
      id: 'call_001',
      type: 'function',
      function: {
        name: 'tool1',
        arguments: '{"a":1}',
      },
    });

    const tool2 = toolCallMessages.find(
      (m) => m.tool_calls?.[0].function.name === 'tool2',
    );
    expect(tool2?.tool_calls?.[0]).toEqual({
      id: 'call_002',
      type: 'function',
      function: {
        name: 'tool2',
        arguments: '{"b":2}',
      },
    });
  });

  it('should handle tool calls with empty arguments', async () => {
    const chunks = [
      'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"id":"fc_empty","type":"function_call","status":"in_progress","arguments":"","call_id":"call_empty","name":"no_args_tool"}}\n\n',
      'data: {"type":"response.output_item.done","sequence_number":2,"output_index":0,"item":{"id":"fc_empty","type":"function_call","status":"completed","arguments":"","call_id":"call_empty","name":"no_args_tool"}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    const toolCallMessage = messages.find((m) => m.tool_calls);
    expect(toolCallMessage?.tool_calls?.[0]).toEqual({
      id: 'call_empty',
      type: 'function',
      function: {
        name: 'no_args_tool',
        arguments: '',
      },
    });
  });

  it('should interleave text content and tool calls', async () => {
    const chunks = [
      'data: {"type":"response.output_text.delta","delta":"Let me search for that..."}\n\n',
      'data: {"type":"response.output_item.added","sequence_number":2,"output_index":1,"item":{"id":"fc_search","type":"function_call","status":"in_progress","arguments":"","call_id":"call_search","name":"search"}}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":3,"item_id":"fc_search","output_index":1,"delta":"{\\"query\\":\\"test\\"}"}\n\n',
      'data: {"type":"response.output_item.done","sequence_number":4,"output_index":1,"item":{"id":"fc_search","type":"function_call","status":"completed","arguments":"{\\"query\\":\\"test\\"}","call_id":"call_search","name":"search"}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    // Should have content message and tool call message
    expect(
      messages.some((m) => m.content === 'Let me search for that...'),
    ).toBe(true);
    expect(messages.some((m) => m.tool_calls)).toBe(true);
  });

  it('should handle usage data in response.completed event', async () => {
    const chunks = [
      'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"id":"fc_test","type":"function_call","status":"in_progress","arguments":"","call_id":"call_test","name":"test_tool"}}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":2,"item_id":"fc_test","output_index":0,"delta":"{\\"test\\":true}"}\n\n',
      'data: {"type":"response.output_item.done","sequence_number":3,"output_index":0,"item":{"id":"fc_test","type":"function_call","status":"completed","arguments":"{\\"test\\":true}","call_id":"call_test","name":"test_tool"}}\n\n',
      'data: {"type":"response.completed","sequence_number":4,"response":{"id":"resp_123","object":"response","model":"o3","status":"completed","usage":{"input_tokens":62,"output_tokens":23,"total_tokens":85}}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    // Should have tool call message and usage message
    expect(messages.some((m) => m.tool_calls)).toBe(true);
    const usageMessage = messages.find((m) => m.usage);
    expect(usageMessage?.usage).toEqual({
      prompt_tokens: 62,
      completion_tokens: 23,
      total_tokens: 85,
    });
  });

  it('should handle tool calls without call_id (using item id)', async () => {
    const chunks = [
      'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"id":"fc_no_call_id","type":"function_call","status":"in_progress","arguments":"","name":"test_tool"}}\n\n',
      'data: {"type":"response.function_call_arguments.delta","sequence_number":2,"item_id":"fc_no_call_id","output_index":0,"delta":"{\\"test\\":true}"}\n\n',
      'data: {"type":"response.output_item.done","sequence_number":3,"output_index":0,"item":{"id":"fc_no_call_id","type":"function_call","status":"completed","arguments":"{\\"test\\":true}","name":"test_tool"}}\n\n',
    ];

    const stream = createSSEStream(chunks);
    const messages = [];

    for await (const message of parseResponsesStream(stream)) {
      messages.push(message);
    }

    const toolCallMessage = messages.find((m) => m.tool_calls);
    expect(toolCallMessage?.tool_calls?.[0]).toEqual({
      id: 'fc_no_call_id', // Falls back to item.id when call_id is not provided
      type: 'function',
      function: {
        name: 'test_tool',
        arguments: '{"test":true}',
      },
    });
  });
});
