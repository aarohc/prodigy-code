/**
 * Copyright 2025 Vybestack LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OllamaProvider } from './OllamaProvider.js';
import { IMessage } from '../IMessage.js';
import { ITool } from '../ITool.js';
import { ContentGeneratorRole } from '../ContentGeneratorRole.js';

// Mock fetch globally
(global as any).fetch = vi.fn();

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default base URL', () => {
      const provider = new OllamaProvider();
      expect(provider.name).toBe('ollama');
      expect(provider.getCurrentModel()).toBe('llama2');
    });

    it('should initialize with custom base URL', () => {
      const provider = new OllamaProvider('http://localhost:8080');
      expect(provider.name).toBe('ollama');
    });
  });

  describe('getModels', () => {
    it('should return default models when Ollama is not available', async () => {
      (fetch as any).mockRejectedValue(new Error('Connection failed'));

      const models = await provider.getModels();

      expect(models).toHaveLength(6);
      expect(models[0].id).toBe('llama2');
      expect(models[0].provider).toBe('ollama');
      expect(models[0].supportedToolFormats).toContain('llama');
    });

    it('should fetch models from Ollama API', async () => {
      const mockModels = {
        models: [
          {
            name: 'llama2',
            modified_at: '2024-01-01T00:00:00Z',
            size: 1000000000,
            digest: 'sha256:abc123',
            details: {
              format: 'gguf',
              family: 'llama',
              parameter_size: '7B',
              quantization_level: 'Q4_0',
            },
          },
          {
            name: 'codellama',
            modified_at: '2024-01-01T00:00:00Z',
            size: 2000000000,
            digest: 'sha256:def456',
            details: {
              format: 'gguf',
              family: 'codellama',
              parameter_size: '13B',
              quantization_level: 'Q4_0',
            },
          },
        ],
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });

      const models = await provider.getModels();

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama2');
      expect(models[1].id).toBe('codellama');
      expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    });

    it('should handle API errors gracefully', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      const models = await provider.getModels();

      expect(models).toHaveLength(6); // Should return default models
    });
  });

  describe('setModel and getCurrentModel', () => {
    it('should set and get the current model', () => {
      provider.setModel('codellama');
      expect(provider.getCurrentModel()).toBe('codellama');
    });
  });

  describe('getToolFormat', () => {
    it('should return llama format for llama models', () => {
      provider.setModel('llama2');
      expect(provider.getToolFormat()).toBe('llama');
    });

    it('should return deepseek format for deepseek models', () => {
      provider.setModel('deepseek-coder');
      expect(provider.getToolFormat()).toBe('deepseek');
    });

    it('should return qwen format for qwen models', () => {
      provider.setModel('qwen2.5-coder');
      expect(provider.getToolFormat()).toBe('qwen');
    });

    it('should return llama format as default', () => {
      provider.setModel('unknown-model');
      expect(provider.getToolFormat()).toBe('llama');
    });
  });

  describe('generateChatCompletion', () => {
    it('should generate chat completion without tools', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: () => Promise.resolve({ done: true }),
          }),
        },
      };

      (fetch as any).mockResolvedValue(mockResponse);

      const messages: IMessage[] = [
        { role: ContentGeneratorRole.USER, content: 'Hello, how are you?' },
      ];

      const generator = provider.generateChatCompletion(messages);
      const result = await generator.next();

      expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          stream: true,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 4096,
          },
        }),
      });
    });

    it('should generate chat completion with tools', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: () => Promise.resolve({ done: true }),
          }),
        },
      };

      (fetch as any).mockResolvedValue(mockResponse);

      const messages: IMessage[] = [
        { role: ContentGeneratorRole.USER, content: 'What is the weather like?' },
      ];

      const tools: ITool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the current weather',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state, e.g. San Francisco, CA',
                },
              },
              required: ['location'],
            },
          },
        },
      ];

      const generator = provider.generateChatCompletion(messages, tools);
      const result = await generator.next();

      expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama2',
          messages: [{ role: 'user', content: 'What is the weather like?' }],
          stream: true,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 4096,
          },
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get the current weather',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: 'The city and state, e.g. San Francisco, CA',
                    },
                  },
                  required: ['location'],
                },
              },
            },
          ],
          tool_choice: 'auto',
        }),
      });
    });

    it('should handle API errors', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      const messages: IMessage[] = [
        { role: ContentGeneratorRole.USER, content: 'Hello' },
      ];

      const generator = provider.generateChatCompletion(messages);

      await expect(generator.next()).rejects.toThrow('Ollama API error: 500 Internal Server Error - Server error');
    });
  });

  describe('isPaidMode', () => {
    it('should return false', () => {
      expect(provider.isPaidMode()).toBe(false);
    });
  });

  describe('getServerTools', () => {
    it('should return empty array', () => {
      expect(provider.getServerTools()).toEqual([]);
    });
  });

  describe('invokeServerTool', () => {
    it('should throw error', async () => {
      await expect(provider.invokeServerTool('test', {})).rejects.toThrow(
        'Server tools not supported by Ollama provider'
      );
    });
  });
}); 