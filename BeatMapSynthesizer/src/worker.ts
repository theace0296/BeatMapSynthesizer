import { app } from 'electron';
import * as path from 'path';
import { ChildProcess, exec, execFileSync, execSync } from 'child_process';
import * as mm from 'music-metadata';
import * as fsx from 'fs-extra';
import compareVersions from 'compare-versions';
import { EOL as newline } from 'os';
import { v4 as uuidv4 } from 'uuid';
import sanitize from 'sanitize-filename';
import jimp from 'jimp';
import seedrandom from 'seedrandom';
import __beatMapArgs from './__beatMapArgs';
import {
  closePythonServer,
  convertMusicFile,
  getBeatFeatures,
  getEventsList,
  getNotesList,
  getObstaclesList,
  isPythonServerRunning,
} from './pythonApi';
import AdmZip from 'adm-zip';

export interface SongArgs {
  workingDir: string;
  albumDir: string;
  outDir: string;
  song_path: string;
  song_name: string;
  difficulty: string;
  model: string;
  version: number;
  environment: string;
  lightsIntensity: number;
  zipFiles: number;
  seed: number;
  eventColorSwapOffset: number;
}

export interface Events {
  _time: number;
  _type: number;
  _value: number;
}

export interface Notes {
  _time: number;
  _lineIndex: number;
  _lineLayer: number;
  _type: number;
  _cutDirection: number;
}

export interface Obstacles {
  _time: number;
  _lineIndex: number;
  _type: number;
  _duration: number;
  _width: number;
}

export interface Tracks {
  bpm: number;
  beat_times: number[];
  y: number[];
  sr: number;
  easy: { events_list: Events[]; notes_list: Notes[]; obstacles_list: Obstacles[] };
  normal: { events_list: Events[]; notes_list: Notes[]; obstacles_list: Obstacles[] };
  hard: { events_list: Events[]; notes_list: Notes[]; obstacles_list: Obstacles[] };
  expert: { events_list: Events[]; notes_list: Notes[]; obstacles_list: Obstacles[] };
  expertplus: { events_list: Events[]; notes_list: Notes[]; obstacles_list: Obstacles[] };
}

/**
 * `Worker` is a class for creating hidden processes that are responsible for running operations.
 */
export class Worker {
  // Class variables
  private _appendMessageTaskLog: (message: string, group?: string) => void;
  private _log: (message: string) => void;
  private _error: (message: string) => void;
  appPath: string;
  scriptsInternalPath: string;
  tempDir: string;
  settings: { pythonCmd: string; pythonExists: boolean; modulesInstalled: boolean; isWindows: boolean; hasRequiredExtensions: boolean, version: string; };
  activeShell?: ChildProcess;
  log_id: string;
  log_header: string;
  song_args?: SongArgs;
  tracks?: Tracks;

  // Constructor
  constructor(
    _appendMessageTaskLog: (message: string, group?: string) => void,
    _log: (message: string) => void,
    _error: (message: string) => void
  ) {
    this._appendMessageTaskLog = _appendMessageTaskLog;
    this._log = _log;
    this._error = _error;
    // create the worker
    this.appPath = app.getAppPath();
    this.scriptsInternalPath = path.join(this.appPath, 'build/scripts');
    this.tempDir = path.join(process.env.APPDATA ?? process.cwd(), 'beat-map-synthesizer', 'temp');
    this.log_id = uuidv4();
    this.log_header = '';
    if (fsx.existsSync(path.join(this.tempDir, 'settings.json'))) {
      this.settings = JSON.parse(fsx.readFileSync(path.join(this.tempDir, 'settings.json'), 'utf8'));
    } else {
      this.settings = {
        pythonCmd: process.platform === 'win32'
          ? this.pythonExists()
            ? 'python'
            : path.join(this.tempDir, 'WPy64', 'python-3', 'python.exe')
          : 'python3',
        pythonExists: process.platform === 'win32'
          ? this.pythonExists()
          : true,
        modulesInstalled: false,
        isWindows: process.platform === 'win32',
        hasRequiredExtensions: process.platform !== 'win32',
        version: '0.0.0',
      }
    }

    this.copyScriptFile();
    if (this.isOutOfDate()) {
      this.updateModelFiles();
      if (this.settings.isWindows) {
        this.windowsInitFiles();
        this.settings.hasRequiredExtensions = true;
        this.settings.pythonExists = true;
      }
      if (!this.settings.modulesInstalled) {
        this.installPythonModules();
        this.settings.modulesInstalled = true;
      }
      this.settings.version = app.getVersion();
      fsx.writeFileSync(path.join(this.tempDir, 'settings.json'), JSON.stringify(this.settings, null, 2));
    }
  }

