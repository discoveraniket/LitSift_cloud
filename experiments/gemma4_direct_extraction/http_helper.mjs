import http from 'http';

/**
 * Robust HTTP client using native Node http.request with infinite timeout
 * Prevents Node fetch 'terminated' errors during long LLM prompt prefill.
 */
export function streamChatCompletion(url, body, onChunk, onReasoning) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(body);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 1234,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Connection': 'keep-alive',
      },
      timeout: 0, // No timeout!
    };

    const req = http.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errBody = '';
        res.on('data', (d) => (errBody += d));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody}`)));
        return;
      }

      let buffer = '';
      let rawFullText = '';
      let extractedThinking = '';
      let tokenCount = 0;
      let firstTokenTime = 0;

      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        if (!firstTokenTime) {
          firstTokenTime = performance.now();
        }

        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') {
              resolve({
                rawFullText,
                extractedThinking,
                tokenCount,
                firstTokenTime,
              });
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.reasoning_content) {
                extractedThinking += delta.reasoning_content;
                onReasoning?.(delta.reasoning_content);
              }

              if (delta?.content) {
                rawFullText += delta.content;
                tokenCount++;
                onChunk?.(delta.content);
              }
            } catch {
              // ignore partial JSON chunks
            }
          }
        }
      });

      res.on('end', () => {
        resolve({
          rawFullText,
          extractedThinking,
          tokenCount,
          firstTokenTime,
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}
