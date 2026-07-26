import { useEffect, useRef } from 'react';
import { createScope, animate } from 'animejs';

export default function PageTransition({ children }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const scope = createScope({ root: rootRef.current }).add(() => {
      animate(rootRef.current, {
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 250,
        ease: 'out(2)',
      });
    });

    return () => scope.revert();
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