  // Class methods
  private log(message: string) {
    this._log(message);
  }
  private error(message: string) {
    this._error(message);
  }
  private appendMessageTaskLog(message: string, useHeader = true) {
    this._appendMessageTaskLog(useHeader ? `\t${this.log_header} | ${message}...` : message, this.log_id);
  }

  isOutOfDate() {
    return compareVersions.compare(this.settings.version, app.getVersion(), '<');
  }

  copyScriptFile() {
    this.log('initFiles - Updating script file.');
    fsx.copySync(
      path.join(this.scriptsInternalPath, 'beatMapSynthServer.py'),
      path.join(this.tempDir, 'beatMapSynthServer.py')
    );
    this.log('initFiles - Script file updated.');
  }

  updateModelFiles() {
    this.log('initFiles - Updating model files.');
    const files: string[] = [
      'cover.jpg',
      'models/HMM_easy_v1.pkl',
      'models/HMM_normal_v1.pkl',
      'models/HMM_hard_v1.pkl',
      'models/HMM_expert_v1.pkl',
      'models/HMM_expertplus_v1.pkl',
      'models/HMM_easy_v2.pkl',
      'models/HMM_normal_v2.pkl',
      'models/HMM_hard_v2.pkl',
      'models/HMM_expert_v2.pkl',
      'models/HMM_expertplus_v2.pkl',
      'models/HMM_easy_v3.pkl',
      'models/HMM_normal_v3.pkl',
      'models/HMM_hard_v3.pkl',
      'models/HMM_expert_v3.pkl',
      'models/HMM_expertplus_v3.pkl',
      'models/HMM_easy_v4.pkl',
      'models/HMM_normal_v4.pkl',
      'models/HMM_hard_v4.pkl',
      'models/HMM_expert_v4.pkl',
      'models/HMM_expertplus_v4.pkl',
    ];

    for (const file of files) {
      fsx.copySync(path.join(this.scriptsInternalPath, file), path.join(this.tempDir, file));
    }

    if (this.settings.isWindows) {
      for (const file of ['ffmpeg.exe', 'ffplay.exe', 'ffprobe.exe',]) {
        fsx.copySync(path.join(this.scriptsInternalPath, file), path.join(this.tempDir, file));
      }
    }
  }

  pythonExists() {
    try {
      return !!execSync('python --version').toString();
    }
    catch (error) {
      return false;
    }
  }

  windowsInitFiles() {
    if (!this.settings.pythonExists) {
      if (!this.settings.hasRequiredExtensions) {
        if (!fsx.existsSync(path.join(this.tempDir, 'WinPython.exe'))) {
          fsx.copySync(
            path.join(this.scriptsInternalPath, 'WinPython.exe'),
            path.join(this.tempDir, 'WinPython.exe')
          );
        }

        if (!fsx.existsSync(path.join(this.tempDir, 'VC_redist.x64.exe'))) {
          fsx.copySync(
            path.join(this.scriptsInternalPath, 'VC_redist.x64.exe'),
            path.join(this.tempDir, 'VC_redist.x64.exe')
          );
        }

        this.log('initFiles - Installing VC Redist 2017.');
        try {
          execFileSync(
            path.join(this.tempDir, 'VC_redist.x64.exe'),
            ['/install /passive /norestart'], {
              windowsHide: true,
            }
          );
        } catch (error) {
          this.error(error);
        }
      }

      if (!fsx.pathExistsSync(path.join(this.tempDir, 'WPy64'))) {
        this.log('initFiles - Installing WinPython.');
        try {
          execFileSync(
            path.join(this.tempDir, 'WinPython.exe'),
            ['-o', `"${path.join(this.tempDir, 'WPy64').normalize().replace(/\\/gi, '/')}"`, '-y'], {
              windowsHide: true,
            }
          );
        } catch (error) {
          this.error(error)
        }
      }
    }
  }

