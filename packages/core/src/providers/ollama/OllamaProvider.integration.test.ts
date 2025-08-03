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

import { OllamaProvider } from './OllamaProvider.js';
import { ContentGeneratorRole } from '../ContentGeneratorRole.js';

// Simple integration test that can be run manually
async function testOllamaProvider() {
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

// Run the test if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  testOllamaProvider();
}

export { testOllamaProvider }; 