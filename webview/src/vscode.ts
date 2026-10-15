// Thin typed wrapper around the VS Code webview API.
export interface VsCodeApi<State = unknown> {
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare function acquireVsCodeApi<State = unknown>(): VsCodeApi<State>;

export interface PersistedState {
  selected?: string;
  zoom?: number;
  pan?: { x: number; y: number };
}

export const vscode: VsCodeApi<PersistedState> = acquireVsCodeApi<PersistedState>();