  installPythonModules() {
    this.log('initFiles - Installing Python packages.');
    try {
      let data = '';
      if (!this.settings.pythonCmd.includes('python.exe')) {
        data = execSync(
          `${this.settings.pythonCmd} -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`, {
            windowsHide: true,
          }
        ).toString();
      } else {
        data = execSync(
          `cd ${path.dirname(this.settings.pythonCmd)} && python.exe -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`, {
            windowsHide: true,
          }
        ).toString();
      }
      this.log(data);
    } catch (error) {
      this.error(error);
    }
    this.log(`initFiles - Installed Python packages.`);
  }

  async generateBeatMaps(dir: string, args: __beatMapArgs): Promise<boolean> {
    this.appendMessageTaskLog('Starting beatmap generation', false);
    let metadata: mm.IAudioMetadata = await mm.parseFile(path.normalize(dir));
    this.appendMessageTaskLog('Metadata Loaded', false);
    let trackname: string = sanitize(metadata.common.title ?? '');
    this.appendMessageTaskLog('Song Title Found', false);
    let artistname: string = sanitize(metadata.common.artist ?? '');
    this.appendMessageTaskLog('Artist Found', false);
    const song_name = `${trackname} - ${artistname}`;
    this.log_header = song_name;
    let embeddedart: mm.IPicture | null = null;

    this.appendMessageTaskLog('Checking if beat map already exists');

    let beatMapExists: boolean =
      fsx.existsSync(path.join(args.outDir, song_name, 'info.dat')) ||
      fsx.existsSync(path.join(args.outDir, `${song_name}.zip`));

    if (beatMapExists) {
      this.appendMessageTaskLog('Beat map exists, skipping!');
    } else {
      this.appendMessageTaskLog('Searching for embedded art');

      if (metadata.common.picture) {
        embeddedart = this.findEmbeddedArt(metadata.common.picture);
      }

      fsx.ensureDirSync(path.join(this.tempDir.normalize(), song_name));

      if (embeddedart) {
        args.albumDir = await this.extractEmbeddedArt(song_name, embeddedart);
        args.albumDir = args.albumDir && args.albumDir !== 'NONE'
          ? args.albumDir
          : path.join(this.tempDir, 'cover.jpg');
      }

      this.appendMessageTaskLog('Setting beat map parameters');

      if (args.environment === 'RANDOM') {
        args.environment = this.getRandomEnvironment();
      }
    }

    this.song_args = {
      workingDir: `${this.tempDir.normalize().replace(/\\/gi, '/')}/${song_name}`,
      albumDir: `${args.albumDir.normalize().replace(/\\/gi, '/')}`,
      outDir: `${args.outDir.normalize().replace(/\\/gi, '/')}/${song_name}`,
      song_path: `${dir.normalize().replace(/\\/gi, '/')}`,
      song_name: song_name,
      difficulty: args.difficulty,
      model: args.model,
      version: args.version ?? 2,
      environment: args.environment ?? 'DefaultEnvironment',
      lightsIntensity: args.lightsIntensity ? 11.5 - args.lightsIntensity : 2.5,
      zipFiles: args.zipFiles,
      seed: seedrandom(song_name, { entropy: true })(),
      eventColorSwapOffset: 2.5,
    };

    if (!fsx.existsSync(this.song_args.outDir)) {
      fsx.ensureDirSync(this.song_args.outDir);
    }

    const baseLists = {
      events_list: [],
      notes_list: [],
      obstacles_list: [],
    };

    this.tracks = {
      bpm: 0,
      beat_times: [],
      y: [],
      sr: 0,
      easy: { ...baseLists },
      normal: { ...baseLists },
      hard: { ...baseLists },
      expert: { ...baseLists },
      expertplus: { ...baseLists },
    };

    let songs_json: unknown[] = fsx.existsSync(path.join(this.tempDir.normalize(), 'songs.json'))
      ? JSON.parse(fsx.readFileSync(path.join(this.tempDir.normalize(), 'songs.json')).toString())
      : [];
    songs_json.push(this.song_args);
    fsx.writeFileSync(path.join(this.tempDir.normalize(), 'songs.json'), JSON.stringify(songs_json, null, 2));

    this.appendMessageTaskLog('Generating beat map');

    await this.runPythonShell();

    if (this.song_args && this.tracks && (await isPythonServerRunning())) {
      this.appendMessageTaskLog('Loading Song');
      const modelParams = (await getBeatFeatures(this.song_args.song_path)).data;
      this.tracks = {
        ...this.tracks,
        ...modelParams,
      };
      this.appendMessageTaskLog('Song loaded');
      const difficulties = (
        this.song_args.difficulty === 'all'
          ? ['easy', 'normal', 'hard', 'expert', 'expertplus']
          : [this.song_args.difficulty]
      ).map(difficulty => difficulty.toLowerCase());
      let processedDifficultes: string[] = [];
      this.appendMessageTaskLog('Mapping');
      for (const difficulty of difficulties as ('easy' | 'normal' | 'hard' | 'expert' | 'expertplus')[]) {
        this.appendMessageTaskLog(`Processing ${difficulty}`);
        try {
          this.tracks[difficulty].notes_list = (
            await getNotesList({
              model: this.song_args.model,
              difficulty: difficulty,
              beat_times: this.tracks.beat_times,
              bpm: this.tracks.bpm,
              version: this.song_args.version,
              y: this.tracks.y,
              sr: this.tracks.sr,
              tempDir: this.tempDir,
            })
          ).data;

          if (!this.tracks[difficulty].notes_list || !Array.isArray(this.tracks[difficulty].notes_list)) {
            throw new Error(`Notes list was invalid!\n\t${JSON.stringify(this.tracks[difficulty].notes_list)}`);
          }

          this.tracks[difficulty].events_list = getEventsList({
            notes_list: this.tracks[difficulty].notes_list,
            bpm: this.tracks.bpm,
            eventColorSwapOffset: this.song_args.eventColorSwapOffset,
          });

          this.tracks[difficulty].obstacles_list = getObstaclesList({
            notes_list: this.tracks[difficulty].notes_list,
            bpm: this.tracks.bpm,
          });

          processedDifficultes.push(difficulty);
        } catch (e) {
          this.error(e);
          this.appendMessageTaskLog(`Difficulty processing error, ${difficulty} skipped!`);
        }
        this.appendMessageTaskLog(`Processing ${difficulty} done!`);
      }
      this.appendMessageTaskLog('Mapping done!');
      if (processedDifficultes.length > 0) {
        this.appendMessageTaskLog('Writing files to disk');
        this.writeInfoFile(processedDifficultes);
        this.writeLevelFile(processedDifficultes);
        this.appendMessageTaskLog('Converting music file');
        await convertMusicFile(this.song_args.song_path, this.song_args.workingDir);
        this.appendMessageTaskLog('Zipping folder');
        this.zipFiles(processedDifficultes);
        this.appendMessageTaskLog(
          `${this.song_args.song_name} | Finished! \n\tLook for ${
            this.song_args.zipFiles === 1 ? 'zipped folder' : 'folder'
          } in ${this.song_args.outDir}, ${
            this.song_args.zipFiles === 1 ? 'unzip the folder, ' : ''
          }\n\tplace in the 'CustomMusic' folder in Beat Saber's files.`,
          false
        );
      } else {
        this.error('Song processing error!');
      }
      await closePythonServer();
    } else {
      this.error('Python server is not running!');
    }
    this.appendMessageTaskLog('Generated beat map!');
    return true;
  }

