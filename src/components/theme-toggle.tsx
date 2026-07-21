import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function toggleThemeWithRipple(
  event: MouseEvent<HTMLButtonElement>,
  nextTheme: 'light' | 'dark',
  applyTheme: (theme: 'light' | 'dark') => void
) {
  const apply = () => {
    flushSync(() => {
      applyTheme(nextTheme);
    });
  };

  if (
    prefersReducedMotion() ||
    typeof document.startViewTransition !== 'function'
  ) {
    apply();
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  document.documentElement.classList.add('theme-ripple');

  const transition = document.startViewTransition(apply);

  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 560,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    })
    .catch(() => {
      /* ignore aborted transitions */
    });

  void transition.finished.finally(() => {
    document.documentElement.classList.remove('theme-ripple');
  });
}

export function ThemeToggle({
  className,
  variant = 'ghost',
  size = 'icon',
}: {
  className?: string;
  variant?: 'ghost' | 'outline';
  size?: 'icon' | 'sm';
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(
        size === 'sm' ? 'h-7 w-7 shrink-0 px-0' : 'size-8 shrink-0',
        className
      )}
      onClick={(event) =>
        toggleThemeWithRipple(event, isDark ? 'light' : 'dark', setTheme)
      }
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-3.5 text-amber-400" />
        ) : (
          <Moon className="size-3.5 text-sky-700" />
        )
      ) : (
        <Moon className="size-3.5 opacity-0" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
