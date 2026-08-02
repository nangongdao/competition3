const DEFAULT_MAX_RESPONSE_BYTES = 256_000;

export type BoundedResponseBody = {
  value: unknown;
  text: string;
  truncated: boolean;
};

export async function readJsonResponseBounded(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<BoundedResponseBody> {
  const result = await readResponseTextBounded(response, maxBytes);

  if (result.truncated || result.text.trim().length === 0) {
    return {
      value: null,
      text: result.text,
      truncated: result.truncated,
    };
  }

  try {
    return {
      value: JSON.parse(result.text) as unknown,
      text: result.text,
      truncated: false,
    };
  } catch {
    return {
      value: null,
      text: result.text,
      truncated: false,
    };
  }
}

export async function readResponseTextBounded(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<{ text: string; truncated: boolean }> {
  if (response.body === null) {
    return { text: "", truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      text += decoder.decode();
      return { text, truncated: false };
    }

    const remaining = maxBytes - bytesRead;

    if (remaining <= 0) {
      await reader.cancel();
      text += decoder.decode();
      return { text, truncated: true };
    }

    const chunk = result.value;
    const acceptedChunk =
      chunk.byteLength <= remaining ? chunk : chunk.slice(0, remaining);
    text += decoder.decode(acceptedChunk, { stream: true });
    bytesRead += acceptedChunk.byteLength;

    if (acceptedChunk.byteLength < chunk.byteLength) {
      await reader.cancel();
      text += decoder.decode();
      return { text, truncated: true };
    }
  }
}
