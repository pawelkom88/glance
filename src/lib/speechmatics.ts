/**
 * Speechmatics Realtime WebSocket & Audio Streaming Client
 *
 * Connects to Speechmatics Realtime SaaS API:
 * 1. Exchanges API key for a temporary JWT token
 * 2. Opens WebSocket connection with StartRecognition config
 * 3. Captures microphone audio and streams 16kHz PCM S16LE chunks
 * 4. Dispatches transcribed words and partials to callbacks
 */

import { requestMicrophonePermission } from './tauri';

export interface SpeechmaticsWord {
  readonly word: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly isPartial: boolean;
  readonly confidence: number;
}

export type SpeechmaticsClientStatus =
  | 'idle'
  | 'authorizing'
  | 'connecting'
  | 'listening'
  | 'stopped'
  | 'error';

export interface SpeechmaticsClientOptions {
  readonly apiKey: string;
  readonly language?: string;
  readonly onWord: (word: SpeechmaticsWord) => void;
  readonly onStatusChange: (status: SpeechmaticsClientStatus, error?: string | null) => void;
  readonly onError: (error: string) => void;
  readonly endpointUrl?: string;
  readonly customFetch?: typeof fetch;
  readonly WebSocketConstructor?: typeof WebSocket;
}

export interface SpeechmaticsClient {
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly getStatus: () => SpeechmaticsClientStatus;
}

