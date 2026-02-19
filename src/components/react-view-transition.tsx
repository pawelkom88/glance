import * as React from 'react';

interface ViewTransitionProps {
  readonly children: React.ReactNode;
  readonly name?: string;
  readonly enter?: unknown;
  readonly exit?: unknown;
  readonly update?: unknown;
  readonly share?: unknown;
  readonly default?: unknown;
}

type ReactCanaryModule = typeof React & {
  readonly ViewTransition?: React.ComponentType<ViewTransitionProps>;
};

export function ReactViewTransition(props: ViewTransitionProps) {
  const ReactWithCanary = React as ReactCanaryModule;
  const NativeViewTransition = ReactWithCanary.ViewTransition;

  if (!NativeViewTransition) {
    return <>{props.children}</>;
  }

  return <NativeViewTransition {...props} />;
}
