/**
 * __beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
export default class __beatMapArgs {
  dir: string;
  difficulty: string;
  model: string;
  version: number;
  outDir: string;
  zipFiles: number;
  environment: string;
  lightsIntensity: number;
  albumDir: string;

  constructor() {
    this.dir = '';
    this.difficulty = 'all';
    this.model = 'random';
    this.version = 2;
    this.outDir = process.env.PORTABLE_EXECUTABLE_DIR ?? process.cwd();
    this.zipFiles = 0;
    this.environment = 'RANDOM';
    this.lightsIntensity = 9;
    this.albumDir = 'NONE';
  }
}
