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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './OllamaProvider.js';
import { ContentGeneratorRole } from '../ContentGeneratorRole.js';

// Mock fetch for testing
global.fetch = vi.fn();

describe('OllamaProvider Integration', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
    vi.clearAllMocks();
  });

  it('should get models from Ollama API', async () => {
    const mockResponse = {
      models: [
        { name: 'llama2', modified_at: '2024-01-01T00:00:00Z', size: 1000000 },
        { name: 'codellama', modified_at: '2024-01-01T00:00:00Z', size: 2000000 }
      ]
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
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

  it('should set and get current model', () => {
    provider.setModel('llama2');
    expect(provider.getCurrentModel()).toBe('llama2');
  });

  it('should detect tool format for different models', () => {
    provider.setModel('llama2');
    expect(provider.getToolFormat()).toBe('llama');
    
    provider.setModel('deepseek-coder');
    expect(provider.getToolFormat()).toBe('deepseek');
  });

  it('should handle API errors gracefully', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('Network error'));

    await expect(provider.getModels()).rejects.toThrow();
  });
});

// Keep the original function for manual testing
export async function testOllamaProvider() {
  console.log('Testing Ollama Provider...');

  const provider = new OllamaProvider();
  
  try {
    // Test getting models
    console.log('Testing getModels()...');
    const models = await provider.getModels();
    console.log(`Found ${models.length} models:`, models.map(m => m.name));
    
    // Test setting model
    console.log('Testing setModel()...');
    provider.setModel('llama2');
    console.log('Current model:', provider.getCurrentModel());
    
    // Test tool format detection
    console.log('Testing getToolFormat()...');
    console.log('Tool format for llama2:', provider.getToolFormat());
    
    provider.setModel('deepseek-coder');
    console.log('Tool format for deepseek-coder:', provider.getToolFormat());
    
    console.log('✅ Ollama provider integration test passed!');
  } catch (error) {
    console.error('❌ Ollama provider integration test failed:', error);
  }
} 