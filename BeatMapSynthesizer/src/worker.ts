import * as path from 'path';
import * as fsx from 'fs-extra';
import * as mm from 'music-metadata';
import { v4 as uuidv4 } from 'uuid';
import sanitize from 'sanitize-filename';
import jimp from 'jimp';
import seedrandom from 'seedrandom';
import __beatMapArgs from './__beatMapArgs';
import {
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
  private _error: (message: string) => void;
  log_id: string;
  log_header: string;
  song_args?: SongArgs;
  tracks?: Tracks;
  tempDir: string;
  running: boolean;

  // Constructor
  constructor(_appendMessageTaskLog: (message: string, group?: string) => void, _error: (message: string) => void) {
    this._appendMessageTaskLog = _appendMessageTaskLog;
    this._error = _error;
    // create the worker
    this.log_id = uuidv4();
    this.log_header = '';
    this.tempDir = path.join(process.env.APPDATA ?? process.cwd(), 'beat-map-synthesizer', 'temp');
    this.running = false;
  }

  // Class methods
  private error(message: string) {
    this._error(`---------\n${this.log_header}\n---------\n${message}`);
  }
  private appendMessageTaskLog(message: string, useHeader = true) {
    this._appendMessageTaskLog(useHeader ? `\t${this.log_header} | ${message}...` : message, this.log_id);
  }

  async generateBeatMaps(dir: string, args: __beatMapArgs): Promise<boolean> {
    this.running = true;
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

    let beatMapExists: boolean = fsx.existsSync(path.join(args.outDir, `${song_name}.zip`));

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
        args.albumDir =
          args.albumDir && args.albumDir !== 'NONE' ? args.albumDir : path.join(this.tempDir, 'cover.jpg');
      }

      this.appendMessageTaskLog('Setting beat map parameters');

      if (args.environment === 'RANDOM') {
        args.environment = this.getRandomEnvironment();
      }
    }

    if (!this.running) {
      return false;
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

    for (const difficulty of ['easy', 'normal', 'hard', 'expert', 'expertplus']) {
      if (fsx.existsSync(path.join(this.song_args.workingDir, `${difficulty.toLowerCase()}.dat`))) {
        fsx.removeSync(path.join(this.song_args.workingDir, `${difficulty.toLowerCase()}.dat`));
      }
    }
    if (fsx.existsSync(path.join(this.song_args.workingDir, 'info.dat'))) {
      fsx.removeSync(path.join(this.song_args.workingDir, 'info.dat'));
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

    if (!this.running) {
      return false;
    }

    if (this.song_args && this.tracks && (await isPythonServerRunning())) {
      this.appendMessageTaskLog('Loading Song');
      const modelParams = (await getBeatFeatures(this.song_args.song_path)).data;
      this.tracks = {
        ...this.tracks,
        ...modelParams,
      };
      this.appendMessageTaskLog('Song loaded');
      if (!this.running) {
        return false;
      }
      const difficulties = (
        this.song_args.difficulty === 'all'
          ? ['easy', 'normal', 'hard', 'expert', 'expertplus']
          : [this.song_args.difficulty]
      ).map(difficulty => difficulty.toLowerCase());
      let processedDifficultes: string[] = [];
      this.appendMessageTaskLog('Mapping');
      for (const difficulty of difficulties as ('easy' | 'normal' | 'hard' | 'expert' | 'expertplus')[]) {
        this.appendMessageTaskLog(`Processing ${difficulty}`);
        if (!this.running) {
          return false;
        }
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

          if (!this.running) {
            return false;
          }

          if (!this.tracks[difficulty].notes_list || !Array.isArray(this.tracks[difficulty].notes_list)) {
            throw new Error(`Notes list was invalid!\n\t${JSON.stringify(this.tracks[difficulty].notes_list)}`);
          }

          this.tracks[difficulty].events_list = getEventsList(
            {
              notes_list: this.tracks[difficulty].notes_list,
              bpm: this.tracks.bpm,
              eventColorSwapOffset: this.song_args.eventColorSwapOffset,
            },
            this.error
          );

          this.tracks[difficulty].obstacles_list = getObstaclesList({
            notes_list: this.tracks[difficulty].notes_list,
            bpm: this.tracks.bpm,
          });

          processedDifficultes.push(difficulty);
        } catch (e) {
          this.error(e as any);
          this.appendMessageTaskLog(`Difficulty processing error, ${difficulty} skipped!`);
        }
        this.appendMessageTaskLog(`Processing ${difficulty} done!`);
      }
      this.appendMessageTaskLog('Mapping done!');
      if (processedDifficultes.length > 0) {
        this.appendMessageTaskLog('Writing files to disk');
        this.writeInfoFile(processedDifficultes);
        this.writeLevelFile(processedDifficultes);
        if (!this.running) {
          return false;
        }
        this.appendMessageTaskLog('Converting music file');
        await convertMusicFile(this.song_args.song_path, this.song_args.workingDir);
        if (!this.running) {
          return false;
        }
        this.appendMessageTaskLog('Zipping folder');
        this.zipFiles(processedDifficultes);
        if (!this.running) {
          return false;
        }
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
    } else {
      this.error('Python server is not running!');
    }
    this.appendMessageTaskLog('Generated beat map!');
    return true;
  }

  stopWorker() {
    this.running = false;
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
      fsx.copyFileSync(
        fsx.existsSync(this.song_args.albumDir) ? this.song_args.albumDir : path.join(this.tempDir, 'cover.jpg'),
        path.join(workingDir, 'cover.jpg')
      );
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
      zip.writeZip(
        path.join(
          this.song_args.outDir.substr(0, this.song_args.outDir.lastIndexOf('/')),
          `${this.song_args.song_name}.zip`
        )
      );
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
