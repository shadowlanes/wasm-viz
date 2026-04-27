/* tslint:disable */
/* eslint-disable */

export class SearchResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    found: boolean;
    nodes_explored: number;
    path_length: number;
    readonly path: Uint32Array;
    readonly visited: Uint32Array;
}

export function astar(grid: Uint8Array, n: number, start: number, end: number): SearchResult;

export function bfs(grid: Uint8Array, n: number, start: number, end: number): SearchResult;

export function bidijkstra(grid: Uint8Array, n: number, start: number, end: number): SearchResult;

export function dijkstra(grid: Uint8Array, n: number, start: number, end: number): SearchResult;

export function jps(grid: Uint8Array, n: number, start: number, end: number): SearchResult;

export function theta(grid: Uint8Array, n: number, start: number, end: number): SearchResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_searchresult_found: (a: number) => number;
    readonly __wbg_get_searchresult_nodes_explored: (a: number) => number;
    readonly __wbg_get_searchresult_path_length: (a: number) => number;
    readonly __wbg_searchresult_free: (a: number, b: number) => void;
    readonly __wbg_set_searchresult_found: (a: number, b: number) => void;
    readonly __wbg_set_searchresult_nodes_explored: (a: number, b: number) => void;
    readonly __wbg_set_searchresult_path_length: (a: number, b: number) => void;
    readonly astar: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly bfs: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly bidijkstra: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly dijkstra: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly jps: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly searchresult_path: (a: number) => [number, number];
    readonly searchresult_visited: (a: number) => [number, number];
    readonly theta: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