  runPythonShell(): Promise<boolean> {
    const self = this;
    return new Promise((resolve, reject) => {
      if (!this.song_args || !this.tracks) {
        reject(false);
      }
      let _remaining: string | undefined;

      const failedToStartTimeout = setTimeout(() => {
        this.log('Python process failed to spawn -- timed out!')
        reject(false);
      }, 30000);

      function parseOut(data?: string) {
        data && self._log(data);
      }

      function receiveInternal(this: any, data: string | Buffer, emitType: 'stdout' | 'stderr') {
        let parts = ('' + data).split(newline);

        if (parts.length === 1) {
          // an incomplete record, keep buffering
          _remaining = (_remaining || '') + parts[0];
          return this;
        }

        let lastLine = parts.pop();
        // fix the first line with the remaining from the previous iteration of 'receive'
        parts[0] = (_remaining || '') + parts[0];
        // keep the remaining for the next iteration of 'receive'
        _remaining = lastLine;

        parts.forEach(function (part) {
          if (part.includes('Running on http://127.0.0.1:5000/')) {
            clearTimeout(failedToStartTimeout);
            resolve(true);
          }
          parseOut(part);
        });

        return this;
      }

      function receiveStdout(data: string | Buffer) {
        return receiveInternal(data, 'stdout');
      }

      function receiveStderr(data: string | Buffer) {
        return receiveInternal(data, 'stderr');
      }

      if (!this.settings.pythonCmd.includes('python.exe')) {
        this.activeShell = exec(
          `${this.settings.pythonCmd} "${path.normalize(path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py'))}"`,
          {
            timeout: 300000,
            windowsHide: true,
          }
        );
      } else {
        this.activeShell = exec(
          `cd ${path.dirname(this.settings.pythonCmd)} && python.exe "${path.normalize(path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py'))}"`,
          {
            timeout: 300000,
            windowsHide: true,
          }
        );
      }

      this.activeShell.on('close', code => {
        this.log('Finished');

        if (!this.song_args) {
          this.error('Song args was undefined! Error while closing shell!');
          return;
        }

        if (code === 0) {
          this.appendMessageTaskLog('Finished successfully!');
        } else {
          this.appendMessageTaskLog(`Failed with exit code: ${code}`);
        }
      });

      this.activeShell.stdout?.setEncoding('utf8');
      this.activeShell.stderr?.setEncoding('utf8');

      this.activeShell.stdout?.on('data', buffer => receiveStdout(buffer));

      this.activeShell.stderr?.on('data', buffer => receiveStderr(buffer));

      this.activeShell.once('spawn', () => {
        this.log('Python process spawned successfully!')
        clearTimeout(failedToStartTimeout);
        resolve(true);
      });

      this.activeShell.once('error', () => {
        this.log('Python process failed to spawn!')
        clearTimeout(failedToStartTimeout);
        reject(false);
      });

      setTimeout(() => {
        this.activeShell?.kill('SIGTERM');
      }, 450000);
    });
  }

