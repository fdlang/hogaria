/**
 * Minimal React + Vite type stubs for offline typecheck.
 *
 * GOAL: validate the application code's structure and cross-module imports
 * without npm registry access. These are NOT precise React types — the
 * surface area is permissive (mostly `any`) so JSX, refs and event handlers
 * don't fight the type system. App-level domain types (UseCases, DTOs,
 * etc.) ARE precisely typed and DO get validated.
 *
 * To remove: install @types/react @types/react-dom and delete this file.
 */

declare module "react" {
  export type Key = string | number;
  export type ReactNode = any;
  export type ReactElement = any;
  export type JSXElementConstructor<P> = any;

  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<any>): void;
  export function useCallback<T extends (...args: any[]) => any>(cb: T, deps: ReadonlyArray<any>): T;
  export function useMemo<T>(factory: () => T, deps: ReadonlyArray<any>): T;
  // Order matters: most specific first.
  // useRef(initialValue) — initialValue cannot be null; the resulting ref is mutable
  export function useRef<T>(initial: T): { current: T };
  // useRef<T>(null) — explicit null initialization for HTMLElement refs
  export function useRef<T>(initial: T | null): { current: T | null };
  // useRef<T>() — bare with optional T
  export function useRef<T = undefined>(): { current: T | undefined };
  export function useContext<T>(ctx: Context<T>): T;
  export function useReducer<R, A>(reducer: (state: R, action: A) => R, initial: R): [R, Dispatch<A>];
  export function useReducer(reducer: any, initialArg: any, init?: any): [any, any];
  export function useId(): string;
  export function useImperativeHandle<T>(ref: any, factory: () => T, deps?: ReadonlyArray<any>): void;
  // Allow 2- or 3-arg form (server-side rendering snapshot)
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;

  // React namespace alias for code that does `React.FormEvent` etc.
  export interface ErrorInfo { componentStack: string }

  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T>        { readonly current: T | null }
  export type Ref<T> = any;
  export function forwardRef<T = any, P = any>(
    render: (props: P, ref: Ref<T>) => any
  ): (props: P & { ref?: Ref<T>; key?: Key }) => any;

  export interface Context<T> {
    Provider: any;
    Consumer: any;
  }
  export function createContext<T>(defaultValue: T): Context<T>;

  // Class component base
  export class Component<P = any, S = any> {
    constructor(props: P);
    props: P;
    state: S;
    setState(s: any, cb?: () => void): void;
    render(): any;
  }

  export interface SyntheticEvent<T = any> {
    target: any;
    currentTarget: any;
    preventDefault(): void;
    stopPropagation(): void;
  }
  export type FormEvent<T = any>     = SyntheticEvent<T>;
  export type ChangeEvent<T = any>   = SyntheticEvent<T>;
  export type MouseEvent<T = any>    = SyntheticEvent<T>;
  export type KeyboardEvent<T = any> = SyntheticEvent<T> & { key: string };
  export type PointerEvent<T = any>  = SyntheticEvent<T> & { pointerId: number; clientX: number; clientY: number };

  export type CSSProperties = any;
  export type HTMLAttributes<T = any>          = any;
  export type ButtonHTMLAttributes<T = any>    = any;
  export type InputHTMLAttributes<T = any>     = any;
  export type TextareaHTMLAttributes<T = any>  = any;
  export type SelectHTMLAttributes<T = any>    = any;

  export const StrictMode: any;

  const React: any;
  export default React;
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react-dom/client" {
  export interface Root { render(node: any): void; unmount(): void }
  export function createRoot(container: Element | null): Root;
}

declare namespace JSX {
  type Element = any;
  // ElementClass is the instance type; ElementAttributesProperty tells TS
  // which property on that instance is the props bag.
  interface ElementClass { props: any }
  interface ElementAttributesProperty { props: any }
  // Allow `key` on every JSX element regardless of the component's defined props
  interface IntrinsicAttributes { key?: import("react").Key | null }
  interface IntrinsicClassAttributes<T> { key?: import("react").Key | null; ref?: import("react").Ref<T> }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module "*.css" {
  const css: string;
  export default css;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly [key: string]: string | undefined;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global React namespace for code doing `React.FormEvent`, `React.MouseEvent`, etc.
declare namespace React {
  type FormEvent<T = any>     = import("react").FormEvent<T>;
  type ChangeEvent<T = any>   = import("react").ChangeEvent<T>;
  type MouseEvent<T = any>    = import("react").MouseEvent<T>;
  type KeyboardEvent<T = any> = import("react").KeyboardEvent<T>;
  type PointerEvent<T = any>  = import("react").PointerEvent<T>;
  type SyntheticEvent<T = any> = import("react").SyntheticEvent<T>;
  type ReactNode             = import("react").ReactNode;
  type ReactElement          = import("react").ReactElement;
  type ErrorInfo             = import("react").ErrorInfo;
  type CSSProperties         = import("react").CSSProperties;
  type Ref<T>                = import("react").Ref<T>;
  type RefObject<T>          = import("react").RefObject<T>;
  type MutableRefObject<T>   = import("react").MutableRefObject<T>;
}
