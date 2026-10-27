import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** A red stripe sweeps across the screen whenever the page changes (not on the first load). */
export function RouteWipe() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setCount((n) => n + 1);
  }, [pathname]);

  return count > 0 ? (
    <div key={count} className="wipe-root" aria-hidden="true">
      <div className="wipe" />
    </div>
  ) : null;
}
