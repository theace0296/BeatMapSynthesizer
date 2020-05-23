import { RendererProcessType } from './renderer';
import { MainProcessType } from './mainProcess';
declare const exportedModule: RendererProcessType | MainProcessType;
export default exportedModule;
export { RendererProcessType } from './renderer';
export { MainProcessType } from './mainProcess';
