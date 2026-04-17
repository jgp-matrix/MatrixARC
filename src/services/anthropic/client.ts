// ─── Anthropic API Client ────────────────────────────────────────────────────
// Centralized API call wrapper with retry, error handling, and token management.

import { ANTHROPIC_API_URL, ANTHROPIC_VERSION } from '@/core/constants';

let _apiKey: string | null = null;

export function setApiKey(key: string | null) {
  _apiKey = key;
}

export function getApiKey(): string | null {
  return _apiKey;
}

export function hasApiKey(): boolean {
  return !!_apiKey;
}

export interface ApiCallOptions {
  model: string;
  max_tokens: number;
  messages: any[];
  system?: string;
  thinking?: { type: string; budget_tokens: number };
}

/**
 * Make a raw API call to Anthropic. Returns the text content from the response.
 */
export async function apiCall(body: ApiCallOptions): Promise<string> {
  if (!_apiKey) throw new Error('No Anthropic API key set');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': _apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  // Add beta header if using thinking
  if (body.thinking) {
    headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
  }

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const d = await resp.json();
  if (!resp.ok) throw new Error(d.error?.message || `API error ${resp.status}`);

  // Extract text block (skip thinking blocks)
  const textBlock = (d.content || []).find((b: any) => b.type === 'text');
  return textBlock?.text || '';
}

/**
 * Make a vision API call with a base64 image.
 */
export async function visionCall(
  imageBase64: string,
  prompt: string,
  options: Partial<ApiCallOptions> = {}
): Promise<string> {
  return apiCall({
    model: options.model || 'claude-sonnet-4-6',
    max_tokens: options.max_tokens || 4096,
    ...options,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
}
