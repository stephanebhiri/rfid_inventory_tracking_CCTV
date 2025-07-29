import { useRef, useEffect } from 'react';

export const useScrollPreservation = (dependency: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);

  // Save scroll position before dependency changes
  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      const handleScroll = () => {
        scrollPositionRef.current = element.scrollTop;
      };
      
      element.addEventListener('scroll', handleScroll);
      return () => element.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Restore scroll position after dependency changes
  useEffect(() => {
    const element = scrollRef.current;
    if (element && scrollPositionRef.current > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        element.scrollTop = scrollPositionRef.current;
      }, 10);
    }
  }, [dependency]);

  return scrollRef;
};