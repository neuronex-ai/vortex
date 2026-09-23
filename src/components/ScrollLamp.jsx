import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import '../styles/scroll-lamp.css';

// Adapted from the supplied 21st.dev / Aceternity Lamp reference.
// Continuous scroll progress replaces its one-time whileInView transition.
export function ScrollLamp() {
  const target = useRef(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ['start 0.85', 'start 0.25'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 32, restDelta: .001 });
  const scaleX = useTransform(progress, [0, 1], [.5, 1]);
  const opacity = useTransform(progress, [0, 1], [.45, 1]);

  return (
    <div ref={target} className="fusion-scroll-lamp" aria-hidden="true">
      <motion.div className="fusion-scroll-lamp__light" style={{
        scaleX: reducedMotion ? 1 : scaleX,
        opacity: reducedMotion ? 1 : opacity,
      }}>
        <div className="fusion-scroll-lamp__cone fusion-scroll-lamp__cone--left" />
        <div className="fusion-scroll-lamp__cone fusion-scroll-lamp__cone--right" />
        <div className="fusion-scroll-lamp__halo" />
        <div className="fusion-scroll-lamp__bloom" />
        <div className="fusion-scroll-lamp__bar" />
      </motion.div>
    </div>
  );
}

export function mountScrollLamp(host) {
  createRoot(host).render(<ScrollLamp />);
}
