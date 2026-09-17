/**
 * Minimal Node.js type stubs for offline typecheck.
 *
 * In a real install these come from @types/node. This file is ONLY here so
 * the project can typecheck in environments without npm registry access.
 *
 * To remove: install @types/node, add "node" to compilerOptions.types,
 * and delete this file.
 */

declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: { remoteAddress?: string };
    on(event: "data",  listener: (chunk: Buffer) => void): this;
    on(event: "end",   listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    destroy(): void;
  }
  export interface ServerResponse {
    headersSent: boolean;
    setHeader(name: string, value: string): void;
    writeHead(statusCode: number, headers?: Record<string, string>): this;
    end(data?: unknown): void;
  }
  export type RequestListener = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  export interface Server {
    listen(port: number, listener?: () => void): this;
  }
  export function createServer(listener: RequestListener): Server;
  const _default: { createServer: typeof createServer };
  export default _default;
}

declare module "node:url" {
  export class URL {
    constructor(input: string, base?: string);
    href: string;
    pathname: string;
    searchParams: { forEach(cb: (value: string, key: string) => void): void };
  }
}

declare class Buffer {
  toString(): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};