  killShell() {
    if (this.activeShell) {
      closePythonServer().finally(() => {
        if (this.activeShell?.connected && !this.activeShell.kill('SIGTERM')) {
          // Kills a PID and all child process
          exec(`taskkill /f /t /pid ${this.activeShell.pid}`, (err, stdout) => {
            console.log('stdout', stdout);
            console.log('stderr', err);
          });
        }
        delete this.activeShell;
      })
    }
    return true;
  }

  getRandomEnvironment() {
    const environments = [
      'DefaultEnvironment',
      'BigMirrorEnvironment',
      'Origins',
      'NiceEnvironment',
      'TriangleEnvironment',
      'KDAEnvironment',
      'DragonsEnvironment',
      'MonstercatEnvironment',
      'CrabRaveEnvironment',
      'PanicEnvironment',
      'RocketEnvironment',
      'GreenDayEnvironment',
      'GreenDayGrenadeEnvironment',
    ];
    return environments[Math.floor(Math.random() * environments.length)];
  }

  zipFiles(difficulties: string[]) {
    if (!this.song_args) {
      this.error('Song args was undefined, could not zip files!');
      return;
    }

    const workingDir = this.song_args.workingDir;
    const outDir = this.song_args.outDir;
    if (!fsx.existsSync(path.join(workingDir, 'cover.jpg'))) {
      fsx.copyFileSync(fsx.existsSync(this.song_args.albumDir) ? this.song_args.albumDir : path.join(this.tempDir, 'cover.jpg'), path.join(workingDir, 'cover.jpg'));
    }
    const files = [
      path.join(workingDir, 'info.dat'),
      path.join(workingDir, 'cover.jpg'),
      path.join(workingDir, 'song.egg'),
      ...difficulties.map(difficulty => path.join(workingDir, `${difficulty}.dat`)),
    ];
    if (this.song_args.zipFiles === 1) {
      const zip = new AdmZip();
      for (const file of files) {
        zip.addLocalFile(file);
        fsx.unlinkSync(file);
      }
      zip.writeZip(path.join(this.song_args.outDir.substr(0, this.song_args.outDir.lastIndexOf('/')), `${this.song_args.song_name}.zip`));
      fsx.rmdirSync(workingDir);
      fsx.rmdirSync(this.song_args.outDir);
    } else {
      for (const file of files) {
        fsx.copyFileSync(file, path.resolve(outDir, path.basename(file)));
        fsx.unlinkSync(file);
      }
      fsx.rmdirSync(workingDir);
    }
  }

