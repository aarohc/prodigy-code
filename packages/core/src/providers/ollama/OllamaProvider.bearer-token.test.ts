import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './OllamaProvider.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('OllamaProvider Bearer Token', () => {
  let provider: OllamaProvider;
  let mockFetch: any;

  beforeEach(() => {
    provider = new OllamaProvider();
    mockFetch = vi.mocked(fetch);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('setTokenUrl and getTokenUrl', () => {
    it('should set and get token URL correctly', () => {
      const tokenUrl = 'https://example.com/token';
      provider.setTokenUrl(tokenUrl);
      expect(provider.getTokenUrl()).toBe(tokenUrl);
    });

    it('should return undefined when no token URL is set', () => {
      expect(provider.getTokenUrl()).toBeUndefined();
    });
  });

  describe('getBearerToken', () => {
    it('should return static API key when no token URL is configured', async () => {
      provider.setApiKey('static-api-key');
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      const token = await getBearerToken();
      
      expect(token).toBe('static-api-key');
    });

    it('should fetch token from URL when configured', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockToken = 'dynamic-bearer-token';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      const token = await getBearerToken();
      
      expect(mockFetch).toHaveBeenCalledWith(tokenUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(token).toBe(mockToken);
    });

    it('should handle OAuth-style token response', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockResponse = {
        access_token: 'oauth-token',
        expires_in: 3600,
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      const token = await getBearerToken();
      
      expect(token).toBe('oauth-token');
    });

    it('should handle custom token response format', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockResponse = {
        token: 'custom-token',
        expires_in: 1800,
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      const token = await getBearerToken();
      
      expect(token).toBe('custom-token');
    });

    it('should fall back to static API key on token fetch failure', async () => {
      const tokenUrl = 'https://example.com/token';
      const staticApiKey = 'fallback-api-key';
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      provider.setApiKey(staticApiKey);
      provider.setTokenUrl(tokenUrl);
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      const token = await getBearerToken();
      
      expect(token).toBe(staticApiKey);
    });

    it('should cache token and reuse it until expiry', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockToken = 'cached-token';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      
      // First call should fetch from URL
      const token1 = await getBearerToken();
      expect(token1).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Second call should use cached token
      const token2 = await getBearerToken();
      expect(token2).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Should not call fetch again
    });
  });

  describe('clearCachedToken', () => {
    it('should clear cached token and force new fetch', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockToken = 'cached-token';
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockToken,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Access private method for testing
      const getBearerToken = (provider as any).getBearerToken.bind(provider);
      
      // First call
      await getBearerToken();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Clear cache
      provider.clearCachedToken();
      
      // Second call should fetch again
      await getBearerToken();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('API calls with bearer token', () => {
    it('should use bearer token in getModels call', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockToken = 'api-token';
      const mockModels = {
        models: [
          { name: 'llama2', modified_at: '2024-01-01', size: 1000, digest: 'abc', details: { format: 'gguf', family: 'llama', parameter_size: '7b', quantization_level: 'q4_0' } }
        ]
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockModels,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Mock the private getBearerToken method
      vi.spyOn(provider as any, 'getBearerToken').mockResolvedValue(mockToken);
      
      await provider.getModels();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`,
          },
        })
      );
    });

    it('should use bearer token in generateChatCompletion call', async () => {
      const tokenUrl = 'https://example.com/token';
      const mockToken = 'api-token';
      
      // Mock the response body
      const mockReadable = {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        body: mockReadable,
      });

      provider.setTokenUrl(tokenUrl);
      
      // Mock the private getBearerToken method
      vi.spyOn(provider as any, 'getBearerToken').mockResolvedValue(mockToken);
      
      const generator = provider.generateChatCompletion([
        { role: 'user' as any, content: 'Hello' }
      ]);
      
      // Consume the generator
      for await (const _ of generator) {
        // Just consume the generator
      }
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`,
          },
        })
      );
    });
  });
}); 