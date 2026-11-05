export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export class RpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export const success = (id: JsonRpcId | null, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });
export const failure = (id: JsonRpcId | null, code: number, message: string) =>
  ({ jsonrpc: '2.0' as const, id, error: { code, message } });

/** Split a byte stream into newline-delimited frames. */
export function lineSplitter(onLine: (line: string) => void) {
  let buffer = '';
  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.trim()) onLine(line);
      }
    },
    flush() {
      if (buffer.trim()) onLine(buffer);
      buffer = '';
    },
  };
}

export function isRequest(v: unknown): v is JsonRpcRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return r.jsonrpc === '2.0' && typeof r.method === 'string' &&
    (r.id === undefined || typeof r.id === 'string' || typeof r.id === 'number');
}
