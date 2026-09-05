import { describe, expect, it, vi } from 'vitest';
import {
  createSpeechmaticsRealtimeClient,
  downsampleAndConvertToPCM16,
  fetchSpeechmaticsJwt,
  type SpeechmaticsWord
} from './speechmatics';

describe('speechmatics', () => {
  describe('downsampleAndConvertToPCM16', () => {
    it('converts float32 audio at 16000Hz to 16-bit PCM', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const output = downsampleAndConvertToPCM16(input, 16000, 16000);

      expect(output.length).toBe(5);
      expect(output[0]).toBe(0);
      expect(Math.abs(output[1] - 16383)).toBeLessThanOrEqual(1);
      expect(output[2]).toBe(-16384);
      expect(output[3]).toBe(32767);
      expect(output[4]).toBe(-32768);
    });

    it('downsamples from 48000Hz to 16000Hz (3:1 ratio)', () => {
      const input = new Float32Array(480);
      input.fill(0.5);
      const output = downsampleAndConvertToPCM16(input, 48000, 16000);

      expect(output.length).toBe(160);
      expect(Math.abs(output[0] - 16383)).toBeLessThanOrEqual(1);
    });
  });

  describe('fetchSpeechmaticsJwt', () => {
    it('throws when API key is empty', async () => {
      await expect(fetchSpeechmaticsJwt('')).rejects.toThrow('Speechmatics API key is required');
      await expect(fetchSpeechmaticsJwt('   ')).rejects.toThrow('Speechmatics API key is required');
    });

    it('returns key_value token on successful fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key_value: 'mock-jwt-token-123' })
      });

      const token = await fetchSpeechmaticsJwt('test-key', 3600, mockFetch as unknown as typeof fetch);
      expect(token).toBe('mock-jwt-token-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mp.speechmatics.com/v1/api_keys?type=rt',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key'
          },
          body: JSON.stringify({ ttl: 3600 })
        })
      );
    });

    it('throws friendly error on 401 unauthorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized'
      });

      await expect(fetchSpeechmaticsJwt('bad-key', 3600, mockFetch as unknown as typeof fetch)).rejects.toThrow(
        'Invalid Speechmatics API key'
      );
    });
  });

  describe('createSpeechmaticsRealtimeClient', () => {
    it('initializes in idle status and errors if no api key provided', async () => {
      const onWord = vi.fn();
      const onStatusChange = vi.fn();
      const onError = vi.fn();

      const client = createSpeechmaticsRealtimeClient({
        apiKey: '',
        onWord,
        onStatusChange,
        onError
      });

      expect(client.getStatus()).toBe('idle');
      await client.start();
      expect(client.getStatus()).toBe('error');
      expect(onError).toHaveBeenCalledWith('Speechmatics API key is required');
    });

    it('connects to WebSocket and receives word transcriptions', async () => {
      const wordsReceived: SpeechmaticsWord[] = [];
      const onWord = vi.fn((w) => wordsReceived.push(w));
      const onStatusChange = vi.fn();
      const onError = vi.fn();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key_value: 'valid-jwt-token' })
      });

      class MockWebSocket {
        static OPEN = 1;
        readyState = MockWebSocket.OPEN;
        binaryType = '';
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: ((event: { code: number }) => void) | null = null;
        sentMessages: string[] = [];

        constructor(public url: string) {
          setTimeout(() => {
            this.onopen?.();
          }, 0);
        }

        send(msg: string) {
          this.sentMessages.push(msg);
          if (typeof msg === 'string' && msg.includes('StartRecognition')) {
            setTimeout(() => {
              this.onmessage?.({
                data: JSON.stringify({ message: 'RecognitionStarted' })
              });
              setTimeout(() => {
                this.onmessage?.({
                  data: JSON.stringify({
                    message: 'AddTranscript',
                    results: [
                      {
                        type: 'word',
                        start_time: 1.0,
                        end_time: 1.4,
                        alternatives: [{ content: 'Welcome', confidence: 0.99 }]
                      },
                      {
                        type: 'word',
                        start_time: 1.5,
                        end_time: 1.8,
                        alternatives: [{ content: 'everyone', confidence: 0.95 }]
                      }
                    ]
                  })
                });
              }, 0);
            }, 0);
          }
        }

        close() {
          this.onclose?.({ code: 1000 });
        }
      }

      // Mock navigator.mediaDevices.getUserMedia
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }]
          })
        },
        configurable: true
      });

      const client = createSpeechmaticsRealtimeClient({
        apiKey: 'my-speechmatics-key',
        language: 'en',
        onWord,
        onStatusChange,
        onError,
        customFetch: mockFetch as unknown as typeof fetch,
        WebSocketConstructor: MockWebSocket as unknown as typeof WebSocket
      });

      await client.start();

      // Allow microtasks/timeouts to resolve
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(wordsReceived.length).toBe(2);
      expect(wordsReceived[0]?.word).toBe('Welcome');
      expect(wordsReceived[1]?.word).toBe('everyone');

      client.stop();
      expect(client.getStatus()).toBe('stopped');

      if (originalMediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          value: originalMediaDevices,
          configurable: true
        });
      }
    });
  });
});