export async function fetchSpeechmaticsJwt(
  apiKey: string,
  ttlSeconds: number = 3600,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error('Speechmatics API key is required');
  }

  // eslint-disable-next-line no-console
  console.log('[VoiceSync:Auth] 🔑 Requesting ephemeral JWT from Speechmatics...');

  let response: Response;
  try {
    response = await fetchFn('https://mp.speechmatics.com/v1/api_keys?type=rt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmed}`
      },
      body: JSON.stringify({ ttl: ttlSeconds })
    });
  } catch (netErr) {
    // eslint-disable-next-line no-console
    console.error('[VoiceSync:Auth] ❌ Network error requesting JWT:', netErr);
    throw new Error(`Failed to reach Speechmatics server: ${netErr instanceof Error ? netErr.message : 'Network error'}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error(`[VoiceSync:Auth] ❌ Speechmatics auth error (${response.status}):`, errorText);
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid Speechmatics API key. Please verify your key in Settings.');
    }
    throw new Error(`Speechmatics auth failed (${response.status}): ${errorText || response.statusText}`);
  }

  const data = (await response.json()) as { key_value?: string };
  if (!data.key_value) {
    throw new Error('Speechmatics auth response missing token');
  }

  // eslint-disable-next-line no-console
  console.log('[VoiceSync:Auth] 🔑 Ephemeral JWT received successfully.');
  return data.key_value;
}

export function downsampleAndConvertToPCM16(
  inputBuffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number = 16000
): Int16Array {
  if (inputSampleRate === targetSampleRate) {
    const output = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i += 1) {
      const s = Math.max(-1, Math.min(1, inputBuffer[i] ?? 0));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  const sampleRateRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(inputBuffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < inputBuffer.length; i += 1) {
      accum += inputBuffer[i] ?? 0;
      count += 1;
    }

    const avg = count > 0 ? accum / count : 0;
    const s = Math.max(-1, Math.min(1, avg));
    result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7fff;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

export function createSpeechmaticsRealtimeClient(
  options: SpeechmaticsClientOptions
): SpeechmaticsClient {
  const {
    apiKey,
    language = 'en',
    onWord,
    onStatusChange,
    onError,
    endpointUrl = 'wss://eu2.rt.speechmatics.com/v2',
    customFetch = typeof fetch !== 'undefined' ? fetch : undefined,
    WebSocketConstructor = typeof WebSocket !== 'undefined' ? WebSocket : undefined
  } = options;

  let status: SpeechmaticsClientStatus = 'idle';
  let ws: WebSocket | null = null;
  let audioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let isDestroyed = false;

  const setStatus = (nextStatus: SpeechmaticsClientStatus, errorMsg?: string | null) => {
    if (isDestroyed && nextStatus !== 'stopped') {
      return;
    }
    status = nextStatus;
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:Status] 📊 Client status -> "${nextStatus}"${errorMsg ? ` (${errorMsg})` : ''}`);
    onStatusChange(nextStatus, errorMsg ?? null);
  };

  const cleanupAudio = () => {
    if (processorNode) {
      try {
        processorNode.disconnect();
      } catch {
        // ignore
      }
      processorNode = null;
    }

    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {
        // ignore
      }
      sourceNode = null;
    }

    if (audioContext && audioContext.state !== 'closed') {
      try {
        void audioContext.close();
      } catch {
        // ignore
      }
      audioContext = null;
    }

    if (audioStream) {
      try {
        audioStream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      audioStream = null;
    }
  };

  const cleanupWebSocket = () => {
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ message: 'EndOfStream', last_seq_no: 0 }));
        }
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };

  const stop = () => {
    // eslint-disable-next-line no-console
    console.log('[VoiceSync] 🛑 Stopping Speechmatics client.');
    isDestroyed = true;
    cleanupAudio();
    cleanupWebSocket();
    setStatus('stopped');
  };

  const start = async () => {
    if (!apiKey || !apiKey.trim()) {
      const msg = 'Speechmatics API key is required';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync] ❌ ${msg}`);
      setStatus('error', msg);
      onError(msg);
      return;
    }

    if (!customFetch) {
      const msg = 'Fetch API is unavailable in this environment';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync] ❌ ${msg}`);
      setStatus('error', msg);
      onError(msg);
      return;
    }

    if (!WebSocketConstructor) {
      const msg = 'WebSocket is unavailable in this environment';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync] ❌ ${msg}`);
      setStatus('error', msg);
      onError(msg);
      return;
    }

    isDestroyed = false;
    setStatus('authorizing');

    let jwt = '';
    try {
      jwt = await fetchSpeechmaticsJwt(apiKey, 3600, customFetch);
    } catch (err) {
      if (isDestroyed) return;
      const msg = err instanceof Error ? err.message : 'Speechmatics authentication failed';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync:Auth] ❌ Auth error: ${msg}`);
      setStatus('error', msg);
      onError(msg);
      return;
    }

    if (isDestroyed) return;
    setStatus('connecting');

    // Request microphone access (standard constraints without restrictive sampleRate)
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        // eslint-disable-next-line no-console
        console.log('[VoiceSync:Mic] 🎙️ Requesting microphone access...');

        try {
          const nativeStatus = await requestMicrophonePermission();
          if (nativeStatus === 'denied') {
            throw new Error('Microphone permission denied by system settings. Please enable microphone access in System Settings.');
          }
        } catch (permErr) {
          if (permErr instanceof Error && permErr.message.includes('permission denied')) {
            throw permErr;
          }
          // Non-tauri or fallback environments continue to browser getUserMedia
        }

        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        const trackLabel = typeof audioStream?.getAudioTracks === 'function'
          ? audioStream.getAudioTracks()[0]?.label
          : (typeof audioStream?.getTracks === 'function' ? audioStream.getTracks()[0]?.label : undefined);
        // eslint-disable-next-line no-console
        console.log(`[VoiceSync:Mic] 🎙️ Microphone access granted (device: "${trackLabel || 'default'}").`);
      } else {
        throw new Error('Microphone access is not supported in this environment');
      }
    } catch (err) {
      if (isDestroyed) return;
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync:Mic] ❌ Mic error: ${msg}`, err);
      setStatus('error', msg);
      onError(msg);
      return;
    }

    if (isDestroyed) {
      cleanupAudio();
      return;
    }

    const wsUrl = `${endpointUrl}?jwt=${encodeURIComponent(jwt)}`;
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:WS] 🌐 Opening WebSocket connection to ${endpointUrl}...`);

    try {
      ws = new WebSocketConstructor(wsUrl);
      ws.binaryType = 'arraybuffer';
    } catch (err) {
      cleanupAudio();
      const msg = err instanceof Error ? err.message : 'Failed to connect to Speechmatics WebSocket';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync:WS] ❌ WebSocket connect error: ${msg}`, err);
      setStatus('error', msg);
      onError(msg);
      return;
    }

    ws.onopen = () => {
      if (isDestroyed || !ws) return;

      const startMessage = {
        message: 'StartRecognition',
        audio_format: {
          type: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 16000
        },
        transcription_config: {
          language,
          operating_point: 'enhanced',
          enable_partials: true,
          max_delay: 1.0,
          conversation_config: { end_of_utterance_silence_trigger: 0.7 }
        }
      };

      // eslint-disable-next-line no-console
      console.log('[VoiceSync:WS] 🌐 WebSocket connected! Sent StartRecognition config:', startMessage.transcription_config);
      ws.send(JSON.stringify(startMessage));
    };

    ws.onmessage = (event) => {
      if (isDestroyed) return;

      try {
        const rawData = typeof event.data === 'string' ? event.data : '';
        if (!rawData) return;
        const msg = JSON.parse(rawData);

        if (msg.message === 'RecognitionStarted') {
          // eslint-disable-next-line no-console
          console.log('[VoiceSync:WS] 🟢 RecognitionStarted confirmed by Speechmatics. Streaming 16kHz PCM audio.');
          setStatus('listening');
          startAudioStreaming();
        } else if (msg.message === 'AddTranscript' || msg.message === 'AddPartialTranscript') {
          const isPartial = msg.message === 'AddPartialTranscript';
          const results = Array.isArray(msg.results) ? msg.results : [];

          for (const item of results) {
            if (item.type === 'word' && Array.isArray(item.alternatives) && item.alternatives.length > 0) {
              const alt = item.alternatives[0];
              const content = typeof alt.content === 'string' ? alt.content.trim() : '';
              if (content) {
                const conf = alt.confidence ?? 1;
                // eslint-disable-next-line no-console
                console.log(
                  `[VoiceSync:STT] 🗣️ Heard: "${content}" (${isPartial ? 'partial' : 'final'}, conf: ${(conf * 100).toFixed(0)}%, time: ${item.start_time ?? 0}s-${item.end_time ?? 0}s)`
                );
                onWord({
                  word: content,
                  startTime: typeof item.start_time === 'number' ? item.start_time : 0,
                  endTime: typeof item.end_time === 'number' ? item.end_time : 0,
                  isPartial,
                  confidence: typeof alt.confidence === 'number' ? alt.confidence : 1
                });
              }
            }
          }
        } else if (msg.message === 'Error') {
          const errMsg = typeof msg.reason === 'string' ? msg.reason : 'Speechmatics recognition error';
          // eslint-disable-next-line no-console
          console.error(`[VoiceSync:WS] ❌ Speechmatics error payload:`, msg);
          setStatus('error', errMsg);
          onError(errMsg);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[VoiceSync:WS] ❌ Message parsing error:', err);
      }
    };

    ws.onerror = () => {
      if (isDestroyed) return;
      // eslint-disable-next-line no-console
      console.error('[VoiceSync:WS] ❌ WebSocket error event');
      const msg = 'Speechmatics WebSocket error';
      setStatus('error', msg);
      onError(msg);
    };

    ws.onclose = (event) => {
      if (isDestroyed) return;
      // eslint-disable-next-line no-console
      console.warn(`[VoiceSync:WS] ⚠️ WebSocket closed (code: ${event.code}, reason: ${event.reason || 'normal'})`);
      if (event.code !== 1000) {
        const msg = `Speechmatics connection closed (${event.code}${event.reason ? `: ${event.reason}` : ''})`;
        setStatus('error', msg);
        onError(msg);
      } else {
        setStatus('stopped');
      }
    };
  };

  const startAudioStreaming = () => {
    if (!audioStream || isDestroyed) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      audioContext = new AudioCtxClass();
      sourceNode = audioContext.createMediaStreamSource(audioStream);
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);

      processorNode.onaudioprocess = (e) => {
        if (isDestroyed || !ws || ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = downsampleAndConvertToPCM16(inputData, audioContext?.sampleRate ?? 44100, 16000);

        if (pcm16.length > 0) {
          ws.send(pcm16.buffer);
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      // eslint-disable-next-line no-console
      console.log(`[VoiceSync:Audio] 🎙️ Audio pipeline active (Native sampleRate: ${audioContext.sampleRate}Hz -> Downsampled: 16000Hz PCM16).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize audio processor';
      // eslint-disable-next-line no-console
      console.error(`[VoiceSync:Audio] ❌ Pipeline init error: ${msg}`, err);
      setStatus('error', msg);
      onError(msg);
    }
  };

  return {
    start,
    stop,
    getStatus: () => status
  };
}
