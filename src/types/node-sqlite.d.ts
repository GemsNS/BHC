/**
 * Minimal typings for Node's built-in `node:sqlite` (unflagged since Node 22.13).
 * @types/node 20 does not ship them; remove this file when upgrading to @types/node ≥22.
 */
declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean; enableForeignKeyConstraints?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    open(): void;
  }
}
