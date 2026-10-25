import { useState } from 'react';
import { Shader, ImageTexture, PagePeel } from 'shaders/react';

/** 渐进增强：初始化失败时底层 CSS 书页仍完整可见。 */
export default function BookPaperGpu() {
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  if (unavailable) return null;
  return (
    <Shader
      className="book-paper-gpu"
      data-book-gpu={ready ? 'ready' : 'loading'}
      disableTelemetry
      onReady={() => setReady(true)}
      onUnavailable={() => setUnavailable(true)}
    >
      <ImageTexture url="/images/book-paper.svg" objectFit="contain" />
      <PagePeel
        corner="top-right"
        amount={{
          type: 'auto-animate',
          mode: 'ping-pong',
          outputMin: 0.03,
          outputMax: 0.22,
          speed: 0.35,
        }}
        radius={0.18}
        shading={0.35}
        highlight={0.2}
        shadow={0.3}
      />
    </Shader>
  );
}