  writeLevelFile(difficulties: string[]) {
    if (!this.song_args) {
      this.error('Song args was undefined, could not write level file!');
      return;
    }
    if (!this.tracks) {
      this.error('Tracks was undefined, could not write level file!');
      return;
    }
    const workingDir = this.song_args.workingDir;
    const tracks = this.tracks;
    for (const difficulty of difficulties) {
      const level = {
        _version: '2.0.0',
        _customData: {
          _time: '', // not sure what time refers to
          _BPMChanges: [],
          _bookmarks: [],
        },
        _events: tracks[difficulty.toLowerCase()]['events_list'],
        _notes: tracks[difficulty.toLowerCase()]['notes_list'],
        _obstacles: tracks[difficulty.toLowerCase()]['obstacles_list'],
      };
      fsx.writeJSONSync(path.join(workingDir, `${difficulty.toLowerCase()}.dat`), level);
    }
  }

  writeInfoFile(difficulties?: string[]) {
    if (!this.song_args) {
      this.error('Song args was undefined, could not write info file!');
      return;
    }
    if (!this.tracks) {
      this.error('Tracks was undefined, could not write info file!');
      return;
    }
    interface BeatMapInfo {
      _difficulty: string;
      _difficultyRank: number;
      _beatmapFilename: string;
      _noteJumpMovementSpeed: number;
      _noteJumpStartBeatOffset: number;
      _customData: {};
    }

    let difficultyBeatmapInfoArray: BeatMapInfo[] = [];

    const getBeatmapInfo = (difficulty: string, rank: number, movementSpeed: number): BeatMapInfo => {
      return {
        _difficulty: difficulty,
        _difficultyRank: rank,
        _beatmapFilename: `${difficulty.toLowerCase()}.dat`,
        _noteJumpMovementSpeed: movementSpeed,
        _noteJumpStartBeatOffset: 0,
        _customData: {},
      };
    };

    const easyBeatmapInfo = getBeatmapInfo('Easy', 1, 8);
    const normalBeatmapInfo = getBeatmapInfo('Normal', 3, 10);
    const hardBeatmapInfo = getBeatmapInfo('Hard', 5, 12);
    const expertBeatmapInfo = getBeatmapInfo('Expert', 7, 14);
    const expertplusBeatmapInfo = getBeatmapInfo('ExpertPlus', 9, 16);

    const beatmapInfo = {
      easy: easyBeatmapInfo,
      normal: normalBeatmapInfo,
      hard: hardBeatmapInfo,
      expert: expertBeatmapInfo,
      expertplus: expertplusBeatmapInfo,
    };

    switch (this.song_args.difficulty.toLowerCase()) {
      case 'easy':
        difficultyBeatmapInfoArray = [easyBeatmapInfo];
        break;
      case 'normal':
        difficultyBeatmapInfoArray = [normalBeatmapInfo];
        break;
      case 'hard':
        difficultyBeatmapInfoArray = [hardBeatmapInfo];
        break;
      case 'expert':
        difficultyBeatmapInfoArray = [expertBeatmapInfo];
        break;
      case 'expertplus':
        difficultyBeatmapInfoArray = [expertplusBeatmapInfo];
        break;
      default:
        if (difficulties) {
          difficultyBeatmapInfoArray = difficulties.map(diffKey => beatmapInfo[diffKey]);
        } else {
          difficultyBeatmapInfoArray = [
            easyBeatmapInfo,
            normalBeatmapInfo,
            hardBeatmapInfo,
            expertBeatmapInfo,
            expertplusBeatmapInfo,
          ];
        }
        break;
    }

    const _artist = this.song_args.song_name.split(' - ')[this.song_args.song_name.split(' - ').length - 1];
    const info = {
      _version: '2.0.0',
      _songName: this.song_args.song_name,
      _songSubName: '',
      _songAuthorName: _artist,
      _levelAuthorName: 'BeatMapSynth',
      _beatsPerMinute: Math.floor(this.tracks.bpm),
      _songTimeOffset: 0,
      _shuffle: 0,
      _shufflePeriod: 0,
      _previewStartTime: 10,
      _previewDuration: 30,
      _songFilename: 'song.egg',
      _coverImageFilename: 'cover.jpg',
      _environmentName: this.song_args.environment,
      _customData: {},
      _difficultyBeatmapSets: [
        {
          _beatmapCharacteristicName: 'Standard',
          _difficultyBeatmaps: difficultyBeatmapInfoArray,
        },
      ],
    };

    fsx.writeJSONSync(path.join(this.song_args.workingDir, 'info.dat'), info);
  }

