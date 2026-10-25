import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);
const BookPaperGpu = lazy(() =>
  import('./book-paper-gpu').catch(() => ({ default: () => null })),
);

export function BookScene() {
  const scope = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  const [gpu, setGpu] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let inView = true;
    const update = () =>
      setMoving(!media.matches && !document.hidden && inView);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (scope.current) observer.observe(scope.current);
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    setGpu('gpu' in navigator && !!navigator.gpu);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useGSAP(
    () => {
      if (!moving) return;
      gsap.to('[data-book-body]', {
        y: -2,
        rotationZ: -7,
        duration: 2.8,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      gsap
        .timeline({ repeat: -1, repeatDelay: 1.3 })
        .fromTo(
          '[data-book-leaf]',
          { rotationY: 0 },
          { rotationY: -165, duration: 1.8, ease: 'power1.inOut' },
        )
        .to('[data-book-leaf]', {
          rotationY: 0,
          duration: 1.3,
          ease: 'power1.inOut',
        });
    },
    { scope, dependencies: [moving], revertOnUpdate: true },
  );
  return (
    <div
      ref={scope}
      className="book-scene"
      data-book-scene
      data-motion={moving ? 'playing' : 'static'}
      aria-hidden="true"
    >
      <div className="book-shadow" />
      <div className="book-body" data-book-body>
        <div className="book-cover" />
        <div className="book-paper book-paper-left" />
        <div className="book-paper book-paper-right" />
        <div className="book-paper book-leaf" data-book-leaf>
          {moving && gpu && (
            <Suspense fallback={null}>
              <BookPaperGpu />
            </Suspense>
          )}
        </div>
        <div className="book-spine" />
      </div>
    </div>
  );
}
