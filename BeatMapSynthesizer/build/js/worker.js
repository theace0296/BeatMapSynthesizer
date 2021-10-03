"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Worker = void 0;
const path = __importStar(require("path"));
const fsx = __importStar(require("fs-extra"));
const mm = __importStar(require("music-metadata"));
const uuid_1 = require("uuid");
const sanitize_filename_1 = __importDefault(require("sanitize-filename"));
const jimp_1 = __importDefault(require("jimp"));
const seedrandom_1 = __importDefault(require("seedrandom"));
const pythonApi_1 = require("./pythonApi");
const adm_zip_1 = __importDefault(require("adm-zip"));
/**
 * `Worker` is a class for creating hidden processes that are responsible for running operations.
 */
class Worker {
    // Class variables
    _appendMessageTaskLog;
    _error;
    log_id;
    log_header;
    song_args;
    tracks;
    tempDir;
    running;
    // Constructor
    constructor(_appendMessageTaskLog, _error) {
        this._appendMessageTaskLog = _appendMessageTaskLog;
        this._error = _error;
        // create the worker
        this.log_id = uuid_1.v4();
        this.log_header = '';
        this.tempDir = path.join(process.env.APPDATA ?? process.cwd(), 'beat-map-synthesizer', 'temp');
        this.running = false;
    }
    // Class methods
    error(message) {
        this._error(`---------\n${this.log_header}\n---------\n${message}`);
    }
    appendMessageTaskLog(message, useHeader = true) {
        this._appendMessageTaskLog(useHeader ? `\t${this.log_header} | ${message}...` : message, this.log_id);
    }
    async generateBeatMaps(dir, args) {
        this.running = true;
        this.appendMessageTaskLog('Starting beatmap generation', false);
        let metadata = await mm.parseFile(path.normalize(dir));
        this.appendMessageTaskLog('Metadata Loaded', false);
        let trackname = sanitize_filename_1.default(metadata.common.title ?? '');
        this.appendMessageTaskLog('Song Title Found', false);
        let artistname = sanitize_filename_1.default(metadata.common.artist ?? '');
        this.appendMessageTaskLog('Artist Found', false);
        const song_name = `${trackname} - ${artistname}`;
        this.log_header = song_name;
        let embeddedart = null;
        this.appendMessageTaskLog('Checking if beat map already exists');
        let beatMapExists = fsx.existsSync(path.join(args.outDir, `${song_name}.zip`));
        if (beatMapExists) {
            this.appendMessageTaskLog('Beat map exists, skipping!');
        }
        else {
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
            seed: seedrandom_1.default(song_name, { entropy: true })(),
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
        let songs_json = fsx.existsSync(path.join(this.tempDir.normalize(), 'songs.json'))
            ? JSON.parse(fsx.readFileSync(path.join(this.tempDir.normalize(), 'songs.json')).toString())
            : [];
        songs_json.push(this.song_args);
        fsx.writeFileSync(path.join(this.tempDir.normalize(), 'songs.json'), JSON.stringify(songs_json, null, 2));
        this.appendMessageTaskLog('Generating beat map');
        if (!this.running) {
            return false;
        }
        if (this.song_args && this.tracks && (await pythonApi_1.isPythonServerRunning())) {
            this.appendMessageTaskLog('Loading Song');
            const modelParams = (await pythonApi_1.getBeatFeatures(this.song_args.song_path)).data;
            this.tracks = {
                ...this.tracks,
                ...modelParams,
            };
            this.appendMessageTaskLog('Song loaded');
            if (!this.running) {
                return false;
            }
            const difficulties = (this.song_args.difficulty === 'all'
                ? ['easy', 'normal', 'hard', 'expert', 'expertplus']
                : [this.song_args.difficulty]).map(difficulty => difficulty.toLowerCase());
            let processedDifficultes = [];
            this.appendMessageTaskLog('Mapping');
            for (const difficulty of difficulties) {
                this.appendMessageTaskLog(`Processing ${difficulty}`);
                if (!this.running) {
                    return false;
                }
                try {
                    this.tracks[difficulty].notes_list = (await pythonApi_1.getNotesList({
                        model: this.song_args.model,
                        difficulty: difficulty,
                        beat_times: this.tracks.beat_times,
                        bpm: this.tracks.bpm,
                        version: this.song_args.version,
                        y: this.tracks.y,
                        sr: this.tracks.sr,
                        tempDir: this.tempDir,
                    })).data;
                    if (!this.running) {
                        return false;
                    }
                    if (!this.tracks[difficulty].notes_list || !Array.isArray(this.tracks[difficulty].notes_list)) {
                        throw new Error(`Notes list was invalid!\n\t${JSON.stringify(this.tracks[difficulty].notes_list)}`);
                    }
                    this.tracks[difficulty].events_list = pythonApi_1.getEventsList({
                        notes_list: this.tracks[difficulty].notes_list,
                        bpm: this.tracks.bpm,
                        eventColorSwapOffset: this.song_args.eventColorSwapOffset,
                    }, this.error);
                    this.tracks[difficulty].obstacles_list = pythonApi_1.getObstaclesList({
                        notes_list: this.tracks[difficulty].notes_list,
                        bpm: this.tracks.bpm,
                    });
                    processedDifficultes.push(difficulty);
                }
                catch (e) {
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
                if (!this.running) {
                    return false;
                }
                this.appendMessageTaskLog('Converting music file');
                await pythonApi_1.convertMusicFile(this.song_args.song_path, this.song_args.workingDir);
                if (!this.running) {
                    return false;
                }
                this.appendMessageTaskLog('Zipping folder');
                this.zipFiles(processedDifficultes);
                if (!this.running) {
                    return false;
                }
                this.appendMessageTaskLog(`${this.song_args.song_name} | Finished! \n\tLook for ${this.song_args.zipFiles === 1 ? 'zipped folder' : 'folder'} in ${this.song_args.outDir}, ${this.song_args.zipFiles === 1 ? 'unzip the folder, ' : ''}\n\tplace in the 'CustomMusic' folder in Beat Saber's files.`, false);
            }
            else {
                this.error('Song processing error!');
            }
        }
        else {
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
    zipFiles(difficulties) {
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
            const zip = new adm_zip_1.default();
            for (const file of files) {
                zip.addLocalFile(file);
                fsx.unlinkSync(file);
            }
            zip.writeZip(path.join(this.song_args.outDir.substr(0, this.song_args.outDir.lastIndexOf('/')), `${this.song_args.song_name}.zip`));
            fsx.rmdirSync(workingDir);
            fsx.rmdirSync(this.song_args.outDir);
        }
        else {
            for (const file of files) {
                fsx.copyFileSync(file, path.resolve(outDir, path.basename(file)));
                fsx.unlinkSync(file);
            }
            fsx.rmdirSync(workingDir);
        }
    }
    writeLevelFile(difficulties) {
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
                    _time: '',
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
    writeInfoFile(difficulties) {
        if (!this.song_args) {
            this.error('Song args was undefined, could not write info file!');
            return;
        }
        if (!this.tracks) {
            this.error('Tracks was undefined, could not write info file!');
            return;
        }
        let difficultyBeatmapInfoArray = [];
        const getBeatmapInfo = (difficulty, rank, movementSpeed) => {
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
                }
                else {
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
    async extractEmbeddedArt(song_name, embeddedart) {
        if (embeddedart.data.length > 0) {
            this.appendMessageTaskLog('Embedded art processing!');
            let convertedImage;
            let newBuffer;
            const imgDir = path.join(this.tempDir.normalize(), song_name, 'cover.jpg');
            switch (embeddedart.format.toLowerCase()) {
                case 'image/bmp':
                    this.appendMessageTaskLog('Embedded art writing!');
                    convertedImage = await jimp_1.default.read(embeddedart.data);
                    newBuffer = convertedImage.getBufferAsync('image/jpeg');
                    fsx.writeFileSync(imgDir, newBuffer);
                    return imgDir;
                case 'image/gif':
                    this.appendMessageTaskLog('Embedded art writing!');
                    convertedImage = await jimp_1.default.read(embeddedart.data);
                    newBuffer = convertedImage.getBufferAsync('image/jpeg');
                    fsx.writeFileSync(imgDir, newBuffer);
                    return imgDir;
                case 'image/jpeg':
                    this.appendMessageTaskLog('Embedded art writing!');
                    fsx.writeFileSync(imgDir, embeddedart.data);
                    return imgDir;
                case 'image/png':
                    this.appendMessageTaskLog('Embedded art writing!');
                    convertedImage = await jimp_1.default.read(embeddedart.data);
                    newBuffer = convertedImage.getBufferAsync('image/jpeg');
                    fsx.writeFileSync(imgDir, newBuffer);
                    return imgDir;
                case 'image/tiff':
                    this.appendMessageTaskLog('Embedded art writing!');
                    convertedImage = await jimp_1.default.read(embeddedart.data);
                    newBuffer = convertedImage.getBufferAsync('image/jpeg');
                    fsx.writeFileSync(imgDir, newBuffer);
                    return imgDir;
            }
        }
        return 'NONE';
    }
    findEmbeddedArt(picture) {
        for (let i = 0; i < picture.length; i++) {
            let currentType = picture[i].type?.toLowerCase();
            if (currentType === 'cover (front)' ||
                currentType === 'cover art (front)' ||
                currentType === 'pic' ||
                currentType === 'apic' ||
                currentType === 'covr' ||
                currentType === 'metadata_block_picture' ||
                currentType === 'wm/picture' ||
                currentType === 'picture') {
                this.appendMessageTaskLog('Embedded art found!');
                return picture[i];
            }
        }
        return null;
    }
}
exports.Worker = Worker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3dvcmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQTZCO0FBQzdCLDhDQUFnQztBQUNoQyxtREFBcUM7QUFDckMsK0JBQW9DO0FBQ3BDLDBFQUF5QztBQUN6QyxnREFBd0I7QUFDeEIsNERBQW9DO0FBRXBDLDJDQU9xQjtBQUNyQixzREFBNkI7QUFvRDdCOztHQUVHO0FBQ0gsTUFBYSxNQUFNO0lBQ2pCLGtCQUFrQjtJQUNWLHFCQUFxQixDQUE0QztJQUNqRSxNQUFNLENBQTRCO0lBQzFDLE1BQU0sQ0FBUztJQUNmLFVBQVUsQ0FBUztJQUNuQixTQUFTLENBQVk7SUFDckIsTUFBTSxDQUFVO0lBQ2hCLE9BQU8sQ0FBUztJQUNoQixPQUFPLENBQVU7SUFFakIsY0FBYztJQUNkLFlBQVkscUJBQWdFLEVBQUUsTUFBaUM7UUFDN0csSUFBSSxDQUFDLHFCQUFxQixHQUFHLHFCQUFxQixDQUFDO1FBQ25ELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLG9CQUFvQjtRQUNwQixJQUFJLENBQUMsTUFBTSxHQUFHLFNBQU0sRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDdkIsQ0FBQztJQUVELGdCQUFnQjtJQUNSLEtBQUssQ0FBQyxPQUFlO1FBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxJQUFJLENBQUMsVUFBVSxnQkFBZ0IsT0FBTyxFQUFFLENBQUMsQ0FB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RjtRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxlQUFlLENBQUMsT0FBc0I7UUFDcEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDdkMsSUFBSSxXQUFXLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQztZQUNqRCxJQUNFLFdBQVcsS0FBSyxlQUFlO2dCQUMvQixXQUFXLEtBQUssbUJBQW1CO2dCQUNuQyxXQUFXLEtBQUssS0FBSztnQkFDckIsV0FBVyxLQUFLLE1BQU07Z0JBQ3RCLFdBQVcsS0FBSyxNQUFNO2dCQUN0QixXQUFXLEtBQUssd0JBQXdCO2dCQUN4QyxXQUFXLEtBQUssWUFBWTtnQkFDNUIsV0FBVyxLQUFLLFNBQVMsRUFDekI7Z0JBQ0EsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pELE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ25CO1NBQ0Y7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQTVlRCx3QkE0ZUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgKiBhcyBmc3ggZnJvbSAnZnMtZXh0cmEnO1xyXG5pbXBvcnQgKiBhcyBtbSBmcm9tICdtdXNpYy1tZXRhZGF0YSc7XHJcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xyXG5pbXBvcnQgc2FuaXRpemUgZnJvbSAnc2FuaXRpemUtZmlsZW5hbWUnO1xyXG5pbXBvcnQgamltcCBmcm9tICdqaW1wJztcclxuaW1wb3J0IHNlZWRyYW5kb20gZnJvbSAnc2VlZHJhbmRvbSc7XHJcbmltcG9ydCBfX2JlYXRNYXBBcmdzIGZyb20gJy4vX19iZWF0TWFwQXJncyc7XHJcbmltcG9ydCB7XHJcbiAgY29udmVydE11c2ljRmlsZSxcclxuICBnZXRCZWF0RmVhdHVyZXMsXHJcbiAgZ2V0RXZlbnRzTGlzdCxcclxuICBnZXROb3Rlc0xpc3QsXHJcbiAgZ2V0T2JzdGFjbGVzTGlzdCxcclxuICBpc1B5dGhvblNlcnZlclJ1bm5pbmcsXHJcbn0gZnJvbSAnLi9weXRob25BcGknO1xyXG5pbXBvcnQgQWRtWmlwIGZyb20gJ2FkbS16aXAnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTb25nQXJncyB7XHJcbiAgd29ya2luZ0Rpcjogc3RyaW5nO1xyXG4gIGFsYnVtRGlyOiBzdHJpbmc7XHJcbiAgb3V0RGlyOiBzdHJpbmc7XHJcbiAgc29uZ19wYXRoOiBzdHJpbmc7XHJcbiAgc29uZ19uYW1lOiBzdHJpbmc7XHJcbiAgZGlmZmljdWx0eTogc3RyaW5nO1xyXG4gIG1vZGVsOiBzdHJpbmc7XHJcbiAgdmVyc2lvbjogbnVtYmVyO1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAgbGlnaHRzSW50ZW5zaXR5OiBudW1iZXI7XHJcbiAgemlwRmlsZXM6IG51bWJlcjtcclxuICBzZWVkOiBudW1iZXI7XHJcbiAgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFdmVudHMge1xyXG4gIF90aW1lOiBudW1iZXI7XHJcbiAgX3R5cGU6IG51bWJlcjtcclxuICBfdmFsdWU6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBOb3RlcyB7XHJcbiAgX3RpbWU6IG51bWJlcjtcclxuICBfbGluZUluZGV4OiBudW1iZXI7XHJcbiAgX2xpbmVMYXllcjogbnVtYmVyO1xyXG4gIF90eXBlOiBudW1iZXI7XHJcbiAgX2N1dERpcmVjdGlvbjogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE9ic3RhY2xlcyB7XHJcbiAgX3RpbWU6IG51bWJlcjtcclxuICBfbGluZUluZGV4OiBudW1iZXI7XHJcbiAgX3R5cGU6IG51bWJlcjtcclxuICBfZHVyYXRpb246IG51bWJlcjtcclxuICBfd2lkdGg6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmFja3Mge1xyXG4gIGJwbTogbnVtYmVyO1xyXG4gIGJlYXRfdGltZXM6IG51bWJlcltdO1xyXG4gIHk6IG51bWJlcltdO1xyXG4gIHNyOiBudW1iZXI7XHJcbiAgZWFzeTogeyBldmVudHNfbGlzdDogRXZlbnRzW107IG5vdGVzX2xpc3Q6IE5vdGVzW107IG9ic3RhY2xlc19saXN0OiBPYnN0YWNsZXNbXSB9O1xyXG4gIG5vcm1hbDogeyBldmVudHNfbGlzdDogRXZlbnRzW107IG5vdGVzX2xpc3Q6IE5vdGVzW107IG9ic3RhY2xlc19saXN0OiBPYnN0YWNsZXNbXSB9O1xyXG4gIGhhcmQ6IHsgZXZlbnRzX2xpc3Q6IEV2ZW50c1tdOyBub3Rlc19saXN0OiBOb3Rlc1tdOyBvYnN0YWNsZXNfbGlzdDogT2JzdGFjbGVzW10gfTtcclxuICBleHBlcnQ6IHsgZXZlbnRzX2xpc3Q6IEV2ZW50c1tdOyBub3Rlc19saXN0OiBOb3Rlc1tdOyBvYnN0YWNsZXNfbGlzdDogT2JzdGFjbGVzW10gfTtcclxuICBleHBlcnRwbHVzOiB7IGV2ZW50c19saXN0OiBFdmVudHNbXTsgbm90ZXNfbGlzdDogTm90ZXNbXTsgb2JzdGFjbGVzX2xpc3Q6IE9ic3RhY2xlc1tdIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgV29ya2VyYCBpcyBhIGNsYXNzIGZvciBjcmVhdGluZyBoaWRkZW4gcHJvY2Vzc2VzIHRoYXQgYXJlIHJlc3BvbnNpYmxlIGZvciBydW5uaW5nIG9wZXJhdGlvbnMuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgV29ya2VyIHtcclxuICAvLyBDbGFzcyB2YXJpYWJsZXNcclxuICBwcml2YXRlIF9hcHBlbmRNZXNzYWdlVGFza0xvZzogKG1lc3NhZ2U6IHN0cmluZywgZ3JvdXA/OiBzdHJpbmcpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBfZXJyb3I6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XHJcbiAgbG9nX2lkOiBzdHJpbmc7XHJcbiAgbG9nX2hlYWRlcjogc3RyaW5nO1xyXG4gIHNvbmdfYXJncz86IFNvbmdBcmdzO1xyXG4gIHRyYWNrcz86IFRyYWNrcztcclxuICB0ZW1wRGlyOiBzdHJpbmc7XHJcbiAgcnVubmluZzogYm9vbGVhbjtcclxuXHJcbiAgLy8gQ29uc3RydWN0b3JcclxuICBjb25zdHJ1Y3RvcihfYXBwZW5kTWVzc2FnZVRhc2tMb2c6IChtZXNzYWdlOiBzdHJpbmcsIGdyb3VwPzogc3RyaW5nKSA9PiB2b2lkLCBfZXJyb3I6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpIHtcclxuICAgIHRoaXMuX2FwcGVuZE1lc3NhZ2VUYXNrTG9nID0gX2FwcGVuZE1lc3NhZ2VUYXNrTG9nO1xyXG4gICAgdGhpcy5fZXJyb3IgPSBfZXJyb3I7XHJcbiAgICAvLyBjcmVhdGUgdGhlIHdvcmtlclxyXG4gICAgdGhpcy5sb2dfaWQgPSB1dWlkdjQoKTtcclxuICAgIHRoaXMubG9nX2hlYWRlciA9ICcnO1xyXG4gICAgdGhpcy50ZW1wRGlyID0gcGF0aC5qb2luKHByb2Nlc3MuZW52LkFQUERBVEEgPz8gcHJvY2Vzcy5jd2QoKSwgJ2JlYXQtbWFwLXN5bnRoZXNpemVyJywgJ3RlbXAnKTtcclxuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgLy8gQ2xhc3MgbWV0aG9kc1xyXG4gIHByaXZhdGUgZXJyb3IobWVzc2FnZTogc3RyaW5nKSB7XHJcbiAgICB0aGlzLl9lcnJvcihgLS0tLS0tLS0tXFxuJHt0aGlzLmxvZ19oZWFkZXJ9XFxuLS0tLS0tLS0tXFxuJHttZXNzYWdlfWApO1xyXG4gIH1cclxuICBwcml2YXRlIGFwcGVuZE1lc3NhZ2VUYXNrTG9nKG1lc3NhZ2U6IHN0cmluZywgdXNlSGVhZGVyID0gdHJ1ZSkge1xyXG4gICAgdGhpcy5fYXBwZW5kTWVzc2FnZVRhc2tMb2codXNlSGVhZGVyID8gYFxcdCR7dGhpcy5sb2dfaGVhZGVyfSB8ICR7bWVzc2FnZX0uLi5gIDogbWVzc2FnZSwgdGhpcy5sb2dfaWQpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2VuZXJhdGVCZWF0TWFwcyhkaXI6IHN0cmluZywgYXJnczogX19iZWF0TWFwQXJncyk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcclxuICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1N0YXJ0aW5nIGJlYXRtYXAgZ2VuZXJhdGlvbicsIGZhbHNlKTtcclxuICAgIGxldCBtZXRhZGF0YTogbW0uSUF1ZGlvTWV0YWRhdGEgPSBhd2FpdCBtbS5wYXJzZUZpbGUocGF0aC5ub3JtYWxpemUoZGlyKSk7XHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdNZXRhZGF0YSBMb2FkZWQnLCBmYWxzZSk7XHJcbiAgICBsZXQgdHJhY2tuYW1lOiBzdHJpbmcgPSBzYW5pdGl6ZShtZXRhZGF0YS5jb21tb24udGl0bGUgPz8gJycpO1xyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnU29uZyBUaXRsZSBGb3VuZCcsIGZhbHNlKTtcclxuICAgIGxldCBhcnRpc3RuYW1lOiBzdHJpbmcgPSBzYW5pdGl6ZShtZXRhZGF0YS5jb21tb24uYXJ0aXN0ID8/ICcnKTtcclxuICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0FydGlzdCBGb3VuZCcsIGZhbHNlKTtcclxuICAgIGNvbnN0IHNvbmdfbmFtZSA9IGAke3RyYWNrbmFtZX0gLSAke2FydGlzdG5hbWV9YDtcclxuICAgIHRoaXMubG9nX2hlYWRlciA9IHNvbmdfbmFtZTtcclxuICAgIGxldCBlbWJlZGRlZGFydDogbW0uSVBpY3R1cmUgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdDaGVja2luZyBpZiBiZWF0IG1hcCBhbHJlYWR5IGV4aXN0cycpO1xyXG5cclxuICAgIGxldCBiZWF0TWFwRXhpc3RzOiBib29sZWFuID0gZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKGFyZ3Mub3V0RGlyLCBgJHtzb25nX25hbWV9LnppcGApKTtcclxuXHJcbiAgICBpZiAoYmVhdE1hcEV4aXN0cykge1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdCZWF0IG1hcCBleGlzdHMsIHNraXBwaW5nIScpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnU2VhcmNoaW5nIGZvciBlbWJlZGRlZCBhcnQnKTtcclxuXHJcbiAgICAgIGlmIChtZXRhZGF0YS5jb21tb24ucGljdHVyZSkge1xyXG4gICAgICAgIGVtYmVkZGVkYXJ0ID0gdGhpcy5maW5kRW1iZWRkZWRBcnQobWV0YWRhdGEuY29tbW9uLnBpY3R1cmUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmc3guZW5zdXJlRGlyU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCBzb25nX25hbWUpKTtcclxuXHJcbiAgICAgIGlmIChlbWJlZGRlZGFydCkge1xyXG4gICAgICAgIGFyZ3MuYWxidW1EaXIgPSBhd2FpdCB0aGlzLmV4dHJhY3RFbWJlZGRlZEFydChzb25nX25hbWUsIGVtYmVkZGVkYXJ0KTtcclxuICAgICAgICBhcmdzLmFsYnVtRGlyID1cclxuICAgICAgICAgIGFyZ3MuYWxidW1EaXIgJiYgYXJncy5hbGJ1bURpciAhPT0gJ05PTkUnID8gYXJncy5hbGJ1bURpciA6IHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdjb3Zlci5qcGcnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnU2V0dGluZyBiZWF0IG1hcCBwYXJhbWV0ZXJzJyk7XHJcblxyXG4gICAgICBpZiAoYXJncy5lbnZpcm9ubWVudCA9PT0gJ1JBTkRPTScpIHtcclxuICAgICAgICBhcmdzLmVudmlyb25tZW50ID0gdGhpcy5nZXRSYW5kb21FbnZpcm9ubWVudCgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCF0aGlzLnJ1bm5pbmcpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuc29uZ19hcmdzID0ge1xyXG4gICAgICB3b3JraW5nRGlyOiBgJHt0aGlzLnRlbXBEaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX0vJHtzb25nX25hbWV9YCxcclxuICAgICAgYWxidW1EaXI6IGAke2FyZ3MuYWxidW1EaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX1gLFxyXG4gICAgICBvdXREaXI6IGAke2FyZ3Mub3V0RGlyLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyl9LyR7c29uZ19uYW1lfWAsXHJcbiAgICAgIHNvbmdfcGF0aDogYCR7ZGlyLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyl9YCxcclxuICAgICAgc29uZ19uYW1lOiBzb25nX25hbWUsXHJcbiAgICAgIGRpZmZpY3VsdHk6IGFyZ3MuZGlmZmljdWx0eSxcclxuICAgICAgbW9kZWw6IGFyZ3MubW9kZWwsXHJcbiAgICAgIHZlcnNpb246IGFyZ3MudmVyc2lvbiA/PyAyLFxyXG4gICAgICBlbnZpcm9ubWVudDogYXJncy5lbnZpcm9ubWVudCA/PyAnRGVmYXVsdEVudmlyb25tZW50JyxcclxuICAgICAgbGlnaHRzSW50ZW5zaXR5OiBhcmdzLmxpZ2h0c0ludGVuc2l0eSA/IDExLjUgLSBhcmdzLmxpZ2h0c0ludGVuc2l0eSA6IDIuNSxcclxuICAgICAgemlwRmlsZXM6IGFyZ3MuemlwRmlsZXMsXHJcbiAgICAgIHNlZWQ6IHNlZWRyYW5kb20oc29uZ19uYW1lLCB7IGVudHJvcHk6IHRydWUgfSkoKSxcclxuICAgICAgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IDIuNSxcclxuICAgIH07XHJcblxyXG4gICAgaWYgKCFmc3guZXhpc3RzU3luYyh0aGlzLnNvbmdfYXJncy5vdXREaXIpKSB7XHJcbiAgICAgIGZzeC5lbnN1cmVEaXJTeW5jKHRoaXMuc29uZ19hcmdzLm91dERpcik7XHJcbiAgICB9XHJcblxyXG4gICAgZm9yIChjb25zdCBkaWZmaWN1bHR5IG9mIFsnZWFzeScsICdub3JtYWwnLCAnaGFyZCcsICdleHBlcnQnLCAnZXhwZXJ0cGx1cyddKSB7XHJcbiAgICAgIGlmIChmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy5zb25nX2FyZ3Mud29ya2luZ0RpciwgYCR7ZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpfS5kYXRgKSkpIHtcclxuICAgICAgICBmc3gucmVtb3ZlU3luYyhwYXRoLmpvaW4odGhpcy5zb25nX2FyZ3Mud29ya2luZ0RpciwgYCR7ZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpfS5kYXRgKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy5zb25nX2FyZ3Mud29ya2luZ0RpciwgJ2luZm8uZGF0JykpKSB7XHJcbiAgICAgIGZzeC5yZW1vdmVTeW5jKHBhdGguam9pbih0aGlzLnNvbmdfYXJncy53b3JraW5nRGlyLCAnaW5mby5kYXQnKSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYmFzZUxpc3RzID0ge1xyXG4gICAgICBldmVudHNfbGlzdDogW10sXHJcbiAgICAgIG5vdGVzX2xpc3Q6IFtdLFxyXG4gICAgICBvYnN0YWNsZXNfbGlzdDogW10sXHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMudHJhY2tzID0ge1xyXG4gICAgICBicG06IDAsXHJcbiAgICAgIGJlYXRfdGltZXM6IFtdLFxyXG4gICAgICB5OiBbXSxcclxuICAgICAgc3I6IDAsXHJcbiAgICAgIGVhc3k6IHsgLi4uYmFzZUxpc3RzIH0sXHJcbiAgICAgIG5vcm1hbDogeyAuLi5iYXNlTGlzdHMgfSxcclxuICAgICAgaGFyZDogeyAuLi5iYXNlTGlzdHMgfSxcclxuICAgICAgZXhwZXJ0OiB7IC4uLmJhc2VMaXN0cyB9LFxyXG4gICAgICBleHBlcnRwbHVzOiB7IC4uLmJhc2VMaXN0cyB9LFxyXG4gICAgfTtcclxuXHJcbiAgICBsZXQgc29uZ3NfanNvbjogdW5rbm93bltdID0gZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKHRoaXMudGVtcERpci5ub3JtYWxpemUoKSwgJ3NvbmdzLmpzb24nKSlcclxuICAgICAgPyBKU09OLnBhcnNlKGZzeC5yZWFkRmlsZVN5bmMocGF0aC5qb2luKHRoaXMudGVtcERpci5ub3JtYWxpemUoKSwgJ3NvbmdzLmpzb24nKSkudG9TdHJpbmcoKSlcclxuICAgICAgOiBbXTtcclxuICAgIHNvbmdzX2pzb24ucHVzaCh0aGlzLnNvbmdfYXJncyk7XHJcbiAgICBmc3gud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCAnc29uZ3MuanNvbicpLCBKU09OLnN0cmluZ2lmeShzb25nc19qc29uLCBudWxsLCAyKSk7XHJcblxyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnR2VuZXJhdGluZyBiZWF0IG1hcCcpO1xyXG5cclxuICAgIGlmICghdGhpcy5ydW5uaW5nKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5zb25nX2FyZ3MgJiYgdGhpcy50cmFja3MgJiYgKGF3YWl0IGlzUHl0aG9uU2VydmVyUnVubmluZygpKSkge1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdMb2FkaW5nIFNvbmcnKTtcclxuICAgICAgY29uc3QgbW9kZWxQYXJhbXMgPSAoYXdhaXQgZ2V0QmVhdEZlYXR1cmVzKHRoaXMuc29uZ19hcmdzLnNvbmdfcGF0aCkpLmRhdGE7XHJcbiAgICAgIHRoaXMudHJhY2tzID0ge1xyXG4gICAgICAgIC4uLnRoaXMudHJhY2tzLFxyXG4gICAgICAgIC4uLm1vZGVsUGFyYW1zLFxyXG4gICAgICB9O1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdTb25nIGxvYWRlZCcpO1xyXG4gICAgICBpZiAoIXRoaXMucnVubmluZykge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBkaWZmaWN1bHRpZXMgPSAoXHJcbiAgICAgICAgdGhpcy5zb25nX2FyZ3MuZGlmZmljdWx0eSA9PT0gJ2FsbCdcclxuICAgICAgICAgID8gWydlYXN5JywgJ25vcm1hbCcsICdoYXJkJywgJ2V4cGVydCcsICdleHBlcnRwbHVzJ11cclxuICAgICAgICAgIDogW3RoaXMuc29uZ19hcmdzLmRpZmZpY3VsdHldXHJcbiAgICAgICkubWFwKGRpZmZpY3VsdHkgPT4gZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgbGV0IHByb2Nlc3NlZERpZmZpY3VsdGVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdNYXBwaW5nJyk7XHJcbiAgICAgIGZvciAoY29uc3QgZGlmZmljdWx0eSBvZiBkaWZmaWN1bHRpZXMgYXMgKCdlYXN5JyB8ICdub3JtYWwnIHwgJ2hhcmQnIHwgJ2V4cGVydCcgfCAnZXhwZXJ0cGx1cycpW10pIHtcclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKGBQcm9jZXNzaW5nICR7ZGlmZmljdWx0eX1gKTtcclxuICAgICAgICBpZiAoIXRoaXMucnVubmluZykge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgdGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCA9IChcclxuICAgICAgICAgICAgYXdhaXQgZ2V0Tm90ZXNMaXN0KHtcclxuICAgICAgICAgICAgICBtb2RlbDogdGhpcy5zb25nX2FyZ3MubW9kZWwsXHJcbiAgICAgICAgICAgICAgZGlmZmljdWx0eTogZGlmZmljdWx0eSxcclxuICAgICAgICAgICAgICBiZWF0X3RpbWVzOiB0aGlzLnRyYWNrcy5iZWF0X3RpbWVzLFxyXG4gICAgICAgICAgICAgIGJwbTogdGhpcy50cmFja3MuYnBtLFxyXG4gICAgICAgICAgICAgIHZlcnNpb246IHRoaXMuc29uZ19hcmdzLnZlcnNpb24sXHJcbiAgICAgICAgICAgICAgeTogdGhpcy50cmFja3MueSxcclxuICAgICAgICAgICAgICBzcjogdGhpcy50cmFja3Muc3IsXHJcbiAgICAgICAgICAgICAgdGVtcERpcjogdGhpcy50ZW1wRGlyLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgKS5kYXRhO1xyXG5cclxuICAgICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoIXRoaXMudHJhY2tzW2RpZmZpY3VsdHldLm5vdGVzX2xpc3QgfHwgIUFycmF5LmlzQXJyYXkodGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBOb3RlcyBsaXN0IHdhcyBpbnZhbGlkIVxcblxcdCR7SlNPTi5zdHJpbmdpZnkodGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCl9YCk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgdGhpcy50cmFja3NbZGlmZmljdWx0eV0uZXZlbnRzX2xpc3QgPSBnZXRFdmVudHNMaXN0KFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgbm90ZXNfbGlzdDogdGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCxcclxuICAgICAgICAgICAgICBicG06IHRoaXMudHJhY2tzLmJwbSxcclxuICAgICAgICAgICAgICBldmVudENvbG9yU3dhcE9mZnNldDogdGhpcy5zb25nX2FyZ3MuZXZlbnRDb2xvclN3YXBPZmZzZXQsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHRoaXMuZXJyb3JcclxuICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgdGhpcy50cmFja3NbZGlmZmljdWx0eV0ub2JzdGFjbGVzX2xpc3QgPSBnZXRPYnN0YWNsZXNMaXN0KHtcclxuICAgICAgICAgICAgbm90ZXNfbGlzdDogdGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCxcclxuICAgICAgICAgICAgYnBtOiB0aGlzLnRyYWNrcy5icG0sXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICBwcm9jZXNzZWREaWZmaWN1bHRlcy5wdXNoKGRpZmZpY3VsdHkpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgIHRoaXMuZXJyb3IoZSBhcyBhbnkpO1xyXG4gICAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZyhgRGlmZmljdWx0eSBwcm9jZXNzaW5nIGVycm9yLCAke2RpZmZpY3VsdHl9IHNraXBwZWQhYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coYFByb2Nlc3NpbmcgJHtkaWZmaWN1bHR5fSBkb25lIWApO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ01hcHBpbmcgZG9uZSEnKTtcclxuICAgICAgaWYgKHByb2Nlc3NlZERpZmZpY3VsdGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdXcml0aW5nIGZpbGVzIHRvIGRpc2snKTtcclxuICAgICAgICB0aGlzLndyaXRlSW5mb0ZpbGUocHJvY2Vzc2VkRGlmZmljdWx0ZXMpO1xyXG4gICAgICAgIHRoaXMud3JpdGVMZXZlbEZpbGUocHJvY2Vzc2VkRGlmZmljdWx0ZXMpO1xyXG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0NvbnZlcnRpbmcgbXVzaWMgZmlsZScpO1xyXG4gICAgICAgIGF3YWl0IGNvbnZlcnRNdXNpY0ZpbGUodGhpcy5zb25nX2FyZ3Muc29uZ19wYXRoLCB0aGlzLnNvbmdfYXJncy53b3JraW5nRGlyKTtcclxuICAgICAgICBpZiAoIXRoaXMucnVubmluZykge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdaaXBwaW5nIGZvbGRlcicpO1xyXG4gICAgICAgIHRoaXMuemlwRmlsZXMocHJvY2Vzc2VkRGlmZmljdWx0ZXMpO1xyXG4gICAgICAgIGlmICghdGhpcy5ydW5uaW5nKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coXHJcbiAgICAgICAgICBgJHt0aGlzLnNvbmdfYXJncy5zb25nX25hbWV9IHwgRmluaXNoZWQhIFxcblxcdExvb2sgZm9yICR7XHJcbiAgICAgICAgICAgIHRoaXMuc29uZ19hcmdzLnppcEZpbGVzID09PSAxID8gJ3ppcHBlZCBmb2xkZXInIDogJ2ZvbGRlcidcclxuICAgICAgICAgIH0gaW4gJHt0aGlzLnNvbmdfYXJncy5vdXREaXJ9LCAke1xyXG4gICAgICAgICAgICB0aGlzLnNvbmdfYXJncy56aXBGaWxlcyA9PT0gMSA/ICd1bnppcCB0aGUgZm9sZGVyLCAnIDogJydcclxuICAgICAgICAgIH1cXG5cXHRwbGFjZSBpbiB0aGUgJ0N1c3RvbU11c2ljJyBmb2xkZXIgaW4gQmVhdCBTYWJlcidzIGZpbGVzLmAsXHJcbiAgICAgICAgICBmYWxzZVxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5lcnJvcignU29uZyBwcm9jZXNzaW5nIGVycm9yIScpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLmVycm9yKCdQeXRob24gc2VydmVyIGlzIG5vdCBydW5uaW5nIScpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnR2VuZXJhdGVkIGJlYXQgbWFwIScpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICBzdG9wV29ya2VyKCkge1xyXG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBnZXRSYW5kb21FbnZpcm9ubWVudCgpIHtcclxuICAgIGNvbnN0IGVudmlyb25tZW50cyA9IFtcclxuICAgICAgJ0RlZmF1bHRFbnZpcm9ubWVudCcsXHJcbiAgICAgICdCaWdNaXJyb3JFbnZpcm9ubWVudCcsXHJcbiAgICAgICdPcmlnaW5zJyxcclxuICAgICAgJ05pY2VFbnZpcm9ubWVudCcsXHJcbiAgICAgICdUcmlhbmdsZUVudmlyb25tZW50JyxcclxuICAgICAgJ0tEQUVudmlyb25tZW50JyxcclxuICAgICAgJ0RyYWdvbnNFbnZpcm9ubWVudCcsXHJcbiAgICAgICdNb25zdGVyY2F0RW52aXJvbm1lbnQnLFxyXG4gICAgICAnQ3JhYlJhdmVFbnZpcm9ubWVudCcsXHJcbiAgICAgICdQYW5pY0Vudmlyb25tZW50JyxcclxuICAgICAgJ1JvY2tldEVudmlyb25tZW50JyxcclxuICAgICAgJ0dyZWVuRGF5RW52aXJvbm1lbnQnLFxyXG4gICAgICAnR3JlZW5EYXlHcmVuYWRlRW52aXJvbm1lbnQnLFxyXG4gICAgXTtcclxuICAgIHJldHVybiBlbnZpcm9ubWVudHNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZW52aXJvbm1lbnRzLmxlbmd0aCldO1xyXG4gIH1cclxuXHJcbiAgemlwRmlsZXMoZGlmZmljdWx0aWVzOiBzdHJpbmdbXSkge1xyXG4gICAgaWYgKCF0aGlzLnNvbmdfYXJncykge1xyXG4gICAgICB0aGlzLmVycm9yKCdTb25nIGFyZ3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHppcCBmaWxlcyEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHdvcmtpbmdEaXIgPSB0aGlzLnNvbmdfYXJncy53b3JraW5nRGlyO1xyXG4gICAgY29uc3Qgb3V0RGlyID0gdGhpcy5zb25nX2FyZ3Mub3V0RGlyO1xyXG4gICAgaWYgKCFmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4od29ya2luZ0RpciwgJ2NvdmVyLmpwZycpKSkge1xyXG4gICAgICBmc3guY29weUZpbGVTeW5jKFxyXG4gICAgICAgIGZzeC5leGlzdHNTeW5jKHRoaXMuc29uZ19hcmdzLmFsYnVtRGlyKSA/IHRoaXMuc29uZ19hcmdzLmFsYnVtRGlyIDogcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ2NvdmVyLmpwZycpLFxyXG4gICAgICAgIHBhdGguam9pbih3b3JraW5nRGlyLCAnY292ZXIuanBnJylcclxuICAgICAgKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGZpbGVzID0gW1xyXG4gICAgICBwYXRoLmpvaW4od29ya2luZ0RpciwgJ2luZm8uZGF0JyksXHJcbiAgICAgIHBhdGguam9pbih3b3JraW5nRGlyLCAnY292ZXIuanBnJyksXHJcbiAgICAgIHBhdGguam9pbih3b3JraW5nRGlyLCAnc29uZy5lZ2cnKSxcclxuICAgICAgLi4uZGlmZmljdWx0aWVzLm1hcChkaWZmaWN1bHR5ID0+IHBhdGguam9pbih3b3JraW5nRGlyLCBgJHtkaWZmaWN1bHR5fS5kYXRgKSksXHJcbiAgICBdO1xyXG4gICAgaWYgKHRoaXMuc29uZ19hcmdzLnppcEZpbGVzID09PSAxKSB7XHJcbiAgICAgIGNvbnN0IHppcCA9IG5ldyBBZG1aaXAoKTtcclxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XHJcbiAgICAgICAgemlwLmFkZExvY2FsRmlsZShmaWxlKTtcclxuICAgICAgICBmc3gudW5saW5rU3luYyhmaWxlKTtcclxuICAgICAgfVxyXG4gICAgICB6aXAud3JpdGVaaXAoXHJcbiAgICAgICAgcGF0aC5qb2luKFxyXG4gICAgICAgICAgdGhpcy5zb25nX2FyZ3Mub3V0RGlyLnN1YnN0cigwLCB0aGlzLnNvbmdfYXJncy5vdXREaXIubGFzdEluZGV4T2YoJy8nKSksXHJcbiAgICAgICAgICBgJHt0aGlzLnNvbmdfYXJncy5zb25nX25hbWV9LnppcGBcclxuICAgICAgICApXHJcbiAgICAgICk7XHJcbiAgICAgIGZzeC5ybWRpclN5bmMod29ya2luZ0Rpcik7XHJcbiAgICAgIGZzeC5ybWRpclN5bmModGhpcy5zb25nX2FyZ3Mub3V0RGlyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgIGZzeC5jb3B5RmlsZVN5bmMoZmlsZSwgcGF0aC5yZXNvbHZlKG91dERpciwgcGF0aC5iYXNlbmFtZShmaWxlKSkpO1xyXG4gICAgICAgIGZzeC51bmxpbmtTeW5jKGZpbGUpO1xyXG4gICAgICB9XHJcbiAgICAgIGZzeC5ybWRpclN5bmMod29ya2luZ0Rpcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB3cml0ZUxldmVsRmlsZShkaWZmaWN1bHRpZXM6IHN0cmluZ1tdKSB7XHJcbiAgICBpZiAoIXRoaXMuc29uZ19hcmdzKSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoJ1NvbmcgYXJncyB3YXMgdW5kZWZpbmVkLCBjb3VsZCBub3Qgd3JpdGUgbGV2ZWwgZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLnRyYWNrcykge1xyXG4gICAgICB0aGlzLmVycm9yKCdUcmFja3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHdyaXRlIGxldmVsIGZpbGUhJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IHdvcmtpbmdEaXIgPSB0aGlzLnNvbmdfYXJncy53b3JraW5nRGlyO1xyXG4gICAgY29uc3QgdHJhY2tzID0gdGhpcy50cmFja3M7XHJcbiAgICBmb3IgKGNvbnN0IGRpZmZpY3VsdHkgb2YgZGlmZmljdWx0aWVzKSB7XHJcbiAgICAgIGNvbnN0IGxldmVsID0ge1xyXG4gICAgICAgIF92ZXJzaW9uOiAnMi4wLjAnLFxyXG4gICAgICAgIF9jdXN0b21EYXRhOiB7XHJcbiAgICAgICAgICBfdGltZTogJycsIC8vIG5vdCBzdXJlIHdoYXQgdGltZSByZWZlcnMgdG9cclxuICAgICAgICAgIF9CUE1DaGFuZ2VzOiBbXSxcclxuICAgICAgICAgIF9ib29rbWFya3M6IFtdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgX2V2ZW50czogdHJhY2tzW2RpZmZpY3VsdHkudG9Mb3dlckNhc2UoKV1bJ2V2ZW50c19saXN0J10sXHJcbiAgICAgICAgX25vdGVzOiB0cmFja3NbZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpXVsnbm90ZXNfbGlzdCddLFxyXG4gICAgICAgIF9vYnN0YWNsZXM6IHRyYWNrc1tkaWZmaWN1bHR5LnRvTG93ZXJDYXNlKCldWydvYnN0YWNsZXNfbGlzdCddLFxyXG4gICAgICB9O1xyXG4gICAgICBmc3gud3JpdGVKU09OU3luYyhwYXRoLmpvaW4od29ya2luZ0RpciwgYCR7ZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpfS5kYXRgKSwgbGV2ZWwpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgd3JpdGVJbmZvRmlsZShkaWZmaWN1bHRpZXM/OiBzdHJpbmdbXSkge1xyXG4gICAgaWYgKCF0aGlzLnNvbmdfYXJncykge1xyXG4gICAgICB0aGlzLmVycm9yKCdTb25nIGFyZ3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHdyaXRlIGluZm8gZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLnRyYWNrcykge1xyXG4gICAgICB0aGlzLmVycm9yKCdUcmFja3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHdyaXRlIGluZm8gZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaW50ZXJmYWNlIEJlYXRNYXBJbmZvIHtcclxuICAgICAgX2RpZmZpY3VsdHk6IHN0cmluZztcclxuICAgICAgX2RpZmZpY3VsdHlSYW5rOiBudW1iZXI7XHJcbiAgICAgIF9iZWF0bWFwRmlsZW5hbWU6IHN0cmluZztcclxuICAgICAgX25vdGVKdW1wTW92ZW1lbnRTcGVlZDogbnVtYmVyO1xyXG4gICAgICBfbm90ZUp1bXBTdGFydEJlYXRPZmZzZXQ6IG51bWJlcjtcclxuICAgICAgX2N1c3RvbURhdGE6IHt9O1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheTogQmVhdE1hcEluZm9bXSA9IFtdO1xyXG5cclxuICAgIGNvbnN0IGdldEJlYXRtYXBJbmZvID0gKGRpZmZpY3VsdHk6IHN0cmluZywgcmFuazogbnVtYmVyLCBtb3ZlbWVudFNwZWVkOiBudW1iZXIpOiBCZWF0TWFwSW5mbyA9PiB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgX2RpZmZpY3VsdHk6IGRpZmZpY3VsdHksXHJcbiAgICAgICAgX2RpZmZpY3VsdHlSYW5rOiByYW5rLFxyXG4gICAgICAgIF9iZWF0bWFwRmlsZW5hbWU6IGAke2RpZmZpY3VsdHkudG9Mb3dlckNhc2UoKX0uZGF0YCxcclxuICAgICAgICBfbm90ZUp1bXBNb3ZlbWVudFNwZWVkOiBtb3ZlbWVudFNwZWVkLFxyXG4gICAgICAgIF9ub3RlSnVtcFN0YXJ0QmVhdE9mZnNldDogMCxcclxuICAgICAgICBfY3VzdG9tRGF0YToge30sXHJcbiAgICAgIH07XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGVhc3lCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdFYXN5JywgMSwgOCk7XHJcbiAgICBjb25zdCBub3JtYWxCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdOb3JtYWwnLCAzLCAxMCk7XHJcbiAgICBjb25zdCBoYXJkQmVhdG1hcEluZm8gPSBnZXRCZWF0bWFwSW5mbygnSGFyZCcsIDUsIDEyKTtcclxuICAgIGNvbnN0IGV4cGVydEJlYXRtYXBJbmZvID0gZ2V0QmVhdG1hcEluZm8oJ0V4cGVydCcsIDcsIDE0KTtcclxuICAgIGNvbnN0IGV4cGVydHBsdXNCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdFeHBlcnRQbHVzJywgOSwgMTYpO1xyXG5cclxuICAgIGNvbnN0IGJlYXRtYXBJbmZvID0ge1xyXG4gICAgICBlYXN5OiBlYXN5QmVhdG1hcEluZm8sXHJcbiAgICAgIG5vcm1hbDogbm9ybWFsQmVhdG1hcEluZm8sXHJcbiAgICAgIGhhcmQ6IGhhcmRCZWF0bWFwSW5mbyxcclxuICAgICAgZXhwZXJ0OiBleHBlcnRCZWF0bWFwSW5mbyxcclxuICAgICAgZXhwZXJ0cGx1czogZXhwZXJ0cGx1c0JlYXRtYXBJbmZvLFxyXG4gICAgfTtcclxuXHJcbiAgICBzd2l0Y2ggKHRoaXMuc29uZ19hcmdzLmRpZmZpY3VsdHkudG9Mb3dlckNhc2UoKSkge1xyXG4gICAgICBjYXNlICdlYXN5JzpcclxuICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtlYXN5QmVhdG1hcEluZm9dO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdub3JtYWwnOlxyXG4gICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW25vcm1hbEJlYXRtYXBJbmZvXTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnaGFyZCc6XHJcbiAgICAgICAgZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXkgPSBbaGFyZEJlYXRtYXBJbmZvXTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnZXhwZXJ0JzpcclxuICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtleHBlcnRCZWF0bWFwSW5mb107XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgJ2V4cGVydHBsdXMnOlxyXG4gICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW2V4cGVydHBsdXNCZWF0bWFwSW5mb107XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgaWYgKGRpZmZpY3VsdGllcykge1xyXG4gICAgICAgICAgZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXkgPSBkaWZmaWN1bHRpZXMubWFwKGRpZmZLZXkgPT4gYmVhdG1hcEluZm9bZGlmZktleV0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtcclxuICAgICAgICAgICAgZWFzeUJlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgICBub3JtYWxCZWF0bWFwSW5mbyxcclxuICAgICAgICAgICAgaGFyZEJlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgICBleHBlcnRCZWF0bWFwSW5mbyxcclxuICAgICAgICAgICAgZXhwZXJ0cGx1c0JlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgX2FydGlzdCA9IHRoaXMuc29uZ19hcmdzLnNvbmdfbmFtZS5zcGxpdCgnIC0gJylbdGhpcy5zb25nX2FyZ3Muc29uZ19uYW1lLnNwbGl0KCcgLSAnKS5sZW5ndGggLSAxXTtcclxuICAgIGNvbnN0IGluZm8gPSB7XHJcbiAgICAgIF92ZXJzaW9uOiAnMi4wLjAnLFxyXG4gICAgICBfc29uZ05hbWU6IHRoaXMuc29uZ19hcmdzLnNvbmdfbmFtZSxcclxuICAgICAgX3NvbmdTdWJOYW1lOiAnJyxcclxuICAgICAgX3NvbmdBdXRob3JOYW1lOiBfYXJ0aXN0LFxyXG4gICAgICBfbGV2ZWxBdXRob3JOYW1lOiAnQmVhdE1hcFN5bnRoJyxcclxuICAgICAgX2JlYXRzUGVyTWludXRlOiBNYXRoLmZsb29yKHRoaXMudHJhY2tzLmJwbSksXHJcbiAgICAgIF9zb25nVGltZU9mZnNldDogMCxcclxuICAgICAgX3NodWZmbGU6IDAsXHJcbiAgICAgIF9zaHVmZmxlUGVyaW9kOiAwLFxyXG4gICAgICBfcHJldmlld1N0YXJ0VGltZTogMTAsXHJcbiAgICAgIF9wcmV2aWV3RHVyYXRpb246IDMwLFxyXG4gICAgICBfc29uZ0ZpbGVuYW1lOiAnc29uZy5lZ2cnLFxyXG4gICAgICBfY292ZXJJbWFnZUZpbGVuYW1lOiAnY292ZXIuanBnJyxcclxuICAgICAgX2Vudmlyb25tZW50TmFtZTogdGhpcy5zb25nX2FyZ3MuZW52aXJvbm1lbnQsXHJcbiAgICAgIF9jdXN0b21EYXRhOiB7fSxcclxuICAgICAgX2RpZmZpY3VsdHlCZWF0bWFwU2V0czogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIF9iZWF0bWFwQ2hhcmFjdGVyaXN0aWNOYW1lOiAnU3RhbmRhcmQnLFxyXG4gICAgICAgICAgX2RpZmZpY3VsdHlCZWF0bWFwczogZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH07XHJcblxyXG4gICAgZnN4LndyaXRlSlNPTlN5bmMocGF0aC5qb2luKHRoaXMuc29uZ19hcmdzLndvcmtpbmdEaXIsICdpbmZvLmRhdCcpLCBpbmZvKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGV4dHJhY3RFbWJlZGRlZEFydChzb25nX25hbWU6IHN0cmluZywgZW1iZWRkZWRhcnQ6IG1tLklQaWN0dXJlKSB7XHJcbiAgICBpZiAoZW1iZWRkZWRhcnQuZGF0YS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCBwcm9jZXNzaW5nIScpO1xyXG4gICAgICBsZXQgY29udmVydGVkSW1hZ2U6IGFueTtcclxuICAgICAgbGV0IG5ld0J1ZmZlcjogQnVmZmVyO1xyXG4gICAgICBjb25zdCBpbWdEaXIgPSBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCBzb25nX25hbWUsICdjb3Zlci5qcGcnKTtcclxuICAgICAgc3dpdGNoIChlbWJlZGRlZGFydC5mb3JtYXQudG9Mb3dlckNhc2UoKSkge1xyXG4gICAgICAgIGNhc2UgJ2ltYWdlL2JtcCc6XHJcbiAgICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdFbWJlZGRlZCBhcnQgd3JpdGluZyEnKTtcclxuICAgICAgICAgIGNvbnZlcnRlZEltYWdlID0gYXdhaXQgamltcC5yZWFkKGVtYmVkZGVkYXJ0LmRhdGEpO1xyXG4gICAgICAgICAgbmV3QnVmZmVyID0gY29udmVydGVkSW1hZ2UuZ2V0QnVmZmVyQXN5bmMoJ2ltYWdlL2pwZWcnKTtcclxuICAgICAgICAgIGZzeC53cml0ZUZpbGVTeW5jKGltZ0RpciwgbmV3QnVmZmVyKTtcclxuICAgICAgICAgIHJldHVybiBpbWdEaXI7XHJcbiAgICAgICAgY2FzZSAnaW1hZ2UvZ2lmJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgICBjYXNlICdpbWFnZS9qcGVnJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBlbWJlZGRlZGFydC5kYXRhKTtcclxuICAgICAgICAgIHJldHVybiBpbWdEaXI7XHJcbiAgICAgICAgY2FzZSAnaW1hZ2UvcG5nJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgICBjYXNlICdpbWFnZS90aWZmJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuICdOT05FJztcclxuICB9XHJcblxyXG4gIGZpbmRFbWJlZGRlZEFydChwaWN0dXJlOiBtbS5JUGljdHVyZVtdKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBpY3R1cmUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgbGV0IGN1cnJlbnRUeXBlID0gcGljdHVyZVtpXS50eXBlPy50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdjb3ZlciAoZnJvbnQpJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAnY292ZXIgYXJ0IChmcm9udCknIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdwaWMnIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdhcGljJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAnY292cicgfHxcclxuICAgICAgICBjdXJyZW50VHlwZSA9PT0gJ21ldGFkYXRhX2Jsb2NrX3BpY3R1cmUnIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICd3bS9waWN0dXJlJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAncGljdHVyZSdcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IGZvdW5kIScpO1xyXG4gICAgICAgIHJldHVybiBwaWN0dXJlW2ldO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuIl19