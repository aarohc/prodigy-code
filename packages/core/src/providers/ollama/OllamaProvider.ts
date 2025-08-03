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

import { IProvider } from '../IProvider.js';
import { IModel } from '../IModel.js';
import { ITool } from '../ITool.js';
import { IMessage } from '../IMessage.js';
import { ContentGeneratorRole } from '../ContentGeneratorRole.js';
import { IProviderConfig } from '../types/IProviderConfig.js';
import { ToolFormat } from '../../tools/IToolFormatter.js';

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
  format?: string;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: object;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaProvider implements IProvider {
  name: string = 'ollama';
  private baseURL: string;
  private currentModel: string = 'llama2';
  private config?: IProviderConfig;
  private toolFormatOverride?: ToolFormat;
  private apiKey?: string;
  private tokenUrl?: string;
  private cachedToken?: string;
  private tokenExpiry?: number;

  constructor(baseURL?: string, config?: IProviderConfig, apiKey?: string) {
    this.baseURL = baseURL || 'http://localhost:11434';
    this.config = config;
    this.apiKey = apiKey;
  }

  /**
   * Fetches a bearer token from the configured token URL
   * @returns The bearer token string
   */
  private async getBearerToken(): Promise<string | undefined> {
    // If no token URL is configured, return the static API key
    if (!this.tokenUrl) {
      return this.apiKey;
    }

    // Check if we have a cached token that's still valid (with 5 minute buffer)
    if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.cachedToken;
    }

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      
      // Handle different token response formats
      let token: string;
      let expiresIn: number | undefined;

      if (typeof tokenData === 'string') {
        // Simple string response
        token = tokenData;
      } else if (tokenData.access_token) {
        // OAuth-style response
        token = tokenData.access_token;
        expiresIn = tokenData.expires_in;
      } else if (tokenData.token) {
        // Custom token response
        token = tokenData.token;
        expiresIn = tokenData.expires_in;
      } else {
        throw new Error('Invalid token response format');
      }

      // Cache the token
      this.cachedToken = token;
      
      // Set expiry time (default to 1 hour if not provided)
      if (expiresIn) {
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
      } else {
        this.tokenExpiry = Date.now() + (3600 * 1000); // 1 hour default
      }

      return token;
    } catch (error) {
      console.error('Failed to fetch bearer token:', error);
      // Fall back to static API key if token fetch fails
      return this.apiKey;
    }
  }

  /**
   * Sets the URL for fetching bearer tokens
   * @param tokenUrl The URL to fetch tokens from
   */
  setTokenUrl(tokenUrl: string): void {
    this.tokenUrl = tokenUrl;
    // Clear cached token when URL changes
    this.cachedToken = undefined;
    this.tokenExpiry = undefined;
  }

  /**
   * Gets the current token URL
   * @returns The token URL or undefined if not set
   */
  getTokenUrl(): string | undefined {
    return this.tokenUrl;
  }

  /**
   * Clears the cached bearer token, forcing a new token fetch on next request
   */
  clearCachedToken(): void {
    this.cachedToken = undefined;
    this.tokenExpiry = undefined;
  }

  getToolFormat(): ToolFormat {
    // Check manual override first
    if (this.toolFormatOverride) {
      return this.toolFormatOverride;
    }

    // Check for settings override
    if (this.config?.providerToolFormatOverrides?.[this.name]) {
      return this.config.providerToolFormatOverrides[this.name] as ToolFormat;
    }

    // Auto-detect tool format based on model
    if (this.currentModel.includes('llama')) {
      return 'llama';
    }
    if (this.currentModel.includes('deepseek')) {
      return 'deepseek';
    }
    if (this.currentModel.includes('qwen')) {
      return 'qwen';
    }
    if (this.currentModel.includes('hermes')) {
      return 'hermes';
    }
    if (this.currentModel.includes('gemma')) {
      return 'gemma';
    }

    // Default to llama format for most Ollama models
    return 'llama';
  }

  async getModels(): Promise<IModel[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      const bearerToken = await this.getBearerToken();
      if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      }
      
      const response = await fetch(`${this.baseURL}/api/tags`, {
        headers,
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      const models: OllamaModel[] = data.models || [];

      return models.map((model) => ({
        id: model.name,
        name: model.name,
        provider: this.name,
        supportedToolFormats: ['llama', 'deepseek', 'qwen', 'hermes', 'gemma'],
        contextWindow: this.getContextWindowForModel(model.name),
        maxOutputTokens: 4096, // Default for most Ollama models
      }));
    } catch (error) {
      console.warn(`Failed to fetch Ollama models: ${error}`);
      // Return default models if we can't fetch from Ollama
      return [
        {
          id: 'llama2',
          name: 'llama2',
          provider: this.name,
          supportedToolFormats: ['llama'],
          contextWindow: 4096,
          maxOutputTokens: 4096,
        },
        {
          id: 'llama2:13b',
          name: 'llama2:13b',
          provider: this.name,
          supportedToolFormats: ['llama'],
          contextWindow: 4096,
          maxOutputTokens: 4096,
        },
        {
          id: 'llama2:70b',
          name: 'llama2:70b',
          provider: this.name,
          supportedToolFormats: ['llama'],
          contextWindow: 4096,
          maxOutputTokens: 4096,
        },
        {
          id: 'codellama',
          name: 'codellama',
          provider: this.name,
          supportedToolFormats: ['llama'],
          contextWindow: 100000,
          maxOutputTokens: 4096,
        },
        {
          id: 'deepseek-coder',
          name: 'deepseek-coder',
          provider: this.name,
          supportedToolFormats: ['deepseek'],
          contextWindow: 16384,
          maxOutputTokens: 4096,
        },
        {
          id: 'qwen2.5-coder',
          name: 'qwen2.5-coder',
          provider: this.name,
          supportedToolFormats: ['qwen'],
          contextWindow: 32768,
          maxOutputTokens: 4096,
        },
      ];
    }
  }

  private getContextWindowForModel(modelName: string): number {
    const contextWindows: Record<string, number> = {
      'llama2': 4096,
      'llama2:7b': 4096,
      'llama2:13b': 4096,
      'llama2:70b': 4096,
      'codellama': 100000,
      'codellama:7b': 100000,
      'codellama:13b': 100000,
      'codellama:34b': 100000,
      'deepseek-coder': 16384,
      'deepseek-coder:6.7b': 16384,
      'deepseek-coder:33b': 16384,
      'qwen2.5-coder': 32768,
      'qwen2.5-coder:7b': 32768,
      'qwen2.5-coder:32b': 32768,
      'hermes-coder': 8192,
      'gemma2-coder': 8192,
    };

    return contextWindows[modelName] || 4096;
  }

  async *generateChatCompletion(
    messages: IMessage[],
    tools?: ITool[],
    _toolFormat?: string,
  ): AsyncIterableIterator<IMessage> {
    const requestBody: OllamaChatRequest = {
      model: this.currentModel,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 4096,
      },
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));
      requestBody.tool_choice = 'auto';
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      const bearerToken = await this.getBearerToken();
      if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      }
      
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body from Ollama API');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          try {
            const data: OllamaChatResponse = JSON.parse(line);
            
            if (data.done) {
              // Final message with usage info
              const finalMessage: IMessage = {
                role: 'assistant' as ContentGeneratorRole,
                content: data.message.content || '',
                tool_calls: data.message.tool_calls,
                usage: {
                  prompt_tokens: data.prompt_eval_count || 0,
                  completion_tokens: data.eval_count || 0,
                  total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                },
              };
              yield finalMessage;
              return;
            } else {
              // Streaming message
              const message: IMessage = {
                role: 'assistant' as ContentGeneratorRole,
                content: data.message.content || '',
                tool_calls: data.message.tool_calls,
              };
              yield message;
            }
          } catch (parseError) {
            console.warn('Failed to parse Ollama response line:', line, parseError);
          }
        }
      }
    } catch (error) {
      console.error('Error in Ollama chat completion:', error);
      throw error;
    }
  }

  setModel(modelId: string): void {
    this.currentModel = modelId;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setBaseUrl(baseUrl?: string): void {
    this.baseURL = baseUrl || 'http://localhost:11434';
  }

  setConfig(config: IProviderConfig): void {
    this.config = config;
  }

  setToolFormatOverride(format: ToolFormat | null): void {
    this.toolFormatOverride = format || undefined;
  }

  isPaidMode(): boolean {
    return false; // Ollama is free to use
  }

  clearState(): void {
    // No state to clear for Ollama provider
  }

  getServerTools(): string[] {
    return []; // Ollama doesn't have server tools
  }

  async invokeServerTool(
    _toolName: string,
    _params: unknown,
    _config?: unknown,
  ): Promise<unknown> {
    throw new Error('Server tools not supported by Ollama provider');
  }
} 