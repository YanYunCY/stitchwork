import type { Readable, Writable } from 'node:stream';
import type { Gateway } from '../gateway.ts';
import { AGENT_IDS } from '../types.ts';
import { ErrorCode, RpcError, failure, isRequest, lineSplitter, success } from './jsonrpc.ts';
import type { JsonRpcRequest } from './jsonrpc.ts';
import { TOOLS, callTool } from './tools.ts';

export const PROTOCOL_VERSION = '2025-06-18';
export const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, '2025-03-26', '2024-11-05'];
export const SERVER_INFO = { name: 'stitchwork', title: 'Stitchwork MCP gateway', version: '0.1.0' };

export interface ServerIO {
  input: Readable;
  output: Writable;
  log?: (msg: string) => void;
}

export function createMcpHandler(gw: Gateway) {
  return async function handle(req: JsonRpcRequest): Promise<unknown> {
    const params = (typeof req.params === 'object' && req.params !== null ? req.params : {}) as Record<string, unknown>;
    switch (req.method) {
      case 'initialize': {
        const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
        return {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: `Stitchwork routes coding tasks to ${AGENT_IDS.join(', ')}. Use agent_run with agent "auto" unless the user names one; check quota_status before large jobs.`,
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: TOOLS };
      case 'tools/call': {
        const name = params.name;
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) throw new RpcError(ErrorCode.InvalidParams, `Unknown tool: ${String(name)}`);
        const args = (typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {}) as Record<string, unknown>;
        for (const key of tool.inputSchema.required ?? []) {
          if (typeof args[key] !== 'string') throw new RpcError(ErrorCode.InvalidParams, `Missing required string argument "${key}" for ${tool.name}`);
        }
        if (args.agent !== undefined && !(typeof args.agent === 'string' && [...AGENT_IDS, 'auto'].includes(args.agent))) {
          throw new RpcError(ErrorCode.InvalidParams, `agent must be one of ${[...AGENT_IDS, 'auto'].join(', ')}`);
        }
        return callTool(gw, tool.name, args);
      }
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${req.method}`);
    }
  };
}

/** Serve MCP over newline-delimited JSON-RPC. stdout carries protocol frames only (Req 2.7). */
export function serveMcp(gw: Gateway, io: ServerIO): { done: Promise<void> } {
  const handle = createMcpHandler(gw);
  const log = io.log ?? ((m: string) => process.stderr.write(`[stitchwork] ${m}\n`));
  const pending = new Set<Promise<void>>();
  const send = (msg: unknown) => io.output.write(JSON.stringify(msg) + '\n');

  const onLine = (line: string) => {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      send(failure(null, ErrorCode.ParseError, 'Parse error'));
      return;
    }
    if (!isRequest(msg)) {
      const id = typeof msg === 'object' && msg !== null && 'id' in msg ? ((msg as { id: unknown }).id as string | number) : null;
      // Responses from the client (to requests we never send) are ignored.
      if (typeof msg === 'object' && msg !== null && ('result' in msg || 'error' in msg)) return;
      send(failure(id ?? null, ErrorCode.InvalidRequest, 'Invalid request'));
      return;
    }
    if (msg.id === undefined) {
      // Notification: never answered (Req 2.8).
      if (msg.method !== 'notifications/initialized' && msg.method !== 'notifications/cancelled') log(`ignored notification ${msg.method}`);
      return;
    }
    const id = msg.id;
    const p = handle(msg)
      .then((result) => void send(success(id, result)))
      .catch((e: unknown) => {
        if (e instanceof RpcError) send(failure(id, e.code, e.message));
        else {
          log(`internal error: ${(e as Error).stack ?? String(e)}`);
          send(failure(id, ErrorCode.InternalError, 'Internal error'));
        }
      })
      .finally(() => pending.delete(p));
    pending.add(p);
  };

  const splitter = lineSplitter(onLine);
  io.input.setEncoding('utf8');
  io.input.on('data', (c: string) => splitter.push(c));
  const done = new Promise<void>((resolve) => {
    io.input.on('end', () => {
      splitter.flush();
      void Promise.all([...pending]).then(() => resolve());
    });
  });
  log(`MCP server ready (protocol ${PROTOCOL_VERSION}, ${gw.skills.list().length} skills)`);
  return { done };
}
