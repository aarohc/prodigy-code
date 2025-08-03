/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const bundleDir = path.join(rootDir, 'bundle');

// Read package.json to get version
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Create zip filename
const zipFileName = `prodigy-code-${version}.zip`;
const zipFilePath = path.join(rootDir, zipFileName);

console.log(`Creating ${zipFileName} from bundle directory...`);

try {
  // Check if bundle directory exists
  if (!fs.existsSync(bundleDir)) {
    console.error('Error: bundle directory not found. Please run "npm run bundle" first.');
    process.exit(1);
  }

  // Remove existing zip file if it exists
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
    console.log(`Removed existing ${zipFileName}`);
  }

  // Create zip file from bundle directory
  const command = `cd "${bundleDir}" && zip -r "${zipFilePath}" .`;
  execSync(command, { stdio: 'inherit' });

  console.log(`Successfully created ${zipFileName}`);
  console.log(`File size: ${(fs.statSync(zipFilePath).size / 1024 / 1024).toFixed(2)} MB`);
  
} catch (error) {
  console.error('Error creating zip file:', error.message);
  process.exit(1);
} 