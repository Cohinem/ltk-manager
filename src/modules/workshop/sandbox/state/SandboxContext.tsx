import { type ComponentType, createContext, type ReactNode, use, useMemo } from "react";

import type { SandboxRef } from "@/lib/tauri";

import { GAME_SANDBOX, projectSandbox } from "../utils/sandboxRef";

/** The route's sandbox and the sandbox of the enclosing document. ADR-0056. */
interface Sandboxes {
  readonly route: SandboxRef;
  readonly current: SandboxRef;
}

const SandboxContext = createContext<Sandboxes>({ route: GAME_SANDBOX, current: GAME_SANDBOX });

/** The route's sandbox: the project's where one is open, else the game's. */
export function RouteSandboxProvider({
  project,
  children,
}: {
  project: string | null;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const route = project === null ? GAME_SANDBOX : projectSandbox(project);
    return { route, current: route };
  }, [project]);

  return <SandboxContext value={value}>{children}</SandboxContext>;
}

/**
 * Provides one document's sandbox to everything inside it. Without one, the document uses
 * the route's sandbox.
 */
export function DocumentSandboxProvider({
  sandbox,
  children,
}: {
  sandbox: SandboxRef | undefined;
  children: ReactNode;
}) {
  const { route } = use(SandboxContext);
  const value = useMemo(() => ({ route, current: sandbox ?? route }), [route, sandbox]);

  return <SandboxContext value={value}>{children}</SandboxContext>;
}

/** `Draw`, wrapped in a provider of its document's sandbox. */
export function inDocumentSandbox<
  P extends { readonly document: { readonly sandbox?: SandboxRef } },
>(Draw: ComponentType<P>): ComponentType<P> {
  function InDocumentSandbox(props: P) {
    return (
      <DocumentSandboxProvider sandbox={props.document.sandbox}>
        <Draw {...props} />
      </DocumentSandboxProvider>
    );
  }

  return InDocumentSandbox;
}

/** The sandbox of the enclosing document, which it reads from and writes to. */
export function useSandbox(): SandboxRef {
  return use(SandboxContext).current;
}

/** The route's sandbox, used by a document with no sandbox of its own. */
export function useRouteSandbox(): SandboxRef {
  return use(SandboxContext).route;
}
