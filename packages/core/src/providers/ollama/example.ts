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

/**
 * Example usage of the Ollama provider
 */
async function example() {
  console.log('🚀 Ollama Provider Example');
  console.log('==========================\n');

  // Create provider instance
  const provider = new OllamaProvider();
  
  try {
    // Get available models
    console.log('📋 Available Models:');
    const models = await provider.getModels();
    models.forEach(model => {
      console.log(`  - ${model.name} (${model.provider})`);
    });
    console.log();

    // Set a model
    provider.setModel('llama2');
    console.log(`🎯 Using model: ${provider.getCurrentModel()}`);
    console.log(`🔧 Tool format: ${provider.getToolFormat()}`);
    console.log();

    // Example chat completion
    console.log('💬 Chat Example:');
    const messages = [
      { role: ContentGeneratorRole.USER, content: 'Hello! Can you help me write a simple Python function to calculate the factorial of a number?' }
    ];

    console.log('User:', messages[0].content);
    console.log('\nAssistant:');
    
    const generator = provider.generateChatCompletion(messages);
    let response = '';
    
    for await (const chunk of generator) {
      if (chunk.content) {
        response += chunk.content;
        process.stdout.write(chunk.content);
      }
    }
    
    console.log('\n\n✅ Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\n💡 Make sure Ollama is running: ollama serve');
  }
}

// Run the example if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] === import.meta.url) {
  example();
}

export { example }; 