/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const bundleDir = path.join(rootDir, 'bundle');

console.log('Installing prodigy CLI globally from bundle directory...');

try {
  // Change to bundle directory and install globally with force flag to overwrite existing
  const command = `cd "${bundleDir}" && npm install -g . --force`;
  execSync(command, { stdio: 'inherit' });
  
  console.log('\n✅ Successfully installed prodigy CLI globally!');
  console.log('You can now use the "prodigy" command from anywhere.');
  console.log('\nExample usage:');
  console.log('  prodigy --help');
  console.log('  prodigy "Write a function to sort an array"');
  
} catch (error) {
  console.error('❌ Error installing globally:', error.message);
  console.log('\nAlternative installation methods:');
  console.log('1. From the bundle directory: cd bundle && npm install -g .');
  console.log('2. From the zip file: unzip prodigy-code-0.1.15.zip && cd prodigy-code-0.1.15 && npm install -g .');
  process.exit(1);
} 