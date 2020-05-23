import { WebContents } from 'electron';
import PromiseIpcBase, { Options } from './base';
export declare class PromiseIpcMain extends PromiseIpcBase {
    constructor(opts?: Options);
    send(route: string, webContents: WebContents, ...dataArgs: unknown[]): Promise<unknown>;
}
export declare type MainProcessType = PromiseIpcMain & {
    PromiseIpc?: typeof PromiseIpcMain;
    PromiseIpcMain?: typeof PromiseIpcMain;
};
export declare const PromiseIpc: typeof PromiseIpcMain;
declare const mainExport: MainProcessType;
export default mainExport;
