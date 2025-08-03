/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ErrorInfo } from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { ErrorBoundary } from './ui/components/ErrorBoundary.js';
import { loadCliConfig, parseArguments, CliArgs } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import dns from 'node:dns';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
import chalk from 'chalk';
import {
  DnsResolutionOrder,
  LoadedSettings,
  loadSettings,
  SettingScope,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions, Extension } from './config/extension.js';
import { cleanupCheckpoints, registerCleanup } from './utils/cleanup.js';
import { getCliVersion } from './utils/version.js';
import {
  Config,
  EditTool,
  ShellTool,
  WriteFileTool,
  sessionId,
  // TELEMETRY REMOVED: logUserPrompt disabled
  AuthType,
  getOauthClient,
} from '@vybestack/llxprt-code-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { getProviderManager } from './providers/providerManagerInstance.js';
import {
  setProviderApiKey,
  setProviderApiKeyFromFile,
  setProviderBaseUrl,
} from './providers/providerConfigUtils.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { checkForUpdates } from './ui/utils/updateCheck.js';
import { handleAutoUpdate } from './utils/handleAutoUpdate.js';
import { appEvents, AppEvent } from './utils/events.js';

export function validateDnsResolutionOrder(
  order: string | undefined,
): DnsResolutionOrder {
  const defaultValue: DnsResolutionOrder = 'ipv4first';
  if (order === undefined) {
    return defaultValue;
  }
  if (order === 'ipv4first' || order === 'verbatim') {
    return order;
  }
  // We don't want to throw here, just warn and use the default.
  console.warn(
    `Invalid value for dnsResolutionOrder in settings: "${order}". Using default "${defaultValue}".`,
  );
  return defaultValue;
}

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.LLXPRT_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, LLXPRT_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}
import { runAcpPeer } from './acp/acpPeer.js';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export function setupUnhandledRejectionHandler() {
  let unhandledRejectionOccurred = false;
  process.on('unhandledRejection', (reason, _promise) => {
    const errorMessage = `=========================================
This is an unexpected error. Please file a bug report using the /bug tool.
CRITICAL: Unhandled Promise Rejection!
=========================================
Reason: ${reason}${
      reason instanceof Error && reason.stack
        ? `
Stack trace:
${reason.stack}`
        : ''
    }`;
    appEvents.emit(AppEvent.LogError, errorMessage);
    if (!unhandledRejectionOccurred) {
      unhandledRejectionOccurred = true;
      appEvents.emit(AppEvent.OpenDebugConsole);
    }
  });
}

