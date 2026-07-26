import {
  Fragment,
  act,
  createElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";

type HookWrapper = ComponentType<{ children: ReactNode }>;

export function renderHook<T>(
  callback: () => T,
  options?: { wrapper?: HookWrapper }
) {
  const result = { current: undefined as T };
  const container = document.createElement("div");
  document.body.appendChild(container);

  const Wrapper = options?.wrapper ?? Fragment;

  function HookHarness() {
    result.current = callback();
    return null;
  }

  const root = createRoot(container);
  // `callback` is a closure — a caller that captures an outer `let` and
  // mutates it before calling `rerender()` will see the hook re-invoked
  // with the new value, the same way @testing-library/react-hooks works.
  function renderOnce() {
    act(() => {
      root.render(createElement(Wrapper, null, createElement(HookHarness)));
    });
  }
  renderOnce();

  return {
    result,
    rerender: renderOnce,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export { act };
