# Ollama Provider

This directory contains the Ollama provider implementation for LLxprt Code, allowing users to use local Ollama models for AI interactions.

## Features

- **Local Model Support**: Connect to Ollama running locally on your machine
- **Multiple Model Support**: Works with various Ollama models including Llama2, CodeLlama, DeepSeek, Qwen, and more
- **Tool Support**: Supports function calling with different tool formats based on the model
- **Streaming**: Real-time streaming responses from Ollama models
- **No API Keys**: Ollama runs locally, so no API keys are required

## Setup

### 1. Install Ollama

First, install Ollama on your system:

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

### 2. Start Ollama

```bash
ollama serve
```

### 3. Pull Models

Pull the models you want to use:

```bash
# Basic Llama2 model
ollama pull llama2

# CodeLlama for coding tasks
ollama pull codellama

# DeepSeek Coder
ollama pull deepseek-coder

# Qwen2.5 Coder
ollama pull qwen2.5-coder
```

### 4. Configure LLxprt Code

The Ollama provider is automatically registered when you start LLxprt Code. You can configure it using:

#### Environment Variables

```bash
# Set custom Ollama base URL (default: http://localhost:11434)
export OLLAMA_BASE_URL=http://localhost:11434

# Set API key for authentication (optional)
export OLLAMA_API_KEY=your-api-key

# Set app key and secret for token generation (optional)
export OLLAMA_APP_KEY=your-app-key
export OLLAMA_APP_SECRET=your-app-secret
```

**Note**: The `OLLAMA_APP_KEY` and `OLLAMA_APP_SECRET` environment variables are used when fetching bearer tokens from a token URL. These credentials are sent as `X-App-Key` and `X-App-Secret` headers respectively when making token requests.

#### CLI Commands

```bash
# Switch to Ollama provider
/provider ollama

# List available models
/model

# Switch to a specific model
/model llama2
/model codellama
/model deepseek-coder
```

## Supported Models

The provider automatically detects and supports various model families:

### Llama Family
- `llama2` - General purpose model
- `llama2:7b`, `llama2:13b`, `llama2:70b` - Different sizes
- **Tool Format**: `llama`

### CodeLlama Family
- `codellama` - Specialized for code generation
- `codellama:7b`, `codellama:13b`, `codellama:34b`
- **Tool Format**: `llama`
- **Context Window**: 100,000 tokens

### DeepSeek Family
- `deepseek-coder` - Code generation model
- `deepseek-coder:6.7b`, `deepseek-coder:33b`
- **Tool Format**: `deepseek`
- **Context Window**: 16,384 tokens

### Qwen Family
- `qwen2.5-coder` - Code generation model
- `qwen2.5-coder:7b`, `qwen2.5-coder:32b`
- **Tool Format**: `qwen`
- **Context Window**: 32,768 tokens

### Other Models
- `hermes-coder` - Hermes coding model
- `gemma2-coder` - Gemma coding model

## Tool Support

The provider automatically detects the appropriate tool format based on the model:

- **Llama models**: Use `llama` format
- **DeepSeek models**: Use `deepseek` format  
- **Qwen models**: Use `qwen` format
- **Hermes models**: Use `hermes` format
- **Gemma models**: Use `gemma` format

## Usage Examples

### Basic Chat

```bash
# Switch to Ollama
/provider ollama

# Start chatting
Hello, can you help me write a Python function?
```

### Code Generation

```bash
# Switch to CodeLlama
/provider ollama
/model codellama

# Ask for code
Write a function to calculate fibonacci numbers
```

### Tool Usage

```bash
# Switch to a model that supports tools
/provider ollama
/model deepseek-coder

# Use tools (the provider will automatically format them correctly)
What's the weather like in San Francisco?
```

## Configuration

### Custom Base URL

If you're running Ollama on a different port or host:

```bash
export OLLAMA_BASE_URL=http://192.168.1.100:11434
```

### Model-Specific Settings

You can configure model-specific settings in your user settings:

```json
{
  "providerToolFormatOverrides": {
    "ollama": "llama"
  },
  "defaultModel": "codellama"
}
```

## Troubleshooting

### Connection Issues

If you can't connect to Ollama:

1. **Check if Ollama is running**:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. **Verify the base URL**:
   ```bash
   export OLLAMA_BASE_URL=http://localhost:11434
   ```

3. **Check firewall settings** if running on a remote machine

### Model Not Found

If a model isn't available:

1. **Pull the model**:
   ```bash
   ollama pull model-name
   ```

2. **List available models**:
   ```bash
   ollama list
   ```

### Tool Format Issues

If tools aren't working correctly:

1. **Check the model's tool format**:
   ```bash
   /model
   ```

2. **Manually set tool format** if needed:
   ```json
   {
     "providerToolFormatOverrides": {
       "ollama": "llama"
     }
   }
   ```

## Development

### Running Tests

```bash
# Run Ollama provider tests
npm test -- --grep "OllamaProvider"

# Run integration tests
npm run test:integration -- --grep "ollama"
```

### Adding New Models

To add support for new models:

1. Update the `getContextWindowForModel` method in `OllamaProvider.ts`
2. Add the model to the default models list in `getModels()`
3. Update tool format detection if needed

### Debug Mode

Enable debug logging to see provider details:

```bash
export DEBUG=1
# or
export VERBOSE=1
```

## Performance Considerations

- **Model Loading**: First request to a model may take longer as Ollama loads it into memory
- **Memory Usage**: Larger models require more RAM
- **GPU Acceleration**: Ollama can use GPU acceleration if available
- **Context Window**: Be aware of each model's context window limitations

## Limitations

- **No Server Tools**: Ollama doesn't support server-side tools like Gemini
- **Model Availability**: Depends on models being pulled locally
- **No Authentication**: Ollama runs locally without authentication
- **Limited Advanced Features**: Some advanced features like conversation caching are not available 