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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const mm = __importStar(require("music-metadata"));
const fsx = __importStar(require("fs-extra"));
const compare_versions_1 = __importDefault(require("compare-versions"));
const os_1 = require("os");
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
    _log;
    _error;
    appPath;
    scriptsInternalPath;
    tempDir;
    settings;
    activeShell;
    log_id;
    log_header;
    song_args;
    tracks;
    // Constructor
    constructor(_appendMessageTaskLog, _log, _error) {
        this._appendMessageTaskLog = _appendMessageTaskLog;
        this._log = _log;
        this._error = _error;
        // create the worker
        this.appPath = electron_1.app.getAppPath();
        this.scriptsInternalPath = path.join(this.appPath, 'build/scripts');
        this.tempDir = path.join(process.env.APPDATA ?? process.cwd(), 'beat-map-synthesizer', 'temp');
        this.log_id = uuid_1.v4();
        this.log_header = '';
        if (fsx.existsSync(path.join(this.tempDir, 'settings.json'))) {
            this.settings = JSON.parse(fsx.readFileSync(path.join(this.tempDir, 'settings.json'), 'utf8'));
        }
        else {
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
            };
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
            this.settings.version = electron_1.app.getVersion();
            fsx.writeFileSync(path.join(this.tempDir, 'settings.json'), JSON.stringify(this.settings, null, 2));
        }
    }
    // Class methods
    log(message) {
        this._log(message);
    }
    error(message) {
        this._error(message);
    }
    appendMessageTaskLog(message, useHeader = true) {
        this._appendMessageTaskLog(useHeader ? `\t${this.log_header} | ${message}...` : message, this.log_id);
    }
    isOutOfDate() {
        return compare_versions_1.default.compare(this.settings.version, electron_1.app.getVersion(), '<');
    }
    copyScriptFile() {
        this.log('initFiles - Updating script file.');
        fsx.copySync(path.join(this.scriptsInternalPath, 'beatMapSynthServer.py'), path.join(this.tempDir, 'beatMapSynthServer.py'));
        this.log('initFiles - Script file updated.');
    }
    updateModelFiles() {
        this.log('initFiles - Updating model files.');
        const files = [
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
            return !!child_process_1.execSync('python --version').toString();
        }
        catch (error) {
            return false;
        }
    }
    windowsInitFiles() {
        if (!this.settings.pythonExists) {
            if (!this.settings.hasRequiredExtensions) {
                if (!fsx.existsSync(path.join(this.tempDir, 'WinPython.exe'))) {
                    fsx.copySync(path.join(this.scriptsInternalPath, 'WinPython.exe'), path.join(this.tempDir, 'WinPython.exe'));
                }
                if (!fsx.existsSync(path.join(this.tempDir, 'VC_redist.x64.exe'))) {
                    fsx.copySync(path.join(this.scriptsInternalPath, 'VC_redist.x64.exe'), path.join(this.tempDir, 'VC_redist.x64.exe'));
                }
                this.log('initFiles - Installing VC Redist 2017.');
                try {
                    child_process_1.execFileSync(path.join(this.tempDir, 'VC_redist.x64.exe'), ['/install /passive /norestart'], {
                        windowsHide: true,
                    });
                }
                catch (error) {
                    this.error(error);
                }
            }
            if (!fsx.pathExistsSync(path.join(this.tempDir, 'WPy64'))) {
                this.log('initFiles - Installing WinPython.');
                try {
                    child_process_1.execFileSync(path.join(this.tempDir, 'WinPython.exe'), ['-o', `"${path.join(this.tempDir, 'WPy64').normalize().replace(/\\/gi, '/')}"`, '-y'], {
                        windowsHide: true,
                    });
                }
                catch (error) {
                    this.error(error);
                }
            }
        }
    }
    installPythonModules() {
        this.log('initFiles - Installing Python packages.');
        try {
            let data = '';
            if (!this.settings.pythonCmd.includes('python.exe')) {
                data = child_process_1.execSync(`${this.settings.pythonCmd} -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`, {
                    windowsHide: true,
                }).toString();
            }
            else {
                data = child_process_1.execSync(`cd ${path.dirname(this.settings.pythonCmd)} && python.exe -m pip install audioread librosa numpy pandas scipy scikit-learn soundfile pydub markovify Flask gevent`, {
                    windowsHide: true,
                }).toString();
            }
            this.log(data);
        }
        catch (error) {
            this.error(error);
        }
        this.log(`initFiles - Installed Python packages.`);
    }
    async generateBeatMaps(dir, args) {
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
        let beatMapExists = fsx.existsSync(path.join(args.outDir, song_name, 'info.dat')) ||
            fsx.existsSync(path.join(args.outDir, `${song_name}.zip`));
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
            seed: seedrandom_1.default(song_name, { entropy: true })(),
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
        let songs_json = fsx.existsSync(path.join(this.tempDir.normalize(), 'songs.json'))
            ? JSON.parse(fsx.readFileSync(path.join(this.tempDir.normalize(), 'songs.json')).toString())
            : [];
        songs_json.push(this.song_args);
        fsx.writeFileSync(path.join(this.tempDir.normalize(), 'songs.json'), JSON.stringify(songs_json, null, 2));
        this.appendMessageTaskLog('Generating beat map');
        await this.runPythonShell();
        if (this.song_args && this.tracks && (await pythonApi_1.isPythonServerRunning())) {
            this.appendMessageTaskLog('Loading Song');
            const modelParams = (await pythonApi_1.getBeatFeatures(this.song_args.song_path)).data;
            this.tracks = {
                ...this.tracks,
                ...modelParams,
            };
            this.appendMessageTaskLog('Song loaded');
            const difficulties = (this.song_args.difficulty === 'all'
                ? ['easy', 'normal', 'hard', 'expert', 'expertplus']
                : [this.song_args.difficulty]).map(difficulty => difficulty.toLowerCase());
            let processedDifficultes = [];
            this.appendMessageTaskLog('Mapping');
            for (const difficulty of difficulties) {
                this.appendMessageTaskLog(`Processing ${difficulty}`);
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
                    if (!this.tracks[difficulty].notes_list || !Array.isArray(this.tracks[difficulty].notes_list)) {
                        throw new Error(`Notes list was invalid!\n\t${JSON.stringify(this.tracks[difficulty].notes_list)}`);
                    }
                    this.tracks[difficulty].events_list = pythonApi_1.getEventsList({
                        notes_list: this.tracks[difficulty].notes_list,
                        bpm: this.tracks.bpm,
                        eventColorSwapOffset: this.song_args.eventColorSwapOffset,
                    });
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
                this.appendMessageTaskLog('Converting music file');
                await pythonApi_1.convertMusicFile(this.song_args.song_path, this.song_args.workingDir);
                this.appendMessageTaskLog('Zipping folder');
                this.zipFiles(processedDifficultes);
                this.appendMessageTaskLog(`${this.song_args.song_name} | Finished! \n\tLook for ${this.song_args.zipFiles === 1 ? 'zipped folder' : 'folder'} in ${this.song_args.outDir}, ${this.song_args.zipFiles === 1 ? 'unzip the folder, ' : ''}\n\tplace in the 'CustomMusic' folder in Beat Saber's files.`, false);
            }
            else {
                this.error('Song processing error!');
            }
            await pythonApi_1.closePythonServer();
        }
        else {
            this.error('Python server is not running!');
        }
        this.appendMessageTaskLog('Generated beat map!');
        return true;
    }
    runPythonShell() {
        const self = this;
        return new Promise((resolve, reject) => {
            if (!this.song_args || !this.tracks) {
                reject(false);
            }
            let _remaining;
            const failedToStartTimeout = setTimeout(() => {
                this.log('Python process failed to spawn -- timed out!');
                reject(false);
            }, 30000);
            function parseOut(data) {
                data && self._log(data);
            }
            function receiveInternal(data, emitType) {
                let parts = ('' + data).split(os_1.EOL);
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
            function receiveStdout(data) {
                return receiveInternal(data, 'stdout');
            }
            function receiveStderr(data) {
                return receiveInternal(data, 'stderr');
            }
            if (!this.settings.pythonCmd.includes('python.exe')) {
                this.activeShell = child_process_1.exec(`${this.settings.pythonCmd} "${path.normalize(path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py'))}"`, {
                    timeout: 300000,
                    windowsHide: true,
                });
            }
            else {
                this.activeShell = child_process_1.exec(`cd ${path.dirname(this.settings.pythonCmd)} && python.exe "${path.normalize(path.join(this.tempDir.normalize().replace(/\\/gi, '/'), '/beatMapSynthServer.py'))}"`, {
                    timeout: 300000,
                    windowsHide: true,
                });
            }
            this.activeShell.on('close', code => {
                this.log('Finished');
                if (!this.song_args) {
                    this.error('Song args was undefined! Error while closing shell!');
                    return;
                }
                if (code === 0) {
                    this.appendMessageTaskLog('Finished successfully!');
                }
                else {
                    this.appendMessageTaskLog(`Failed with exit code: ${code}`);
                }
            });
            this.activeShell.stdout?.setEncoding('utf8');
            this.activeShell.stderr?.setEncoding('utf8');
            this.activeShell.stdout?.on('data', buffer => receiveStdout(buffer));
            this.activeShell.stderr?.on('data', buffer => receiveStderr(buffer));
            this.activeShell.once('spawn', () => {
                this.log('Python process spawned successfully!');
                clearTimeout(failedToStartTimeout);
                resolve(true);
            });
            this.activeShell.once('error', () => {
                this.log('Python process failed to spawn!');
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
            pythonApi_1.closePythonServer().finally(() => {
                if (this.activeShell?.connected && !this.activeShell.kill('SIGTERM')) {
                    // Kills a PID and all child process
                    child_process_1.exec(`taskkill /f /t /pid ${this.activeShell.pid}`, (err, stdout) => {
                        console.log('stdout', stdout);
                        console.log('stderr', err);
                    });
                }
                delete this.activeShell;
            });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3dvcmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsdUNBQStCO0FBQy9CLDJDQUE2QjtBQUM3QixpREFBMkU7QUFDM0UsbURBQXFDO0FBQ3JDLDhDQUFnQztBQUNoQyx3RUFBK0M7QUFDL0MsMkJBQW9DO0FBQ3BDLCtCQUFvQztBQUNwQywwRUFBeUM7QUFDekMsZ0RBQXdCO0FBQ3hCLDREQUFvQztBQUVwQywyQ0FRcUI7QUFDckIsc0RBQTZCO0FBb0Q3Qjs7R0FFRztBQUNILE1BQWEsTUFBTTtJQUNqQixrQkFBa0I7SUFDVixxQkFBcUIsQ0FBNEM7SUFDakUsSUFBSSxDQUE0QjtJQUNoQyxNQUFNLENBQTRCO0lBQzFDLE9BQU8sQ0FBUztJQUNoQixtQkFBbUIsQ0FBUztJQUM1QixPQUFPLENBQVM7SUFDaEIsUUFBUSxDQUFnSjtJQUN4SixXQUFXLENBQWdCO0lBQzNCLE1BQU0sQ0FBUztJQUNmLFVBQVUsQ0FBUztJQUNuQixTQUFTLENBQVk7SUFDckIsTUFBTSxDQUFVO0lBRWhCLGNBQWM7SUFDZCxZQUNFLHFCQUFnRSxFQUNoRSxJQUErQixFQUMvQixNQUFpQztRQUVqQyxJQUFJLENBQUMscUJBQXFCLEdBQUcscUJBQXFCLENBQUM7UUFDbkQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxPQUFPLEdBQUcsY0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8s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QixDQUFDLENBQUM7Z0JBQ2pELE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ25CO1NBQ0Y7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQTN1QkQsd0JBMnVCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGFwcCB9IGZyb20gJ2VsZWN0cm9uJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBleGVjLCBleGVjRmlsZVN5bmMsIGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XHJcbmltcG9ydCAqIGFzIG1tIGZyb20gJ211c2ljLW1ldGFkYXRhJztcclxuaW1wb3J0ICogYXMgZnN4IGZyb20gJ2ZzLWV4dHJhJztcclxuaW1wb3J0IGNvbXBhcmVWZXJzaW9ucyBmcm9tICdjb21wYXJlLXZlcnNpb25zJztcclxuaW1wb3J0IHsgRU9MIGFzIG5ld2xpbmUgfSBmcm9tICdvcyc7XHJcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xyXG5pbXBvcnQgc2FuaXRpemUgZnJvbSAnc2FuaXRpemUtZmlsZW5hbWUnO1xyXG5pbXBvcnQgamltcCBmcm9tICdqaW1wJztcclxuaW1wb3J0IHNlZWRyYW5kb20gZnJvbSAnc2VlZHJhbmRvbSc7XHJcbmltcG9ydCBfX2JlYXRNYXBBcmdzIGZyb20gJy4vX19iZWF0TWFwQXJncyc7XHJcbmltcG9ydCB7XHJcbiAgY2xvc2VQeXRob25TZXJ2ZXIsXHJcbiAgY29udmVydE11c2ljRmlsZSxcclxuICBnZXRCZWF0RmVhdHVyZXMsXHJcbiAgZ2V0RXZlbnRzTGlzdCxcclxuICBnZXROb3Rlc0xpc3QsXHJcbiAgZ2V0T2JzdGFjbGVzTGlzdCxcclxuICBpc1B5dGhvblNlcnZlclJ1bm5pbmcsXHJcbn0gZnJvbSAnLi9weXRob25BcGknO1xyXG5pbXBvcnQgQWRtWmlwIGZyb20gJ2FkbS16aXAnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTb25nQXJncyB7XHJcbiAgd29ya2luZ0Rpcjogc3RyaW5nO1xyXG4gIGFsYnVtRGlyOiBzdHJpbmc7XHJcbiAgb3V0RGlyOiBzdHJpbmc7XHJcbiAgc29uZ19wYXRoOiBzdHJpbmc7XHJcbiAgc29uZ19uYW1lOiBzdHJpbmc7XHJcbiAgZGlmZmljdWx0eTogc3RyaW5nO1xyXG4gIG1vZGVsOiBzdHJpbmc7XHJcbiAgdmVyc2lvbjogbnVtYmVyO1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAgbGlnaHRzSW50ZW5zaXR5OiBudW1iZXI7XHJcbiAgemlwRmlsZXM6IG51bWJlcjtcclxuICBzZWVkOiBudW1iZXI7XHJcbiAgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFdmVudHMge1xyXG4gIF90aW1lOiBudW1iZXI7XHJcbiAgX3R5cGU6IG51bWJlcjtcclxuICBfdmFsdWU6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBOb3RlcyB7XHJcbiAgX3RpbWU6IG51bWJlcjtcclxuICBfbGluZUluZGV4OiBudW1iZXI7XHJcbiAgX2xpbmVMYXllcjogbnVtYmVyO1xyXG4gIF90eXBlOiBudW1iZXI7XHJcbiAgX2N1dERpcmVjdGlvbjogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE9ic3RhY2xlcyB7XHJcbiAgX3RpbWU6IG51bWJlcjtcclxuICBfbGluZUluZGV4OiBudW1iZXI7XHJcbiAgX3R5cGU6IG51bWJlcjtcclxuICBfZHVyYXRpb246IG51bWJlcjtcclxuICBfd2lkdGg6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmFja3Mge1xyXG4gIGJwbTogbnVtYmVyO1xyXG4gIGJlYXRfdGltZXM6IG51bWJlcltdO1xyXG4gIHk6IG51bWJlcltdO1xyXG4gIHNyOiBudW1iZXI7XHJcbiAgZWFzeTogeyBldmVudHNfbGlzdDogRXZlbnRzW107IG5vdGVzX2xpc3Q6IE5vdGVzW107IG9ic3RhY2xlc19saXN0OiBPYnN0YWNsZXNbXSB9O1xyXG4gIG5vcm1hbDogeyBldmVudHNfbGlzdDogRXZlbnRzW107IG5vdGVzX2xpc3Q6IE5vdGVzW107IG9ic3RhY2xlc19saXN0OiBPYnN0YWNsZXNbXSB9O1xyXG4gIGhhcmQ6IHsgZXZlbnRzX2xpc3Q6IEV2ZW50c1tdOyBub3Rlc19saXN0OiBOb3Rlc1tdOyBvYnN0YWNsZXNfbGlzdDogT2JzdGFjbGVzW10gfTtcclxuICBleHBlcnQ6IHsgZXZlbnRzX2xpc3Q6IEV2ZW50c1tdOyBub3Rlc19saXN0OiBOb3Rlc1tdOyBvYnN0YWNsZXNfbGlzdDogT2JzdGFjbGVzW10gfTtcclxuICBleHBlcnRwbHVzOiB7IGV2ZW50c19saXN0OiBFdmVudHNbXTsgbm90ZXNfbGlzdDogTm90ZXNbXTsgb2JzdGFjbGVzX2xpc3Q6IE9ic3RhY2xlc1tdIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgV29ya2VyYCBpcyBhIGNsYXNzIGZvciBjcmVhdGluZyBoaWRkZW4gcHJvY2Vzc2VzIHRoYXQgYXJlIHJlc3BvbnNpYmxlIGZvciBydW5uaW5nIG9wZXJhdGlvbnMuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgV29ya2VyIHtcclxuICAvLyBDbGFzcyB2YXJpYWJsZXNcclxuICBwcml2YXRlIF9hcHBlbmRNZXNzYWdlVGFza0xvZzogKG1lc3NhZ2U6IHN0cmluZywgZ3JvdXA/OiBzdHJpbmcpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBfbG9nOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkO1xyXG4gIHByaXZhdGUgX2Vycm9yOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkO1xyXG4gIGFwcFBhdGg6IHN0cmluZztcclxuICBzY3JpcHRzSW50ZXJuYWxQYXRoOiBzdHJpbmc7XHJcbiAgdGVtcERpcjogc3RyaW5nO1xyXG4gIHNldHRpbmdzOiB7IHB5dGhvbkNtZDogc3RyaW5nOyBweXRob25FeGlzdHM6IGJvb2xlYW47IG1vZHVsZXNJbnN0YWxsZWQ6IGJvb2xlYW47IGlzV2luZG93czogYm9vbGVhbjsgaGFzUmVxdWlyZWRFeHRlbnNpb25zOiBib29sZWFuLCB2ZXJzaW9uOiBzdHJpbmc7IH07XHJcbiAgYWN0aXZlU2hlbGw/OiBDaGlsZFByb2Nlc3M7XHJcbiAgbG9nX2lkOiBzdHJpbmc7XHJcbiAgbG9nX2hlYWRlcjogc3RyaW5nO1xyXG4gIHNvbmdfYXJncz86IFNvbmdBcmdzO1xyXG4gIHRyYWNrcz86IFRyYWNrcztcclxuXHJcbiAgLy8gQ29uc3RydWN0b3JcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIF9hcHBlbmRNZXNzYWdlVGFza0xvZzogKG1lc3NhZ2U6IHN0cmluZywgZ3JvdXA/OiBzdHJpbmcpID0+IHZvaWQsXHJcbiAgICBfbG9nOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkLFxyXG4gICAgX2Vycm9yOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkXHJcbiAgKSB7XHJcbiAgICB0aGlzLl9hcHBlbmRNZXNzYWdlVGFza0xvZyA9IF9hcHBlbmRNZXNzYWdlVGFza0xvZztcclxuICAgIHRoaXMuX2xvZyA9IF9sb2c7XHJcbiAgICB0aGlzLl9lcnJvciA9IF9lcnJvcjtcclxuICAgIC8vIGNyZWF0ZSB0aGUgd29ya2VyXHJcbiAgICB0aGlzLmFwcFBhdGggPSBhcHAuZ2V0QXBwUGF0aCgpO1xyXG4gICAgdGhpcy5zY3JpcHRzSW50ZXJuYWxQYXRoID0gcGF0aC5qb2luKHRoaXMuYXBwUGF0aCwgJ2J1aWxkL3NjcmlwdHMnKTtcclxuICAgIHRoaXMudGVtcERpciA9IHBhdGguam9pbihwcm9jZXNzLmVudi5BUFBEQVRBID8/IHByb2Nlc3MuY3dkKCksICdiZWF0LW1hcC1zeW50aGVzaXplcicsICd0ZW1wJyk7XHJcbiAgICB0aGlzLmxvZ19pZCA9IHV1aWR2NCgpO1xyXG4gICAgdGhpcy5sb2dfaGVhZGVyID0gJyc7XHJcbiAgICBpZiAoZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ3NldHRpbmdzLmpzb24nKSkpIHtcclxuICAgICAgdGhpcy5zZXR0aW5ncyA9IEpTT04ucGFyc2UoZnN4LnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnc2V0dGluZ3MuanNvbicpLCAndXRmOCcpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuc2V0dGluZ3MgPSB7XHJcbiAgICAgICAgcHl0aG9uQ21kOiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXHJcbiAgICAgICAgICA/IHRoaXMucHl0aG9uRXhpc3RzKClcclxuICAgICAgICAgICAgPyAncHl0aG9uJ1xyXG4gICAgICAgICAgICA6IHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdXUHk2NCcsICdweXRob24tMycsICdweXRob24uZXhlJylcclxuICAgICAgICAgIDogJ3B5dGhvbjMnLFxyXG4gICAgICAgIHB5dGhvbkV4aXN0czogcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJ1xyXG4gICAgICAgICAgPyB0aGlzLnB5dGhvbkV4aXN0cygpXHJcbiAgICAgICAgICA6IHRydWUsXHJcbiAgICAgICAgbW9kdWxlc0luc3RhbGxlZDogZmFsc2UsXHJcbiAgICAgICAgaXNXaW5kb3dzOiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInLFxyXG4gICAgICAgIGhhc1JlcXVpcmVkRXh0ZW5zaW9uczogcHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJyxcclxuICAgICAgICB2ZXJzaW9uOiAnMC4wLjAnLFxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5jb3B5U2NyaXB0RmlsZSgpO1xyXG4gICAgaWYgKHRoaXMuaXNPdXRPZkRhdGUoKSkge1xyXG4gICAgICB0aGlzLnVwZGF0ZU1vZGVsRmlsZXMoKTtcclxuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuaXNXaW5kb3dzKSB7XHJcbiAgICAgICAgdGhpcy53aW5kb3dzSW5pdEZpbGVzKCk7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncy5oYXNSZXF1aXJlZEV4dGVuc2lvbnMgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MucHl0aG9uRXhpc3RzID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoIXRoaXMuc2V0dGluZ3MubW9kdWxlc0luc3RhbGxlZCkge1xyXG4gICAgICAgIHRoaXMuaW5zdGFsbFB5dGhvbk1vZHVsZXMoKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLm1vZHVsZXNJbnN0YWxsZWQgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuc2V0dGluZ3MudmVyc2lvbiA9IGFwcC5nZXRWZXJzaW9uKCk7XHJcbiAgICAgIGZzeC53cml0ZUZpbGVTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdzZXR0aW5ncy5qc29uJyksIEpTT04uc3RyaW5naWZ5KHRoaXMuc2V0dGluZ3MsIG51bGwsIDIpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIENsYXNzIG1ldGhvZHNcclxuICBwcml2YXRlIGxvZyhtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgIHRoaXMuX2xvZyhtZXNzYWdlKTtcclxuICB9XHJcbiAgcHJpdmF0ZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgIHRoaXMuX2Vycm9yKG1lc3NhZ2UpO1xyXG4gIH1cclxuICBwcml2YXRlIGFwcGVuZE1lc3NhZ2VUYXNrTG9nKG1lc3NhZ2U6IHN0cmluZywgdXNlSGVhZGVyID0gdHJ1ZSkge1xyXG4gICAgdGhpcy5fYXBwZW5kTWVzc2FnZVRhc2tMb2codXNlSGVhZGVyID8gYFxcdCR7dGhpcy5sb2dfaGVhZGVyfSB8ICR7bWVzc2FnZX0uLi5gIDogbWVzc2FnZSwgdGhpcy5sb2dfaWQpO1xyXG4gIH1cclxuXHJcbiAgaXNPdXRPZkRhdGUoKSB7XHJcbiAgICByZXR1cm4gY29tcGFyZVZlcnNpb25zLmNvbXBhcmUodGhpcy5zZXR0aW5ncy52ZXJzaW9uLCBhcHAuZ2V0VmVyc2lvbigpLCAnPCcpO1xyXG4gIH1cclxuXHJcbiAgY29weVNjcmlwdEZpbGUoKSB7XHJcbiAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gVXBkYXRpbmcgc2NyaXB0IGZpbGUuJyk7XHJcbiAgICBmc3guY29weVN5bmMoXHJcbiAgICAgIHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsICdiZWF0TWFwU3ludGhTZXJ2ZXIucHknKSxcclxuICAgICAgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ2JlYXRNYXBTeW50aFNlcnZlci5weScpXHJcbiAgICApO1xyXG4gICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIFNjcmlwdCBmaWxlIHVwZGF0ZWQuJyk7XHJcbiAgfVxyXG5cclxuICB1cGRhdGVNb2RlbEZpbGVzKCkge1xyXG4gICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIFVwZGF0aW5nIG1vZGVsIGZpbGVzLicpO1xyXG4gICAgY29uc3QgZmlsZXM6IHN0cmluZ1tdID0gW1xyXG4gICAgICAnY292ZXIuanBnJyxcclxuICAgICAgJ21vZGVscy9ITU1fZWFzeV92MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9ub3JtYWxfdjEucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1faGFyZF92MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRfdjEucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0cGx1c192MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9lYXN5X3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX25vcm1hbF92Mi5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9oYXJkX3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydF92Mi5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRwbHVzX3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2Vhc3lfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fbm9ybWFsX3YzLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2hhcmRfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0X3YzLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydHBsdXNfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZWFzeV92NC5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9ub3JtYWxfdjQucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1faGFyZF92NC5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRfdjQucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0cGx1c192NC5wa2wnLFxyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcclxuICAgICAgZnN4LmNvcHlTeW5jKHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsIGZpbGUpLCBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCBmaWxlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuaXNXaW5kb3dzKSB7XHJcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBbJ2ZmbXBlZy5leGUnLCAnZmZwbGF5LmV4ZScsICdmZnByb2JlLmV4ZScsXSkge1xyXG4gICAgICAgIGZzeC5jb3B5U3luYyhwYXRoLmpvaW4odGhpcy5zY3JpcHRzSW50ZXJuYWxQYXRoLCBmaWxlKSwgcGF0aC5qb2luKHRoaXMudGVtcERpciwgZmlsZSkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBweXRob25FeGlzdHMoKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICByZXR1cm4gISFleGVjU3luYygncHl0aG9uIC0tdmVyc2lvbicpLnRvU3RyaW5nKCk7XHJcbiAgICB9XHJcbiAgICBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgd2luZG93c0luaXRGaWxlcygpIHtcclxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5weXRob25FeGlzdHMpIHtcclxuICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmhhc1JlcXVpcmVkRXh0ZW5zaW9ucykge1xyXG4gICAgICAgIGlmICghZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dpblB5dGhvbi5leGUnKSkpIHtcclxuICAgICAgICAgIGZzeC5jb3B5U3luYyhcclxuICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMuc2NyaXB0c0ludGVybmFsUGF0aCwgJ1dpblB5dGhvbi5leGUnKSxcclxuICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dpblB5dGhvbi5leGUnKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1ZDX3JlZGlzdC54NjQuZXhlJykpKSB7XHJcbiAgICAgICAgICBmc3guY29weVN5bmMoXHJcbiAgICAgICAgICAgIHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsICdWQ19yZWRpc3QueDY0LmV4ZScpLFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnVkNfcmVkaXN0Lng2NC5leGUnKVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMubG9nKCdpbml0RmlsZXMgLSBJbnN0YWxsaW5nIFZDIFJlZGlzdCAyMDE3LicpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBleGVjRmlsZVN5bmMoXHJcbiAgICAgICAgICAgIHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdWQ19yZWRpc3QueDY0LmV4ZScpLFxyXG4gICAgICAgICAgICBbJy9pbnN0YWxsIC9wYXNzaXZlIC9ub3Jlc3RhcnQnXSwge1xyXG4gICAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLmVycm9yKGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICghZnN4LnBhdGhFeGlzdHNTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdXUHk2NCcpKSkge1xyXG4gICAgICAgIHRoaXMubG9nKCdpbml0RmlsZXMgLSBJbnN0YWxsaW5nIFdpblB5dGhvbi4nKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgZXhlY0ZpbGVTeW5jKFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnV2luUHl0aG9uLmV4ZScpLFxyXG4gICAgICAgICAgICBbJy1vJywgYFwiJHtwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnV1B5NjQnKS5ub3JtYWxpemUoKS5yZXBsYWNlKC9cXFxcL2dpLCAnLycpfVwiYCwgJy15J10sIHtcclxuICAgICAgICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgdGhpcy5lcnJvcihlcnJvcilcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGluc3RhbGxQeXRob25Nb2R1bGVzKCkge1xyXG4gICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIEluc3RhbGxpbmcgUHl0aG9uIHBhY2thZ2VzLicpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IGRhdGEgPSAnJztcclxuICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnB5dGhvbkNtZC5pbmNsdWRlcygncHl0aG9uLmV4ZScpKSB7XHJcbiAgICAgICAgZGF0YSA9IGV4ZWNTeW5jKFxyXG4gICAgICAgICAgYCR7dGhpcy5zZXR0aW5ncy5weXRob25DbWR9IC1tIHBpcCBpbnN0YWxsIGF1ZGlvcmVhZCBsaWJyb3NhIG51bXB5IHBhbmRhcyBzY2lweSBzY2lraXQtbGVhcm4gc291bmRmaWxlIHB5ZHViIG1hcmtvdmlmeSBGbGFzayBnZXZlbnRgLCB7XHJcbiAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICkudG9TdHJpbmcoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBkYXRhID0gZXhlY1N5bmMoXHJcbiAgICAgICAgICBgY2QgJHtwYXRoLmRpcm5hbWUodGhpcy5zZXR0aW5ncy5weXRob25DbWQpfSAmJiBweXRob24uZXhlIC1tIHBpcCBpbnN0YWxsIGF1ZGlvcmVhZCBsaWJyb3NhIG51bXB5IHBhbmRhcyBzY2lweSBzY2lraXQtbGVhcm4gc291bmRmaWxlIHB5ZHViIG1hcmtvdmlmeSBGbGFzayBnZXZlbnRgLCB7XHJcbiAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICkudG9TdHJpbmcoKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmxvZyhkYXRhKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoZXJyb3IpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5sb2coYGluaXRGaWxlcyAtIEluc3RhbGxlZCBQeXRob24gcGFja2FnZXMuYCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZW5lcmF0ZUJlYXRNYXBzKGRpcjogc3RyaW5nLCBhcmdzOiBfX2JlYXRNYXBBcmdzKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdTdGFydGluZyBiZWF0bWFwIGdlbmVyYXRpb24nLCBmYWxzZSk7XHJcbiAgICBsZXQgbWV0YWRhdGE6IG1tLklBdWRpb01ldGFkYXRhID0gYXdhaXQgbW0ucGFyc2VGaWxlKHBhdGgubm9ybWFsaXplKGRpcikpO1xyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnTWV0YWRhdGEgTG9hZGVkJywgZmFsc2UpO1xyXG4gICAgbGV0IHRyYWNrbmFtZTogc3RyaW5nID0gc2FuaXRpemUobWV0YWRhdGEuY29tbW9uLnRpdGxlID8/ICcnKTtcclxuICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1NvbmcgVGl0bGUgRm91bmQnLCBmYWxzZSk7XHJcbiAgICBsZXQgYXJ0aXN0bmFtZTogc3RyaW5nID0gc2FuaXRpemUobWV0YWRhdGEuY29tbW9uLmFydGlzdCA/PyAnJyk7XHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdBcnRpc3QgRm91bmQnLCBmYWxzZSk7XHJcbiAgICBjb25zdCBzb25nX25hbWUgPSBgJHt0cmFja25hbWV9IC0gJHthcnRpc3RuYW1lfWA7XHJcbiAgICB0aGlzLmxvZ19oZWFkZXIgPSBzb25nX25hbWU7XHJcbiAgICBsZXQgZW1iZWRkZWRhcnQ6IG1tLklQaWN0dXJlIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnQ2hlY2tpbmcgaWYgYmVhdCBtYXAgYWxyZWFkeSBleGlzdHMnKTtcclxuXHJcbiAgICBsZXQgYmVhdE1hcEV4aXN0czogYm9vbGVhbiA9XHJcbiAgICAgIGZzeC5leGlzdHNTeW5jKHBhdGguam9pbihhcmdzLm91dERpciwgc29uZ19uYW1lLCAnaW5mby5kYXQnKSkgfHxcclxuICAgICAgZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKGFyZ3Mub3V0RGlyLCBgJHtzb25nX25hbWV9LnppcGApKTtcclxuXHJcbiAgICBpZiAoYmVhdE1hcEV4aXN0cykge1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdCZWF0IG1hcCBleGlzdHMsIHNraXBwaW5nIScpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnU2VhcmNoaW5nIGZvciBlbWJlZGRlZCBhcnQnKTtcclxuXHJcbiAgICAgIGlmIChtZXRhZGF0YS5jb21tb24ucGljdHVyZSkge1xyXG4gICAgICAgIGVtYmVkZGVkYXJ0ID0gdGhpcy5maW5kRW1iZWRkZWRBcnQobWV0YWRhdGEuY29tbW9uLnBpY3R1cmUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmc3guZW5zdXJlRGlyU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCBzb25nX25hbWUpKTtcclxuXHJcbiAgICAgIGlmIChlbWJlZGRlZGFydCkge1xyXG4gICAgICAgIGFyZ3MuYWxidW1EaXIgPSBhd2FpdCB0aGlzLmV4dHJhY3RFbWJlZGRlZEFydChzb25nX25hbWUsIGVtYmVkZGVkYXJ0KTtcclxuICAgICAgICBhcmdzLmFsYnVtRGlyID0gYXJncy5hbGJ1bURpciAmJiBhcmdzLmFsYnVtRGlyICE9PSAnTk9ORSdcclxuICAgICAgICAgID8gYXJncy5hbGJ1bURpclxyXG4gICAgICAgICAgOiBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnY292ZXIuanBnJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1NldHRpbmcgYmVhdCBtYXAgcGFyYW1ldGVycycpO1xyXG5cclxuICAgICAgaWYgKGFyZ3MuZW52aXJvbm1lbnQgPT09ICdSQU5ET00nKSB7XHJcbiAgICAgICAgYXJncy5lbnZpcm9ubWVudCA9IHRoaXMuZ2V0UmFuZG9tRW52aXJvbm1lbnQoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuc29uZ19hcmdzID0ge1xyXG4gICAgICB3b3JraW5nRGlyOiBgJHt0aGlzLnRlbXBEaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX0vJHtzb25nX25hbWV9YCxcclxuICAgICAgYWxidW1EaXI6IGAke2FyZ3MuYWxidW1EaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX1gLFxyXG4gICAgICBvdXREaXI6IGAke2FyZ3Mub3V0RGlyLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyl9LyR7c29uZ19uYW1lfWAsXHJcbiAgICAgIHNvbmdfcGF0aDogYCR7ZGlyLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyl9YCxcclxuICAgICAgc29uZ19uYW1lOiBzb25nX25hbWUsXHJcbiAgICAgIGRpZmZpY3VsdHk6IGFyZ3MuZGlmZmljdWx0eSxcclxuICAgICAgbW9kZWw6IGFyZ3MubW9kZWwsXHJcbiAgICAgIHZlcnNpb246IGFyZ3MudmVyc2lvbiA/PyAyLFxyXG4gICAgICBlbnZpcm9ubWVudDogYXJncy5lbnZpcm9ubWVudCA/PyAnRGVmYXVsdEVudmlyb25tZW50JyxcclxuICAgICAgbGlnaHRzSW50ZW5zaXR5OiBhcmdzLmxpZ2h0c0ludGVuc2l0eSA/IDExLjUgLSBhcmdzLmxpZ2h0c0ludGVuc2l0eSA6IDIuNSxcclxuICAgICAgemlwRmlsZXM6IGFyZ3MuemlwRmlsZXMsXHJcbiAgICAgIHNlZWQ6IHNlZWRyYW5kb20oc29uZ19uYW1lLCB7IGVudHJvcHk6IHRydWUgfSkoKSxcclxuICAgICAgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IDIuNSxcclxuICAgIH07XHJcblxyXG4gICAgaWYgKCFmc3guZXhpc3RzU3luYyh0aGlzLnNvbmdfYXJncy5vdXREaXIpKSB7XHJcbiAgICAgIGZzeC5lbnN1cmVEaXJTeW5jKHRoaXMuc29uZ19hcmdzLm91dERpcik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYmFzZUxpc3RzID0ge1xyXG4gICAgICBldmVudHNfbGlzdDogW10sXHJcbiAgICAgIG5vdGVzX2xpc3Q6IFtdLFxyXG4gICAgICBvYnN0YWNsZXNfbGlzdDogW10sXHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMudHJhY2tzID0ge1xyXG4gICAgICBicG06IDAsXHJcbiAgICAgIGJlYXRfdGltZXM6IFtdLFxyXG4gICAgICB5OiBbXSxcclxuICAgICAgc3I6IDAsXHJcbiAgICAgIGVhc3k6IHsgLi4uYmFzZUxpc3RzIH0sXHJcbiAgICAgIG5vcm1hbDogeyAuLi5iYXNlTGlzdHMgfSxcclxuICAgICAgaGFyZDogeyAuLi5iYXNlTGlzdHMgfSxcclxuICAgICAgZXhwZXJ0OiB7IC4uLmJhc2VMaXN0cyB9LFxyXG4gICAgICBleHBlcnRwbHVzOiB7IC4uLmJhc2VMaXN0cyB9LFxyXG4gICAgfTtcclxuXHJcbiAgICBsZXQgc29uZ3NfanNvbjogdW5rbm93bltdID0gZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKHRoaXMudGVtcERpci5ub3JtYWxpemUoKSwgJ3NvbmdzLmpzb24nKSlcclxuICAgICAgPyBKU09OLnBhcnNlKGZzeC5yZWFkRmlsZVN5bmMocGF0aC5qb2luKHRoaXMudGVtcERpci5ub3JtYWxpemUoKSwgJ3NvbmdzLmpzb24nKSkudG9TdHJpbmcoKSlcclxuICAgICAgOiBbXTtcclxuICAgIHNvbmdzX2pzb24ucHVzaCh0aGlzLnNvbmdfYXJncyk7XHJcbiAgICBmc3gud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCAnc29uZ3MuanNvbicpLCBKU09OLnN0cmluZ2lmeShzb25nc19qc29uLCBudWxsLCAyKSk7XHJcblxyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnR2VuZXJhdGluZyBiZWF0IG1hcCcpO1xyXG5cclxuICAgIGF3YWl0IHRoaXMucnVuUHl0aG9uU2hlbGwoKTtcclxuXHJcbiAgICBpZiAodGhpcy5zb25nX2FyZ3MgJiYgdGhpcy50cmFja3MgJiYgKGF3YWl0IGlzUHl0aG9uU2VydmVyUnVubmluZygpKSkge1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdMb2FkaW5nIFNvbmcnKTtcclxuICAgICAgY29uc3QgbW9kZWxQYXJhbXMgPSAoYXdhaXQgZ2V0QmVhdEZlYXR1cmVzKHRoaXMuc29uZ19hcmdzLnNvbmdfcGF0aCkpLmRhdGE7XHJcbiAgICAgIHRoaXMudHJhY2tzID0ge1xyXG4gICAgICAgIC4uLnRoaXMudHJhY2tzLFxyXG4gICAgICAgIC4uLm1vZGVsUGFyYW1zLFxyXG4gICAgICB9O1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdTb25nIGxvYWRlZCcpO1xyXG4gICAgICBjb25zdCBkaWZmaWN1bHRpZXMgPSAoXHJcbiAgICAgICAgdGhpcy5zb25nX2FyZ3MuZGlmZmljdWx0eSA9PT0gJ2FsbCdcclxuICAgICAgICAgID8gWydlYXN5JywgJ25vcm1hbCcsICdoYXJkJywgJ2V4cGVydCcsICdleHBlcnRwbHVzJ11cclxuICAgICAgICAgIDogW3RoaXMuc29uZ19hcmdzLmRpZmZpY3VsdHldXHJcbiAgICAgICkubWFwKGRpZmZpY3VsdHkgPT4gZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgbGV0IHByb2Nlc3NlZERpZmZpY3VsdGVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdNYXBwaW5nJyk7XHJcbiAgICAgIGZvciAoY29uc3QgZGlmZmljdWx0eSBvZiBkaWZmaWN1bHRpZXMgYXMgKCdlYXN5JyB8ICdub3JtYWwnIHwgJ2hhcmQnIHwgJ2V4cGVydCcgfCAnZXhwZXJ0cGx1cycpW10pIHtcclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKGBQcm9jZXNzaW5nICR7ZGlmZmljdWx0eX1gKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgdGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCA9IChcclxuICAgICAgICAgICAgYXdhaXQgZ2V0Tm90ZXNMaXN0KHtcclxuICAgICAgICAgICAgICBtb2RlbDogdGhpcy5zb25nX2FyZ3MubW9kZWwsXHJcbiAgICAgICAgICAgICAgZGlmZmljdWx0eTogZGlmZmljdWx0eSxcclxuICAgICAgICAgICAgICBiZWF0X3RpbWVzOiB0aGlzLnRyYWNrcy5iZWF0X3RpbWVzLFxyXG4gICAgICAgICAgICAgIGJwbTogdGhpcy50cmFja3MuYnBtLFxyXG4gICAgICAgICAgICAgIHZlcnNpb246IHRoaXMuc29uZ19hcmdzLnZlcnNpb24sXHJcbiAgICAgICAgICAgICAgeTogdGhpcy50cmFja3MueSxcclxuICAgICAgICAgICAgICBzcjogdGhpcy50cmFja3Muc3IsXHJcbiAgICAgICAgICAgICAgdGVtcERpcjogdGhpcy50ZW1wRGlyLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgKS5kYXRhO1xyXG5cclxuICAgICAgICAgIGlmICghdGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCB8fCAhQXJyYXkuaXNBcnJheSh0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ub3Rlc19saXN0KSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vdGVzIGxpc3Qgd2FzIGludmFsaWQhXFxuXFx0JHtKU09OLnN0cmluZ2lmeSh0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ub3Rlc19saXN0KX1gKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ldmVudHNfbGlzdCA9IGdldEV2ZW50c0xpc3Qoe1xyXG4gICAgICAgICAgICBub3Rlc19saXN0OiB0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ub3Rlc19saXN0LFxyXG4gICAgICAgICAgICBicG06IHRoaXMudHJhY2tzLmJwbSxcclxuICAgICAgICAgICAgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IHRoaXMuc29uZ19hcmdzLmV2ZW50Q29sb3JTd2FwT2Zmc2V0LFxyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgdGhpcy50cmFja3NbZGlmZmljdWx0eV0ub2JzdGFjbGVzX2xpc3QgPSBnZXRPYnN0YWNsZXNMaXN0KHtcclxuICAgICAgICAgICAgbm90ZXNfbGlzdDogdGhpcy50cmFja3NbZGlmZmljdWx0eV0ubm90ZXNfbGlzdCxcclxuICAgICAgICAgICAgYnBtOiB0aGlzLnRyYWNrcy5icG0sXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICBwcm9jZXNzZWREaWZmaWN1bHRlcy5wdXNoKGRpZmZpY3VsdHkpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgIHRoaXMuZXJyb3IoZSk7XHJcbiAgICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKGBEaWZmaWN1bHR5IHByb2Nlc3NpbmcgZXJyb3IsICR7ZGlmZmljdWx0eX0gc2tpcHBlZCFgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZyhgUHJvY2Vzc2luZyAke2RpZmZpY3VsdHl9IGRvbmUhYCk7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnTWFwcGluZyBkb25lIScpO1xyXG4gICAgICBpZiAocHJvY2Vzc2VkRGlmZmljdWx0ZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1dyaXRpbmcgZmlsZXMgdG8gZGlzaycpO1xyXG4gICAgICAgIHRoaXMud3JpdGVJbmZvRmlsZShwcm9jZXNzZWREaWZmaWN1bHRlcyk7XHJcbiAgICAgICAgdGhpcy53cml0ZUxldmVsRmlsZShwcm9jZXNzZWREaWZmaWN1bHRlcyk7XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnQ29udmVydGluZyBtdXNpYyBmaWxlJyk7XHJcbiAgICAgICAgYXdhaXQgY29udmVydE11c2ljRmlsZSh0aGlzLnNvbmdfYXJncy5zb25nX3BhdGgsIHRoaXMuc29uZ19hcmdzLndvcmtpbmdEaXIpO1xyXG4gICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1ppcHBpbmcgZm9sZGVyJyk7XHJcbiAgICAgICAgdGhpcy56aXBGaWxlcyhwcm9jZXNzZWREaWZmaWN1bHRlcyk7XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZyhcclxuICAgICAgICAgIGAke3RoaXMuc29uZ19hcmdzLnNvbmdfbmFtZX0gfCBGaW5pc2hlZCEgXFxuXFx0TG9vayBmb3IgJHtcclxuICAgICAgICAgICAgdGhpcy5zb25nX2FyZ3MuemlwRmlsZXMgPT09IDEgPyAnemlwcGVkIGZvbGRlcicgOiAnZm9sZGVyJ1xyXG4gICAgICAgICAgfSBpbiAke3RoaXMuc29uZ19hcmdzLm91dERpcn0sICR7XHJcbiAgICAgICAgICAgIHRoaXMuc29uZ19hcmdzLnppcEZpbGVzID09PSAxID8gJ3VuemlwIHRoZSBmb2xkZXIsICcgOiAnJ1xyXG4gICAgICAgICAgfVxcblxcdHBsYWNlIGluIHRoZSAnQ3VzdG9tTXVzaWMnIGZvbGRlciBpbiBCZWF0IFNhYmVyJ3MgZmlsZXMuYCxcclxuICAgICAgICAgIGZhbHNlXHJcbiAgICAgICAgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmVycm9yKCdTb25nIHByb2Nlc3NpbmcgZXJyb3IhJyk7XHJcbiAgICAgIH1cclxuICAgICAgYXdhaXQgY2xvc2VQeXRob25TZXJ2ZXIoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoJ1B5dGhvbiBzZXJ2ZXIgaXMgbm90IHJ1bm5pbmchJyk7XHJcbiAgICB9XHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdHZW5lcmF0ZWQgYmVhdCBtYXAhJyk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIHJ1blB5dGhvblNoZWxsKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICBpZiAoIXRoaXMuc29uZ19hcmdzIHx8ICF0aGlzLnRyYWNrcykge1xyXG4gICAgICAgIHJlamVjdChmYWxzZSk7XHJcbiAgICAgIH1cclxuICAgICAgbGV0IF9yZW1haW5pbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgIGNvbnN0IGZhaWxlZFRvU3RhcnRUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2coJ1B5dGhvbiBwcm9jZXNzIGZhaWxlZCB0byBzcGF3biAtLSB0aW1lZCBvdXQhJylcclxuICAgICAgICByZWplY3QoZmFsc2UpO1xyXG4gICAgICB9LCAzMDAwMCk7XHJcblxyXG4gICAgICBmdW5jdGlvbiBwYXJzZU91dChkYXRhPzogc3RyaW5nKSB7XHJcbiAgICAgICAgZGF0YSAmJiBzZWxmLl9sb2coZGF0YSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIHJlY2VpdmVJbnRlcm5hbCh0aGlzOiBhbnksIGRhdGE6IHN0cmluZyB8IEJ1ZmZlciwgZW1pdFR5cGU6ICdzdGRvdXQnIHwgJ3N0ZGVycicpIHtcclxuICAgICAgICBsZXQgcGFydHMgPSAoJycgKyBkYXRhKS5zcGxpdChuZXdsaW5lKTtcclxuXHJcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgICAgLy8gYW4gaW5jb21wbGV0ZSByZWNvcmQsIGtlZXAgYnVmZmVyaW5nXHJcbiAgICAgICAgICBfcmVtYWluaW5nID0gKF9yZW1haW5pbmcgfHwgJycpICsgcGFydHNbMF07XHJcbiAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBsYXN0TGluZSA9IHBhcnRzLnBvcCgpO1xyXG4gICAgICAgIC8vIGZpeCB0aGUgZmlyc3QgbGluZSB3aXRoIHRoZSByZW1haW5pbmcgZnJvbSB0aGUgcHJldmlvdXMgaXRlcmF0aW9uIG9mICdyZWNlaXZlJ1xyXG4gICAgICAgIHBhcnRzWzBdID0gKF9yZW1haW5pbmcgfHwgJycpICsgcGFydHNbMF07XHJcbiAgICAgICAgLy8ga2VlcCB0aGUgcmVtYWluaW5nIGZvciB0aGUgbmV4dCBpdGVyYXRpb24gb2YgJ3JlY2VpdmUnXHJcbiAgICAgICAgX3JlbWFpbmluZyA9IGxhc3RMaW5lO1xyXG5cclxuICAgICAgICBwYXJ0cy5mb3JFYWNoKGZ1bmN0aW9uIChwYXJ0KSB7XHJcbiAgICAgICAgICBpZiAocGFydC5pbmNsdWRlcygnUnVubmluZyBvbiBodHRwOi8vMTI3LjAuMC4xOjUwMDAvJykpIHtcclxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGZhaWxlZFRvU3RhcnRUaW1lb3V0KTtcclxuICAgICAgICAgICAgcmVzb2x2ZSh0cnVlKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHBhcnNlT3V0KHBhcnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgfVxyXG5cclxuICAgICAgZnVuY3Rpb24gcmVjZWl2ZVN0ZG91dChkYXRhOiBzdHJpbmcgfCBCdWZmZXIpIHtcclxuICAgICAgICByZXR1cm4gcmVjZWl2ZUludGVybmFsKGRhdGEsICdzdGRvdXQnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZnVuY3Rpb24gcmVjZWl2ZVN0ZGVycihkYXRhOiBzdHJpbmcgfCBCdWZmZXIpIHtcclxuICAgICAgICByZXR1cm4gcmVjZWl2ZUludGVybmFsKGRhdGEsICdzdGRlcnInKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnB5dGhvbkNtZC5pbmNsdWRlcygncHl0aG9uLmV4ZScpKSB7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVTaGVsbCA9IGV4ZWMoXHJcbiAgICAgICAgICBgJHt0aGlzLnNldHRpbmdzLnB5dGhvbkNtZH0gXCIke3BhdGgubm9ybWFsaXplKHBhdGguam9pbih0aGlzLnRlbXBEaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKSwgJy9iZWF0TWFwU3ludGhTZXJ2ZXIucHknKSl9XCJgLFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB0aW1lb3V0OiAzMDAwMDAsXHJcbiAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVTaGVsbCA9IGV4ZWMoXHJcbiAgICAgICAgICBgY2QgJHtwYXRoLmRpcm5hbWUodGhpcy5zZXR0aW5ncy5weXRob25DbWQpfSAmJiBweXRob24uZXhlIFwiJHtwYXRoLm5vcm1hbGl6ZShwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyksICcvYmVhdE1hcFN5bnRoU2VydmVyLnB5JykpfVwiYCxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdGltZW91dDogMzAwMDAwLFxyXG4gICAgICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcclxuICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLm9uKCdjbG9zZScsIGNvZGUgPT4ge1xyXG4gICAgICAgIHRoaXMubG9nKCdGaW5pc2hlZCcpO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuc29uZ19hcmdzKSB7XHJcbiAgICAgICAgICB0aGlzLmVycm9yKCdTb25nIGFyZ3Mgd2FzIHVuZGVmaW5lZCEgRXJyb3Igd2hpbGUgY2xvc2luZyBzaGVsbCEnKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChjb2RlID09PSAwKSB7XHJcbiAgICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdGaW5pc2hlZCBzdWNjZXNzZnVsbHkhJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coYEZhaWxlZCB3aXRoIGV4aXQgY29kZTogJHtjb2RlfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLnN0ZG91dD8uc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcclxuICAgICAgdGhpcy5hY3RpdmVTaGVsbC5zdGRlcnI/LnNldEVuY29kaW5nKCd1dGY4Jyk7XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLnN0ZG91dD8ub24oJ2RhdGEnLCBidWZmZXIgPT4gcmVjZWl2ZVN0ZG91dChidWZmZXIpKTtcclxuXHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwuc3RkZXJyPy5vbignZGF0YScsIGJ1ZmZlciA9PiByZWNlaXZlU3RkZXJyKGJ1ZmZlcikpO1xyXG5cclxuICAgICAgdGhpcy5hY3RpdmVTaGVsbC5vbmNlKCdzcGF3bicsICgpID0+IHtcclxuICAgICAgICB0aGlzLmxvZygnUHl0aG9uIHByb2Nlc3Mgc3Bhd25lZCBzdWNjZXNzZnVsbHkhJylcclxuICAgICAgICBjbGVhclRpbWVvdXQoZmFpbGVkVG9TdGFydFRpbWVvdXQpO1xyXG4gICAgICAgIHJlc29sdmUodHJ1ZSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgdGhpcy5hY3RpdmVTaGVsbC5vbmNlKCdlcnJvcicsICgpID0+IHtcclxuICAgICAgICB0aGlzLmxvZygnUHl0aG9uIHByb2Nlc3MgZmFpbGVkIHRvIHNwYXduIScpXHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KGZhaWxlZFRvU3RhcnRUaW1lb3V0KTtcclxuICAgICAgICByZWplY3QoZmFsc2UpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuYWN0aXZlU2hlbGw/LmtpbGwoJ1NJR1RFUk0nKTtcclxuICAgICAgfSwgNDUwMDAwKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAga2lsbFNoZWxsKCkge1xyXG4gICAgaWYgKHRoaXMuYWN0aXZlU2hlbGwpIHtcclxuICAgICAgY2xvc2VQeXRob25TZXJ2ZXIoKS5maW5hbGx5KCgpID0+IHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVTaGVsbD8uY29ubmVjdGVkICYmICF0aGlzLmFjdGl2ZVNoZWxsLmtpbGwoJ1NJR1RFUk0nKSkge1xyXG4gICAgICAgICAgLy8gS2lsbHMgYSBQSUQgYW5kIGFsbCBjaGlsZCBwcm9jZXNzXHJcbiAgICAgICAgICBleGVjKGB0YXNra2lsbCAvZiAvdCAvcGlkICR7dGhpcy5hY3RpdmVTaGVsbC5waWR9YCwgKGVyciwgc3Rkb3V0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzdGRvdXQnLCBzdGRvdXQpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnc3RkZXJyJywgZXJyKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBkZWxldGUgdGhpcy5hY3RpdmVTaGVsbDtcclxuICAgICAgfSlcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgZ2V0UmFuZG9tRW52aXJvbm1lbnQoKSB7XHJcbiAgICBjb25zdCBlbnZpcm9ubWVudHMgPSBbXHJcbiAgICAgICdEZWZhdWx0RW52aXJvbm1lbnQnLFxyXG4gICAgICAnQmlnTWlycm9yRW52aXJvbm1lbnQnLFxyXG4gICAgICAnT3JpZ2lucycsXHJcbiAgICAgICdOaWNlRW52aXJvbm1lbnQnLFxyXG4gICAgICAnVHJpYW5nbGVFbnZpcm9ubWVudCcsXHJcbiAgICAgICdLREFFbnZpcm9ubWVudCcsXHJcbiAgICAgICdEcmFnb25zRW52aXJvbm1lbnQnLFxyXG4gICAgICAnTW9uc3RlcmNhdEVudmlyb25tZW50JyxcclxuICAgICAgJ0NyYWJSYXZlRW52aXJvbm1lbnQnLFxyXG4gICAgICAnUGFuaWNFbnZpcm9ubWVudCcsXHJcbiAgICAgICdSb2NrZXRFbnZpcm9ubWVudCcsXHJcbiAgICAgICdHcmVlbkRheUVudmlyb25tZW50JyxcclxuICAgICAgJ0dyZWVuRGF5R3JlbmFkZUVudmlyb25tZW50JyxcclxuICAgIF07XHJcbiAgICByZXR1cm4gZW52aXJvbm1lbnRzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGVudmlyb25tZW50cy5sZW5ndGgpXTtcclxuICB9XHJcblxyXG4gIHppcEZpbGVzKGRpZmZpY3VsdGllczogc3RyaW5nW10pIHtcclxuICAgIGlmICghdGhpcy5zb25nX2FyZ3MpIHtcclxuICAgICAgdGhpcy5lcnJvcignU29uZyBhcmdzIHdhcyB1bmRlZmluZWQsIGNvdWxkIG5vdCB6aXAgZmlsZXMhJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB3b3JraW5nRGlyID0gdGhpcy5zb25nX2FyZ3Mud29ya2luZ0RpcjtcclxuICAgIGNvbnN0IG91dERpciA9IHRoaXMuc29uZ19hcmdzLm91dERpcjtcclxuICAgIGlmICghZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKHdvcmtpbmdEaXIsICdjb3Zlci5qcGcnKSkpIHtcclxuICAgICAgZnN4LmNvcHlGaWxlU3luYyhmc3guZXhpc3RzU3luYyh0aGlzLnNvbmdfYXJncy5hbGJ1bURpcikgPyB0aGlzLnNvbmdfYXJncy5hbGJ1bURpciA6IHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdjb3Zlci5qcGcnKSwgcGF0aC5qb2luKHdvcmtpbmdEaXIsICdjb3Zlci5qcGcnKSk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBmaWxlcyA9IFtcclxuICAgICAgcGF0aC5qb2luKHdvcmtpbmdEaXIsICdpbmZvLmRhdCcpLFxyXG4gICAgICBwYXRoLmpvaW4od29ya2luZ0RpciwgJ2NvdmVyLmpwZycpLFxyXG4gICAgICBwYXRoLmpvaW4od29ya2luZ0RpciwgJ3NvbmcuZWdnJyksXHJcbiAgICAgIC4uLmRpZmZpY3VsdGllcy5tYXAoZGlmZmljdWx0eSA9PiBwYXRoLmpvaW4od29ya2luZ0RpciwgYCR7ZGlmZmljdWx0eX0uZGF0YCkpLFxyXG4gICAgXTtcclxuICAgIGlmICh0aGlzLnNvbmdfYXJncy56aXBGaWxlcyA9PT0gMSkge1xyXG4gICAgICBjb25zdCB6aXAgPSBuZXcgQWRtWmlwKCk7XHJcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgIHppcC5hZGRMb2NhbEZpbGUoZmlsZSk7XHJcbiAgICAgICAgZnN4LnVubGlua1N5bmMoZmlsZSk7XHJcbiAgICAgIH1cclxuICAgICAgemlwLndyaXRlWmlwKHBhdGguam9pbih0aGlzLnNvbmdfYXJncy5vdXREaXIuc3Vic3RyKDAsIHRoaXMuc29uZ19hcmdzLm91dERpci5sYXN0SW5kZXhPZignLycpKSwgYCR7dGhpcy5zb25nX2FyZ3Muc29uZ19uYW1lfS56aXBgKSk7XHJcbiAgICAgIGZzeC5ybWRpclN5bmMod29ya2luZ0Rpcik7XHJcbiAgICAgIGZzeC5ybWRpclN5bmModGhpcy5zb25nX2FyZ3Mub3V0RGlyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgIGZzeC5jb3B5RmlsZVN5bmMoZmlsZSwgcGF0aC5yZXNvbHZlKG91dERpciwgcGF0aC5iYXNlbmFtZShmaWxlKSkpO1xyXG4gICAgICAgIGZzeC51bmxpbmtTeW5jKGZpbGUpO1xyXG4gICAgICB9XHJcbiAgICAgIGZzeC5ybWRpclN5bmMod29ya2luZ0Rpcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB3cml0ZUxldmVsRmlsZShkaWZmaWN1bHRpZXM6IHN0cmluZ1tdKSB7XHJcbiAgICBpZiAoIXRoaXMuc29uZ19hcmdzKSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoJ1NvbmcgYXJncyB3YXMgdW5kZWZpbmVkLCBjb3VsZCBub3Qgd3JpdGUgbGV2ZWwgZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLnRyYWNrcykge1xyXG4gICAgICB0aGlzLmVycm9yKCdUcmFja3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHdyaXRlIGxldmVsIGZpbGUhJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IHdvcmtpbmdEaXIgPSB0aGlzLnNvbmdfYXJncy53b3JraW5nRGlyO1xyXG4gICAgY29uc3QgdHJhY2tzID0gdGhpcy50cmFja3M7XHJcbiAgICBmb3IgKGNvbnN0IGRpZmZpY3VsdHkgb2YgZGlmZmljdWx0aWVzKSB7XHJcbiAgICAgIGNvbnN0IGxldmVsID0ge1xyXG4gICAgICAgIF92ZXJzaW9uOiAnMi4wLjAnLFxyXG4gICAgICAgIF9jdXN0b21EYXRhOiB7XHJcbiAgICAgICAgICBfdGltZTogJycsIC8vIG5vdCBzdXJlIHdoYXQgdGltZSByZWZlcnMgdG9cclxuICAgICAgICAgIF9CUE1DaGFuZ2VzOiBbXSxcclxuICAgICAgICAgIF9ib29rbWFya3M6IFtdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgX2V2ZW50czogdHJhY2tzW2RpZmZpY3VsdHkudG9Mb3dlckNhc2UoKV1bJ2V2ZW50c19saXN0J10sXHJcbiAgICAgICAgX25vdGVzOiB0cmFja3NbZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpXVsnbm90ZXNfbGlzdCddLFxyXG4gICAgICAgIF9vYnN0YWNsZXM6IHRyYWNrc1tkaWZmaWN1bHR5LnRvTG93ZXJDYXNlKCldWydvYnN0YWNsZXNfbGlzdCddLFxyXG4gICAgICB9O1xyXG4gICAgICBmc3gud3JpdGVKU09OU3luYyhwYXRoLmpvaW4od29ya2luZ0RpciwgYCR7ZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpfS5kYXRgKSwgbGV2ZWwpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgd3JpdGVJbmZvRmlsZShkaWZmaWN1bHRpZXM/OiBzdHJpbmdbXSkge1xyXG4gICAgaWYgKCF0aGlzLnNvbmdfYXJncykge1xyXG4gICAgICB0aGlzLmVycm9yKCdTb25nIGFyZ3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHdyaXRlIGluZm8gZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLnRyYWNrcykge1xyXG4gICAgICB0aGlzLmVycm9yKCdUcmFja3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHdyaXRlIGluZm8gZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaW50ZXJmYWNlIEJlYXRNYXBJbmZvIHtcclxuICAgICAgX2RpZmZpY3VsdHk6IHN0cmluZztcclxuICAgICAgX2RpZmZpY3VsdHlSYW5rOiBudW1iZXI7XHJcbiAgICAgIF9iZWF0bWFwRmlsZW5hbWU6IHN0cmluZztcclxuICAgICAgX25vdGVKdW1wTW92ZW1lbnRTcGVlZDogbnVtYmVyO1xyXG4gICAgICBfbm90ZUp1bXBTdGFydEJlYXRPZmZzZXQ6IG51bWJlcjtcclxuICAgICAgX2N1c3RvbURhdGE6IHt9O1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheTogQmVhdE1hcEluZm9bXSA9IFtdO1xyXG5cclxuICAgIGNvbnN0IGdldEJlYXRtYXBJbmZvID0gKGRpZmZpY3VsdHk6IHN0cmluZywgcmFuazogbnVtYmVyLCBtb3ZlbWVudFNwZWVkOiBudW1iZXIpOiBCZWF0TWFwSW5mbyA9PiB7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgX2RpZmZpY3VsdHk6IGRpZmZpY3VsdHksXHJcbiAgICAgICAgX2RpZmZpY3VsdHlSYW5rOiByYW5rLFxyXG4gICAgICAgIF9iZWF0bWFwRmlsZW5hbWU6IGAke2RpZmZpY3VsdHkudG9Mb3dlckNhc2UoKX0uZGF0YCxcclxuICAgICAgICBfbm90ZUp1bXBNb3ZlbWVudFNwZWVkOiBtb3ZlbWVudFNwZWVkLFxyXG4gICAgICAgIF9ub3RlSnVtcFN0YXJ0QmVhdE9mZnNldDogMCxcclxuICAgICAgICBfY3VzdG9tRGF0YToge30sXHJcbiAgICAgIH07XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGVhc3lCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdFYXN5JywgMSwgOCk7XHJcbiAgICBjb25zdCBub3JtYWxCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdOb3JtYWwnLCAzLCAxMCk7XHJcbiAgICBjb25zdCBoYXJkQmVhdG1hcEluZm8gPSBnZXRCZWF0bWFwSW5mbygnSGFyZCcsIDUsIDEyKTtcclxuICAgIGNvbnN0IGV4cGVydEJlYXRtYXBJbmZvID0gZ2V0QmVhdG1hcEluZm8oJ0V4cGVydCcsIDcsIDE0KTtcclxuICAgIGNvbnN0IGV4cGVydHBsdXNCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdFeHBlcnRQbHVzJywgOSwgMTYpO1xyXG5cclxuICAgIGNvbnN0IGJlYXRtYXBJbmZvID0ge1xyXG4gICAgICBlYXN5OiBlYXN5QmVhdG1hcEluZm8sXHJcbiAgICAgIG5vcm1hbDogbm9ybWFsQmVhdG1hcEluZm8sXHJcbiAgICAgIGhhcmQ6IGhhcmRCZWF0bWFwSW5mbyxcclxuICAgICAgZXhwZXJ0OiBleHBlcnRCZWF0bWFwSW5mbyxcclxuICAgICAgZXhwZXJ0cGx1czogZXhwZXJ0cGx1c0JlYXRtYXBJbmZvLFxyXG4gICAgfTtcclxuXHJcbiAgICBzd2l0Y2ggKHRoaXMuc29uZ19hcmdzLmRpZmZpY3VsdHkudG9Mb3dlckNhc2UoKSkge1xyXG4gICAgICBjYXNlICdlYXN5JzpcclxuICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtlYXN5QmVhdG1hcEluZm9dO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdub3JtYWwnOlxyXG4gICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW25vcm1hbEJlYXRtYXBJbmZvXTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnaGFyZCc6XHJcbiAgICAgICAgZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXkgPSBbaGFyZEJlYXRtYXBJbmZvXTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnZXhwZXJ0JzpcclxuICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtleHBlcnRCZWF0bWFwSW5mb107XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgJ2V4cGVydHBsdXMnOlxyXG4gICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW2V4cGVydHBsdXNCZWF0bWFwSW5mb107XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgaWYgKGRpZmZpY3VsdGllcykge1xyXG4gICAgICAgICAgZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXkgPSBkaWZmaWN1bHRpZXMubWFwKGRpZmZLZXkgPT4gYmVhdG1hcEluZm9bZGlmZktleV0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtcclxuICAgICAgICAgICAgZWFzeUJlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgICBub3JtYWxCZWF0bWFwSW5mbyxcclxuICAgICAgICAgICAgaGFyZEJlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgICBleHBlcnRCZWF0bWFwSW5mbyxcclxuICAgICAgICAgICAgZXhwZXJ0cGx1c0JlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgX2FydGlzdCA9IHRoaXMuc29uZ19hcmdzLnNvbmdfbmFtZS5zcGxpdCgnIC0gJylbdGhpcy5zb25nX2FyZ3Muc29uZ19uYW1lLnNwbGl0KCcgLSAnKS5sZW5ndGggLSAxXTtcclxuICAgIGNvbnN0IGluZm8gPSB7XHJcbiAgICAgIF92ZXJzaW9uOiAnMi4wLjAnLFxyXG4gICAgICBfc29uZ05hbWU6IHRoaXMuc29uZ19hcmdzLnNvbmdfbmFtZSxcclxuICAgICAgX3NvbmdTdWJOYW1lOiAnJyxcclxuICAgICAgX3NvbmdBdXRob3JOYW1lOiBfYXJ0aXN0LFxyXG4gICAgICBfbGV2ZWxBdXRob3JOYW1lOiAnQmVhdE1hcFN5bnRoJyxcclxuICAgICAgX2JlYXRzUGVyTWludXRlOiBNYXRoLmZsb29yKHRoaXMudHJhY2tzLmJwbSksXHJcbiAgICAgIF9zb25nVGltZU9mZnNldDogMCxcclxuICAgICAgX3NodWZmbGU6IDAsXHJcbiAgICAgIF9zaHVmZmxlUGVyaW9kOiAwLFxyXG4gICAgICBfcHJldmlld1N0YXJ0VGltZTogMTAsXHJcbiAgICAgIF9wcmV2aWV3RHVyYXRpb246IDMwLFxyXG4gICAgICBfc29uZ0ZpbGVuYW1lOiAnc29uZy5lZ2cnLFxyXG4gICAgICBfY292ZXJJbWFnZUZpbGVuYW1lOiAnY292ZXIuanBnJyxcclxuICAgICAgX2Vudmlyb25tZW50TmFtZTogdGhpcy5zb25nX2FyZ3MuZW52aXJvbm1lbnQsXHJcbiAgICAgIF9jdXN0b21EYXRhOiB7fSxcclxuICAgICAgX2RpZmZpY3VsdHlCZWF0bWFwU2V0czogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIF9iZWF0bWFwQ2hhcmFjdGVyaXN0aWNOYW1lOiAnU3RhbmRhcmQnLFxyXG4gICAgICAgICAgX2RpZmZpY3VsdHlCZWF0bWFwczogZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH07XHJcblxyXG4gICAgZnN4LndyaXRlSlNPTlN5bmMocGF0aC5qb2luKHRoaXMuc29uZ19hcmdzLndvcmtpbmdEaXIsICdpbmZvLmRhdCcpLCBpbmZvKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGV4dHJhY3RFbWJlZGRlZEFydChzb25nX25hbWU6IHN0cmluZywgZW1iZWRkZWRhcnQ6IG1tLklQaWN0dXJlKSB7XHJcbiAgICBpZiAoZW1iZWRkZWRhcnQuZGF0YS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCBwcm9jZXNzaW5nIScpO1xyXG4gICAgICBsZXQgY29udmVydGVkSW1hZ2U6IGFueTtcclxuICAgICAgbGV0IG5ld0J1ZmZlcjogQnVmZmVyO1xyXG4gICAgICBjb25zdCBpbWdEaXIgPSBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCBzb25nX25hbWUsICdjb3Zlci5qcGcnKTtcclxuICAgICAgc3dpdGNoIChlbWJlZGRlZGFydC5mb3JtYXQudG9Mb3dlckNhc2UoKSkge1xyXG4gICAgICAgIGNhc2UgJ2ltYWdlL2JtcCc6XHJcbiAgICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdFbWJlZGRlZCBhcnQgd3JpdGluZyEnKTtcclxuICAgICAgICAgIGNvbnZlcnRlZEltYWdlID0gYXdhaXQgamltcC5yZWFkKGVtYmVkZGVkYXJ0LmRhdGEpO1xyXG4gICAgICAgICAgbmV3QnVmZmVyID0gY29udmVydGVkSW1hZ2UuZ2V0QnVmZmVyQXN5bmMoJ2ltYWdlL2pwZWcnKTtcclxuICAgICAgICAgIGZzeC53cml0ZUZpbGVTeW5jKGltZ0RpciwgbmV3QnVmZmVyKTtcclxuICAgICAgICAgIHJldHVybiBpbWdEaXI7XHJcbiAgICAgICAgY2FzZSAnaW1hZ2UvZ2lmJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgICBjYXNlICdpbWFnZS9qcGVnJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBlbWJlZGRlZGFydC5kYXRhKTtcclxuICAgICAgICAgIHJldHVybiBpbWdEaXI7XHJcbiAgICAgICAgY2FzZSAnaW1hZ2UvcG5nJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgICBjYXNlICdpbWFnZS90aWZmJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuICdOT05FJztcclxuICB9XHJcblxyXG4gIGZpbmRFbWJlZGRlZEFydChwaWN0dXJlOiBtbS5JUGljdHVyZVtdKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBpY3R1cmUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgbGV0IGN1cnJlbnRUeXBlID0gcGljdHVyZVtpXS50eXBlPy50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdjb3ZlciAoZnJvbnQpJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAnY292ZXIgYXJ0IChmcm9udCknIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdwaWMnIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdhcGljJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAnY292cicgfHxcclxuICAgICAgICBjdXJyZW50VHlwZSA9PT0gJ21ldGFkYXRhX2Jsb2NrX3BpY3R1cmUnIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICd3bS9waWN0dXJlJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAncGljdHVyZSdcclxuICAgICAgKSB7XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IGZvdW5kIScpO1xyXG4gICAgICAgIHJldHVybiBwaWN0dXJlW2ldO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuIl19