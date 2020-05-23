import PromiseIpcBase, { Options } from './base';
export declare class PromiseIpcRenderer extends PromiseIpcBase {
    constructor(opts?: Options);
    send(route: string, ...dataArgs: unknown[]): Promise<unknown>;
}
export declare type RendererProcessType = PromiseIpcRenderer & {
    PromiseIpc?: typeof PromiseIpcRenderer;
    PromiseIpcRenderer?: typeof PromiseIpcRenderer;
};
export declare const PromiseIpc: typeof PromiseIpcRenderer;
declare const rendererExport: RendererProcessType;
export default rendererExport;