export async function main() {
  setupUnhandledRejectionHandler();

  // Create .llxprt directory if it doesn't exist
  const llxprtDir = join(homedir(), '.llxprt');
  if (!existsSync(llxprtDir)) {
    mkdirSync(llxprtDir, { recursive: true });
  }
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);
  const argv = await parseArguments();

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      const errorMessage = `Error in ${error.path}: ${error.message}`;
      console.error(chalk.red(errorMessage));
      console.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  const providerManager = getProviderManager(config);
  config.setProviderManager(providerManager);

  // Ensure serverToolsProvider (Gemini) has config set if it's not the active provider
  const serverToolsProvider = providerManager.getServerToolsProvider();
  if (
    serverToolsProvider &&
    serverToolsProvider.name === 'gemini' &&
    serverToolsProvider.setConfig
  ) {
    serverToolsProvider.setConfig(config);
  }

  // Set DNS resolution order (prefer IPv4 by default)
  dns.setDefaultResultOrder(
    validateDnsResolutionOrder(settings.merged.dnsResolutionOrder),
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    console.error(
      'Error: The --prompt-interactive flag is not supported when piping input from stdin.',
    );
    process.exit(1);
  }

  if (config.getListExtensions()) {
    for (const _extension of extensions) {
      // List extensions without console.log
    }
    process.exit(0);
  }

  // Set a default auth type if one isn't set.
  if (!settings.merged.selectedAuthType) {
    if (process.env.CLOUD_SHELL === 'true') {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.CLOUD_SHELL,
      );
    } else if (process.env.LLXPRT_AUTH_TYPE === 'none') {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.USE_NONE,
      );
    }
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  await config.initialize();

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.customThemes);

  // If a provider is specified via CLI, activate it after initialization
  const configProvider = config.getProvider();
  if (configProvider) {
    try {
      await providerManager.setActiveProvider(configProvider);

      // Set the model from command line args after activating provider
      const configModel = config.getModel();
      const activeProvider = providerManager.getActiveProvider();
      if (configModel && activeProvider.setModel) {
        activeProvider.setModel(configModel);
      }

      // No need to set auth type when using a provider
    } catch (e) {
      console.error(chalk.red((e as Error).message));
      process.exit(1);
    }
  }

  // Process CLI-provided credentials (--key, --keyfile, --baseurl)
  if (argv.key || argv.keyfile || argv.baseurl) {
    // Provider-specific credentials are now handled directly

    // Handle --key
    if (argv.key) {
      const result = await setProviderApiKey(
        providerManager,
        settings,
        argv.key,
        config,
      );
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      if (config.getDebugMode()) {
        console.debug(result.message);
      }
    }

    // Handle --keyfile
    if (argv.keyfile) {
      const result = await setProviderApiKeyFromFile(
        providerManager,
        settings,
        argv.keyfile,
        config,
      );
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      if (config.getDebugMode()) {
        console.debug(result.message);
      }
    }

    // Handle --baseurl
    if (argv.baseurl) {
      const result = await setProviderBaseUrl(
        providerManager,
        settings,
        argv.baseurl,
      );
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      if (config.getDebugMode()) {
        console.debug(result.message);
      }
    }
  }

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
      ? getNodeMemoryArgs(config)
      : [];
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (
        settings.merged.selectedAuthType &&
        !settings.merged.useExternalAuth
      ) {
        // Validate authentication here because the sandbox will interfere with the Oauth2 web redirect.
        try {
          const err = validateAuthMethod(settings.merged.selectedAuthType);
          if (err) {
            throw new Error(err);
          }
          await config.refreshAuth(settings.merged.selectedAuthType);
        } catch (err) {
          console.error('Error authenticating:', err);
          process.exit(1);
        }
      }
      await start_sandbox(sandboxConfig, memoryArgs, config);
      process.exit(0);
    } else {
      // Not in a sandbox and not entering one, so relaunch with additional
      // arguments to control memory usage if needed.
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0);
      }
    }
  }

  if (
    settings.merged.selectedAuthType === AuthType.LOGIN_WITH_GOOGLE &&
    config.isBrowserLaunchSuppressed()
  ) {
    // Do oauth before app renders to make copying the link possible.
    await getOauthClient(settings.merged.selectedAuthType, config);
  }

  if (config.getExperimentalAcp()) {
    return runAcpPeer(config, settings);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  // Check if a provider is already active on startup
  providerManager.getActiveProvider();

  const shouldBeInteractive =
    !!argv.promptInteractive || (process.stdin.isTTY && !input);

  function handleError(error: Error, errorInfo: ErrorInfo) {
    // Log to console for debugging
    console.error('Application Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);

    // Special handling for maximum update depth errors
    if (error.message.includes('Maximum update depth exceeded')) {
      console.error('\n🚨 RENDER LOOP DETECTED!');
      console.error('This is likely caused by:');
      console.error('- State updates during render');
      console.error('- Incorrect useEffect dependencies');
      console.error('- Non-memoized props causing re-renders');
      console.error('\nCheck recent changes to React components and hooks.');
    }
  }

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (shouldBeInteractive) {
    const version = await getCliVersion();
    setWindowTitle(basename(workspaceRoot), settings);

    // Initialize authentication before rendering to ensure geminiClient is available
    if (settings.merged.selectedAuthType) {
      try {
        const err = validateAuthMethod(settings.merged.selectedAuthType);
        if (err) {
          console.error('Error validating authentication method:', err);
          process.exit(1);
        }
      } catch (err) {
        console.error('Error authenticating:', err);
        process.exit(1);
      }
    }

    const instance = render(
      <React.StrictMode>
        <ErrorBoundary
          // eslint-disable-next-line react/jsx-no-bind
          onError={handleError}
        >
          <AppWrapper
            config={config}
            settings={settings}
            startupWarnings={startupWarnings}
            version={version}
          />
        </ErrorBoundary>
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );

    checkForUpdates()
      .then((info) => {
        handleAutoUpdate(info, settings, config.getProjectRoot());
      })
      .catch((err) => {
        // Silently ignore update check errors.
        if (config.getDebugMode()) {
          console.error('Update check failed:', err);
        }
      });

    registerCleanup(() => instance.unmount());
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY && !input) {
    input += await readStdin();
  }
  if (!input) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  // TELEMETRY REMOVED: Disabled Google data collection
  // logUserPrompt(config, {
  //   'event.name': 'user_prompt',
  //   'event.timestamp': new Date().toISOString(),
  //   prompt: input,
  //   prompt_id,
  //   auth_type: config.getContentGeneratorConfig()?.authType,
  //   prompt_length: input.length,
  // });

  // Non-interactive mode handled by runNonInteractive
  const nonInteractiveConfig = await loadNonInteractiveConfig(
    config,
    extensions,
    settings,
    argv,
  );

  await runNonInteractive(nonInteractiveConfig, input, prompt_id);
  process.exit(0);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    const windowTitle = (process.env.CLI_TITLE || `Prodigy - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      '',
    );
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

async function loadNonInteractiveConfig(
  config: Config,
  extensions: Extension[],
  settings: LoadedSettings,
  argv: CliArgs,
) {
  let finalConfig = config;

  if (!argv.yolo) {
    // Everything is not allowed, ensure that only read-only tools are configured.
    const existingExcludeTools = settings.merged.excludeTools || [];
    const interactiveTools = [
      ShellTool.Name,
      EditTool.Name,
      WriteFileTool.Name,
    ];

    const newExcludeTools = [
      ...new Set([...existingExcludeTools, ...interactiveTools]),
    ];

    const nonInteractiveSettings = {
      ...settings.merged,
      excludeTools: newExcludeTools,
    };
    finalConfig = await loadCliConfig(
      nonInteractiveSettings,
      extensions,
      config.getSessionId(),
      argv,
    );
    await finalConfig.initialize();
  }

  // Always set up provider manager for non-interactive mode
  const providerManager = getProviderManager(finalConfig);
  finalConfig.setProviderManager(providerManager);

  // Activate provider if specified
  if (argv.provider) {
    await providerManager.setActiveProvider(argv.provider);

    // Set model if specified and provider supports it
    if (argv.model) {
      const activeProvider = providerManager.getActiveProvider();
      if (activeProvider && typeof activeProvider.setModel === 'function') {
        activeProvider.setModel(argv.model);
      }
    }
  }

  // Process CLI-provided credentials (--key, --keyfile, --baseurl)
  if (argv.key || argv.keyfile || argv.baseurl) {
    // Provider-specific credentials are now handled directly

    // Handle --key
    if (argv.key) {
      const result = await setProviderApiKey(
        providerManager,
        settings,
        argv.key,
        finalConfig,
      );
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      if (finalConfig.getDebugMode()) {
        console.debug(result.message);
      }
    }

    // Handle --keyfile
    if (argv.keyfile) {
      const result = await setProviderApiKeyFromFile(
        providerManager,
        settings,
        argv.keyfile,
        finalConfig,
      );
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      if (finalConfig.getDebugMode()) {
        console.debug(result.message);
      }
    }

    // Handle --baseurl
    if (argv.baseurl) {
      const result = await setProviderBaseUrl(
        providerManager,
        settings,
        argv.baseurl,
      );
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      if (finalConfig.getDebugMode()) {
        console.debug(result.message);
      }
    }
  }

  return await validateNonInteractiveAuth(
    settings.merged.selectedAuthType,
    settings.merged.useExternalAuth,
    finalConfig,
  );
}