  async extractEmbeddedArt(song_name: string, embeddedart: mm.IPicture) {
    if (embeddedart.data.length > 0) {
      this.appendMessageTaskLog('Embedded art processing!');
      let convertedImage: any;
      let newBuffer: Buffer;
      const imgDir = path.join(this.tempDir.normalize(), song_name, 'cover.jpg');
      switch (embeddedart.format.toLowerCase()) {
        case 'image/bmp':
          this.appendMessageTaskLog('Embedded art writing!');
          convertedImage = await jimp.read(embeddedart.data);
          newBuffer = convertedImage.getBufferAsync('image/jpeg');
          fsx.writeFileSync(imgDir, newBuffer);
          return imgDir;
        case 'image/gif':
          this.appendMessageTaskLog('Embedded art writing!');
          convertedImage = await jimp.read(embeddedart.data);
          newBuffer = convertedImage.getBufferAsync('image/jpeg');
          fsx.writeFileSync(imgDir, newBuffer);
          return imgDir;
        case 'image/jpeg':
          this.appendMessageTaskLog('Embedded art writing!');
          fsx.writeFileSync(imgDir, embeddedart.data);
          return imgDir;
        case 'image/png':
          this.appendMessageTaskLog('Embedded art writing!');
          convertedImage = await jimp.read(embeddedart.data);
          newBuffer = convertedImage.getBufferAsync('image/jpeg');
          fsx.writeFileSync(imgDir, newBuffer);
          return imgDir;
        case 'image/tiff':
          this.appendMessageTaskLog('Embedded art writing!');
          convertedImage = await jimp.read(embeddedart.data);
          newBuffer = convertedImage.getBufferAsync('image/jpeg');
          fsx.writeFileSync(imgDir, newBuffer);
          return imgDir;
      }
    }
    return 'NONE';
  }

  findEmbeddedArt(picture: mm.IPicture[]) {
    for (let i = 0; i < picture.length; i++) {
      let currentType = picture[i].type?.toLowerCase();
      if (
        currentType === 'cover (front)' ||
        currentType === 'cover art (front)' ||
        currentType === 'pic' ||
        currentType === 'apic' ||
        currentType === 'covr' ||
        currentType === 'metadata_block_picture' ||
        currentType === 'wm/picture' ||
        currentType === 'picture'
      ) {
        this.appendMessageTaskLog('Embedded art found!');
        return picture[i];
      }
    }
    return null;
  }
}
