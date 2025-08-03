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

// Read package.json to get version
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Create tgz filename
const tgzFileName = `prodigy-cli-${version}.tgz`;
const tgzFilePath = path.join(rootDir, tgzFileName);

console.log(`Creating ${tgzFileName}...`);

try {
  // Remove existing tgz file if it exists
  if (fs.existsSync(tgzFilePath)) {
    fs.unlinkSync(tgzFilePath);
    console.log(`Removed existing ${tgzFileName}`);
  }

  // Create tgz file using npm pack
  const command = `npm pack`;
  execSync(command, { stdio: 'inherit', cwd: rootDir });

  // Rename the generated tgz file to our desired name
  const generatedTgzName = `${packageJson.name.replace('@', '').replace('/', '-')}-${version}.tgz`;
  const generatedTgzPath = path.join(rootDir, generatedTgzName);
  
  if (fs.existsSync(generatedTgzPath)) {
    fs.renameSync(generatedTgzPath, tgzFilePath);
    console.log(`Successfully created ${tgzFileName}`);
    console.log(`File size: ${(fs.statSync(tgzFilePath).size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.error(`Error: Expected file not found: ${generatedTgzName}`);
    process.exit(1);
  }
  
} catch (error) {
  console.error('Error creating tgz file:', error.message);
  process.exit(1);
} 