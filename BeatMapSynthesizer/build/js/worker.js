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
            fsx.copyFileSync(this.song_args.albumDir, path.join(workingDir, 'cover.jpg'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3dvcmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsdUNBQStCO0FBQy9CLDJDQUE2QjtBQUM3QixpREFBMkU7QUFDM0UsbURBQXFDO0FBQ3JDLDhDQUFnQztBQUNoQyx3RUFBK0M7QUFDL0MsMkJBQW9DO0FBQ3BDLCtCQUFvQztBQUNwQywwRUFBeUM7QUFDekMsZ0RBQXdCO0FBQ3hCLDREQUFvQztBQUVwQywyQ0FRcUI7QUFDckIsc0RBQTZCO0FBb0Q3Qjs7R0FFRztBQUNILE1BQWEsTUFBTTtJQUNqQixrQkFBa0I7SUFDVixxQkFBcUIsQ0FBNEM7SUFDakUsSUFBSSxDQUE0QjtJQUNoQyxNQUFNLENBQTRCO0lBQzFDLE9BQU8sQ0FBUztJQUNoQixtQkFBbUIsQ0FBUztJQUM1QixPQUFPLENBQVM7SUFDaEIsUUFBUSxDQUFnSjtJQUN4SixXQUFXLENBQWdCO0lBQzNCLE1BQU0sQ0FBUztJQUNmLFVBQVUsQ0FBUztJQUNuQixTQUFTLENBQVk7SUFDckIsTUFBTSxDQUFVO0lBRWhCLGNBQWM7SUFDZCxZQUNFLHFCQUFnRSxFQUNoRSxJQUErQixFQUMvQixNQUFpQztRQUVqQyxJQUFJLENBQUMscUJBQXFCLEdBQUcscUJBQXFCLENBQUM7UUFDbkQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxPQUFPLEdBQUcsY0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8s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aW1wb3J0IHsgYXBwIH0gZnJvbSAnZWxlY3Ryb24nO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3MsIGV4ZWMsIGV4ZWNGaWxlU3luYywgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgbW0gZnJvbSAnbXVzaWMtbWV0YWRhdGEnO1xyXG5pbXBvcnQgKiBhcyBmc3ggZnJvbSAnZnMtZXh0cmEnO1xyXG5pbXBvcnQgY29tcGFyZVZlcnNpb25zIGZyb20gJ2NvbXBhcmUtdmVyc2lvbnMnO1xyXG5pbXBvcnQgeyBFT0wgYXMgbmV3bGluZSB9IGZyb20gJ29zJztcclxuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XHJcbmltcG9ydCBzYW5pdGl6ZSBmcm9tICdzYW5pdGl6ZS1maWxlbmFtZSc7XHJcbmltcG9ydCBqaW1wIGZyb20gJ2ppbXAnO1xyXG5pbXBvcnQgc2VlZHJhbmRvbSBmcm9tICdzZWVkcmFuZG9tJztcclxuaW1wb3J0IF9fYmVhdE1hcEFyZ3MgZnJvbSAnLi9fX2JlYXRNYXBBcmdzJztcclxuaW1wb3J0IHtcclxuICBjbG9zZVB5dGhvblNlcnZlcixcclxuICBjb252ZXJ0TXVzaWNGaWxlLFxyXG4gIGdldEJlYXRGZWF0dXJlcyxcclxuICBnZXRFdmVudHNMaXN0LFxyXG4gIGdldE5vdGVzTGlzdCxcclxuICBnZXRPYnN0YWNsZXNMaXN0LFxyXG4gIGlzUHl0aG9uU2VydmVyUnVubmluZyxcclxufSBmcm9tICcuL3B5dGhvbkFwaSc7XHJcbmltcG9ydCBBZG1aaXAgZnJvbSAnYWRtLXppcCc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNvbmdBcmdzIHtcclxuICB3b3JraW5nRGlyOiBzdHJpbmc7XHJcbiAgYWxidW1EaXI6IHN0cmluZztcclxuICBvdXREaXI6IHN0cmluZztcclxuICBzb25nX3BhdGg6IHN0cmluZztcclxuICBzb25nX25hbWU6IHN0cmluZztcclxuICBkaWZmaWN1bHR5OiBzdHJpbmc7XHJcbiAgbW9kZWw6IHN0cmluZztcclxuICB2ZXJzaW9uOiBudW1iZXI7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBsaWdodHNJbnRlbnNpdHk6IG51bWJlcjtcclxuICB6aXBGaWxlczogbnVtYmVyO1xyXG4gIHNlZWQ6IG51bWJlcjtcclxuICBldmVudENvbG9yU3dhcE9mZnNldDogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50cyB7XHJcbiAgX3RpbWU6IG51bWJlcjtcclxuICBfdHlwZTogbnVtYmVyO1xyXG4gIF92YWx1ZTogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVzIHtcclxuICBfdGltZTogbnVtYmVyO1xyXG4gIF9saW5lSW5kZXg6IG51bWJlcjtcclxuICBfbGluZUxheWVyOiBudW1iZXI7XHJcbiAgX3R5cGU6IG51bWJlcjtcclxuICBfY3V0RGlyZWN0aW9uOiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgT2JzdGFjbGVzIHtcclxuICBfdGltZTogbnVtYmVyO1xyXG4gIF9saW5lSW5kZXg6IG51bWJlcjtcclxuICBfdHlwZTogbnVtYmVyO1xyXG4gIF9kdXJhdGlvbjogbnVtYmVyO1xyXG4gIF93aWR0aDogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRyYWNrcyB7XHJcbiAgYnBtOiBudW1iZXI7XHJcbiAgYmVhdF90aW1lczogbnVtYmVyW107XHJcbiAgeTogbnVtYmVyW107XHJcbiAgc3I6IG51bWJlcjtcclxuICBlYXN5OiB7IGV2ZW50c19saXN0OiBFdmVudHNbXTsgbm90ZXNfbGlzdDogTm90ZXNbXTsgb2JzdGFjbGVzX2xpc3Q6IE9ic3RhY2xlc1tdIH07XHJcbiAgbm9ybWFsOiB7IGV2ZW50c19saXN0OiBFdmVudHNbXTsgbm90ZXNfbGlzdDogTm90ZXNbXTsgb2JzdGFjbGVzX2xpc3Q6IE9ic3RhY2xlc1tdIH07XHJcbiAgaGFyZDogeyBldmVudHNfbGlzdDogRXZlbnRzW107IG5vdGVzX2xpc3Q6IE5vdGVzW107IG9ic3RhY2xlc19saXN0OiBPYnN0YWNsZXNbXSB9O1xyXG4gIGV4cGVydDogeyBldmVudHNfbGlzdDogRXZlbnRzW107IG5vdGVzX2xpc3Q6IE5vdGVzW107IG9ic3RhY2xlc19saXN0OiBPYnN0YWNsZXNbXSB9O1xyXG4gIGV4cGVydHBsdXM6IHsgZXZlbnRzX2xpc3Q6IEV2ZW50c1tdOyBub3Rlc19saXN0OiBOb3Rlc1tdOyBvYnN0YWNsZXNfbGlzdDogT2JzdGFjbGVzW10gfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIGBXb3JrZXJgIGlzIGEgY2xhc3MgZm9yIGNyZWF0aW5nIGhpZGRlbiBwcm9jZXNzZXMgdGhhdCBhcmUgcmVzcG9uc2libGUgZm9yIHJ1bm5pbmcgb3BlcmF0aW9ucy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBXb3JrZXIge1xyXG4gIC8vIENsYXNzIHZhcmlhYmxlc1xyXG4gIHByaXZhdGUgX2FwcGVuZE1lc3NhZ2VUYXNrTG9nOiAobWVzc2FnZTogc3RyaW5nLCBncm91cD86IHN0cmluZykgPT4gdm9pZDtcclxuICBwcml2YXRlIF9sb2c6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBfZXJyb3I6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XHJcbiAgYXBwUGF0aDogc3RyaW5nO1xyXG4gIHNjcmlwdHNJbnRlcm5hbFBhdGg6IHN0cmluZztcclxuICB0ZW1wRGlyOiBzdHJpbmc7XHJcbiAgc2V0dGluZ3M6IHsgcHl0aG9uQ21kOiBzdHJpbmc7IHB5dGhvbkV4aXN0czogYm9vbGVhbjsgbW9kdWxlc0luc3RhbGxlZDogYm9vbGVhbjsgaXNXaW5kb3dzOiBib29sZWFuOyBoYXNSZXF1aXJlZEV4dGVuc2lvbnM6IGJvb2xlYW4sIHZlcnNpb246IHN0cmluZzsgfTtcclxuICBhY3RpdmVTaGVsbD86IENoaWxkUHJvY2VzcztcclxuICBsb2dfaWQ6IHN0cmluZztcclxuICBsb2dfaGVhZGVyOiBzdHJpbmc7XHJcbiAgc29uZ19hcmdzPzogU29uZ0FyZ3M7XHJcbiAgdHJhY2tzPzogVHJhY2tzO1xyXG5cclxuICAvLyBDb25zdHJ1Y3RvclxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgX2FwcGVuZE1lc3NhZ2VUYXNrTG9nOiAobWVzc2FnZTogc3RyaW5nLCBncm91cD86IHN0cmluZykgPT4gdm9pZCxcclxuICAgIF9sb2c6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQsXHJcbiAgICBfZXJyb3I6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWRcclxuICApIHtcclxuICAgIHRoaXMuX2FwcGVuZE1lc3NhZ2VUYXNrTG9nID0gX2FwcGVuZE1lc3NhZ2VUYXNrTG9nO1xyXG4gICAgdGhpcy5fbG9nID0gX2xvZztcclxuICAgIHRoaXMuX2Vycm9yID0gX2Vycm9yO1xyXG4gICAgLy8gY3JlYXRlIHRoZSB3b3JrZXJcclxuICAgIHRoaXMuYXBwUGF0aCA9IGFwcC5nZXRBcHBQYXRoKCk7XHJcbiAgICB0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGggPSBwYXRoLmpvaW4odGhpcy5hcHBQYXRoLCAnYnVpbGQvc2NyaXB0cycpO1xyXG4gICAgdGhpcy50ZW1wRGlyID0gcGF0aC5qb2luKHByb2Nlc3MuZW52LkFQUERBVEEgPz8gcHJvY2Vzcy5jd2QoKSwgJ2JlYXQtbWFwLXN5bnRoZXNpemVyJywgJ3RlbXAnKTtcclxuICAgIHRoaXMubG9nX2lkID0gdXVpZHY0KCk7XHJcbiAgICB0aGlzLmxvZ19oZWFkZXIgPSAnJztcclxuICAgIGlmIChmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnc2V0dGluZ3MuanNvbicpKSkge1xyXG4gICAgICB0aGlzLnNldHRpbmdzID0gSlNPTi5wYXJzZShmc3gucmVhZEZpbGVTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdzZXR0aW5ncy5qc29uJyksICd1dGY4JykpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5zZXR0aW5ncyA9IHtcclxuICAgICAgICBweXRob25DbWQ6IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMidcclxuICAgICAgICAgID8gdGhpcy5weXRob25FeGlzdHMoKVxyXG4gICAgICAgICAgICA/ICdweXRob24nXHJcbiAgICAgICAgICAgIDogcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dQeTY0JywgJ3B5dGhvbi0zJywgJ3B5dGhvbi5leGUnKVxyXG4gICAgICAgICAgOiAncHl0aG9uMycsXHJcbiAgICAgICAgcHl0aG9uRXhpc3RzOiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXHJcbiAgICAgICAgICA/IHRoaXMucHl0aG9uRXhpc3RzKClcclxuICAgICAgICAgIDogdHJ1ZSxcclxuICAgICAgICBtb2R1bGVzSW5zdGFsbGVkOiBmYWxzZSxcclxuICAgICAgICBpc1dpbmRvd3M6IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicsXHJcbiAgICAgICAgaGFzUmVxdWlyZWRFeHRlbnNpb25zOiBwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInLFxyXG4gICAgICAgIHZlcnNpb246ICcwLjAuMCcsXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmNvcHlTY3JpcHRGaWxlKCk7XHJcbiAgICBpZiAodGhpcy5pc091dE9mRGF0ZSgpKSB7XHJcbiAgICAgIHRoaXMudXBkYXRlTW9kZWxGaWxlcygpO1xyXG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5pc1dpbmRvd3MpIHtcclxuICAgICAgICB0aGlzLndpbmRvd3NJbml0RmlsZXMoKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmhhc1JlcXVpcmVkRXh0ZW5zaW9ucyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncy5weXRob25FeGlzdHMgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5tb2R1bGVzSW5zdGFsbGVkKSB7XHJcbiAgICAgICAgdGhpcy5pbnN0YWxsUHl0aG9uTW9kdWxlcygpO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MubW9kdWxlc0luc3RhbGxlZCA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5zZXR0aW5ncy52ZXJzaW9uID0gYXBwLmdldFZlcnNpb24oKTtcclxuICAgICAgZnN4LndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ3NldHRpbmdzLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkodGhpcy5zZXR0aW5ncywgbnVsbCwgMikpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gQ2xhc3MgbWV0aG9kc1xyXG4gIHByaXZhdGUgbG9nKG1lc3NhZ2U6IHN0cmluZykge1xyXG4gICAgdGhpcy5fbG9nKG1lc3NhZ2UpO1xyXG4gIH1cclxuICBwcml2YXRlIGVycm9yKG1lc3NhZ2U6IHN0cmluZykge1xyXG4gICAgdGhpcy5fZXJyb3IobWVzc2FnZSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYXBwZW5kTWVzc2FnZVRhc2tMb2cobWVzc2FnZTogc3RyaW5nLCB1c2VIZWFkZXIgPSB0cnVlKSB7XHJcbiAgICB0aGlzLl9hcHBlbmRNZXNzYWdlVGFza0xvZyh1c2VIZWFkZXIgPyBgXFx0JHt0aGlzLmxvZ19oZWFkZXJ9IHwgJHttZXNzYWdlfS4uLmAgOiBtZXNzYWdlLCB0aGlzLmxvZ19pZCk7XHJcbiAgfVxyXG5cclxuICBpc091dE9mRGF0ZSgpIHtcclxuICAgIHJldHVybiBjb21wYXJlVmVyc2lvbnMuY29tcGFyZSh0aGlzLnNldHRpbmdzLnZlcnNpb24sIGFwcC5nZXRWZXJzaW9uKCksICc8Jyk7XHJcbiAgfVxyXG5cclxuICBjb3B5U2NyaXB0RmlsZSgpIHtcclxuICAgIHRoaXMubG9nKCdpbml0RmlsZXMgLSBVcGRhdGluZyBzY3JpcHQgZmlsZS4nKTtcclxuICAgIGZzeC5jb3B5U3luYyhcclxuICAgICAgcGF0aC5qb2luKHRoaXMuc2NyaXB0c0ludGVybmFsUGF0aCwgJ2JlYXRNYXBTeW50aFNlcnZlci5weScpLFxyXG4gICAgICBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnYmVhdE1hcFN5bnRoU2VydmVyLnB5JylcclxuICAgICk7XHJcbiAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gU2NyaXB0IGZpbGUgdXBkYXRlZC4nKTtcclxuICB9XHJcblxyXG4gIHVwZGF0ZU1vZGVsRmlsZXMoKSB7XHJcbiAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gVXBkYXRpbmcgbW9kZWwgZmlsZXMuJyk7XHJcbiAgICBjb25zdCBmaWxlczogc3RyaW5nW10gPSBbXHJcbiAgICAgICdjb3Zlci5qcGcnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9lYXN5X3YxLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX25vcm1hbF92MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9oYXJkX3YxLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydF92MS5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRwbHVzX3YxLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2Vhc3lfdjIucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fbm9ybWFsX3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2hhcmRfdjIucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0X3YyLnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydHBsdXNfdjIucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZWFzeV92My5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9ub3JtYWxfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1faGFyZF92My5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRfdjMucGtsJyxcclxuICAgICAgJ21vZGVscy9ITU1fZXhwZXJ0cGx1c192My5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9lYXN5X3Y0LnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX25vcm1hbF92NC5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9oYXJkX3Y0LnBrbCcsXHJcbiAgICAgICdtb2RlbHMvSE1NX2V4cGVydF92NC5wa2wnLFxyXG4gICAgICAnbW9kZWxzL0hNTV9leHBlcnRwbHVzX3Y0LnBrbCcsXHJcbiAgICBdO1xyXG5cclxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICBmc3guY29weVN5bmMocGF0aC5qb2luKHRoaXMuc2NyaXB0c0ludGVybmFsUGF0aCwgZmlsZSksIHBhdGguam9pbih0aGlzLnRlbXBEaXIsIGZpbGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5pc1dpbmRvd3MpIHtcclxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIFsnZmZtcGVnLmV4ZScsICdmZnBsYXkuZXhlJywgJ2ZmcHJvYmUuZXhlJyxdKSB7XHJcbiAgICAgICAgZnN4LmNvcHlTeW5jKHBhdGguam9pbih0aGlzLnNjcmlwdHNJbnRlcm5hbFBhdGgsIGZpbGUpLCBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCBmaWxlKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB5dGhvbkV4aXN0cygpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiAhIWV4ZWNTeW5jKCdweXRob24gLS12ZXJzaW9uJykudG9TdHJpbmcoKTtcclxuICAgIH1cclxuICAgIGNhdGNoIChlcnJvcikge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB3aW5kb3dzSW5pdEZpbGVzKCkge1xyXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLnB5dGhvbkV4aXN0cykge1xyXG4gICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuaGFzUmVxdWlyZWRFeHRlbnNpb25zKSB7XHJcbiAgICAgICAgaWYgKCFmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnV2luUHl0aG9uLmV4ZScpKSkge1xyXG4gICAgICAgICAgZnN4LmNvcHlTeW5jKFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odGhpcy5zY3JpcHRzSW50ZXJuYWxQYXRoLCAnV2luUHl0aG9uLmV4ZScpLFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnV2luUHl0aG9uLmV4ZScpXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLCAnVkNfcmVkaXN0Lng2NC5leGUnKSkpIHtcclxuICAgICAgICAgIGZzeC5jb3B5U3luYyhcclxuICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMuc2NyaXB0c0ludGVybmFsUGF0aCwgJ1ZDX3JlZGlzdC54NjQuZXhlJyksXHJcbiAgICAgICAgICAgIHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdWQ19yZWRpc3QueDY0LmV4ZScpXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIEluc3RhbGxpbmcgVkMgUmVkaXN0IDIwMTcuJyk7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGV4ZWNGaWxlU3luYyhcclxuICAgICAgICAgICAgcGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1ZDX3JlZGlzdC54NjQuZXhlJyksXHJcbiAgICAgICAgICAgIFsnL2luc3RhbGwgL3Bhc3NpdmUgL25vcmVzdGFydCddLCB7XHJcbiAgICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIHRoaXMuZXJyb3IoZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKCFmc3gucGF0aEV4aXN0c1N5bmMocGF0aC5qb2luKHRoaXMudGVtcERpciwgJ1dQeTY0JykpKSB7XHJcbiAgICAgICAgdGhpcy5sb2coJ2luaXRGaWxlcyAtIEluc3RhbGxpbmcgV2luUHl0aG9uLicpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBleGVjRmlsZVN5bmMoXHJcbiAgICAgICAgICAgIHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdXaW5QeXRob24uZXhlJyksXHJcbiAgICAgICAgICAgIFsnLW8nLCBgXCIke3BhdGguam9pbih0aGlzLnRlbXBEaXIsICdXUHk2NCcpLm5vcm1hbGl6ZSgpLnJlcGxhY2UoL1xcXFwvZ2ksICcvJyl9XCJgLCAnLXknXSwge1xyXG4gICAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLmVycm9yKGVycm9yKVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaW5zdGFsbFB5dGhvbk1vZHVsZXMoKSB7XHJcbiAgICB0aGlzLmxvZygnaW5pdEZpbGVzIC0gSW5zdGFsbGluZyBQeXRob24gcGFja2FnZXMuJyk7XHJcbiAgICB0cnkge1xyXG4gICAgICBsZXQgZGF0YSA9ICcnO1xyXG4gICAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHl0aG9uQ21kLmluY2x1ZGVzKCdweXRob24uZXhlJykpIHtcclxuICAgICAgICBkYXRhID0gZXhlY1N5bmMoXHJcbiAgICAgICAgICBgJHt0aGlzLnNldHRpbmdzLnB5dGhvbkNtZH0gLW0gcGlwIGluc3RhbGwgYXVkaW9yZWFkIGxpYnJvc2EgbnVtcHkgcGFuZGFzIHNjaXB5IHNjaWtpdC1sZWFybiBzb3VuZGZpbGUgcHlkdWIgbWFya292aWZ5IEZsYXNrIGdldmVudGAsIHtcclxuICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKS50b1N0cmluZygpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGRhdGEgPSBleGVjU3luYyhcclxuICAgICAgICAgIGBjZCAke3BhdGguZGlybmFtZSh0aGlzLnNldHRpbmdzLnB5dGhvbkNtZCl9ICYmIHB5dGhvbi5leGUgLW0gcGlwIGluc3RhbGwgYXVkaW9yZWFkIGxpYnJvc2EgbnVtcHkgcGFuZGFzIHNjaXB5IHNjaWtpdC1sZWFybiBzb3VuZGZpbGUgcHlkdWIgbWFya292aWZ5IEZsYXNrIGdldmVudGAsIHtcclxuICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKS50b1N0cmluZygpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMubG9nKGRhdGEpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5lcnJvcihlcnJvcik7XHJcbiAgICB9XHJcbiAgICB0aGlzLmxvZyhgaW5pdEZpbGVzIC0gSW5zdGFsbGVkIFB5dGhvbiBwYWNrYWdlcy5gKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGdlbmVyYXRlQmVhdE1hcHMoZGlyOiBzdHJpbmcsIGFyZ3M6IF9fYmVhdE1hcEFyZ3MpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1N0YXJ0aW5nIGJlYXRtYXAgZ2VuZXJhdGlvbicsIGZhbHNlKTtcclxuICAgIGxldCBtZXRhZGF0YTogbW0uSUF1ZGlvTWV0YWRhdGEgPSBhd2FpdCBtbS5wYXJzZUZpbGUocGF0aC5ub3JtYWxpemUoZGlyKSk7XHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdNZXRhZGF0YSBMb2FkZWQnLCBmYWxzZSk7XHJcbiAgICBsZXQgdHJhY2tuYW1lOiBzdHJpbmcgPSBzYW5pdGl6ZShtZXRhZGF0YS5jb21tb24udGl0bGUgPz8gJycpO1xyXG4gICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnU29uZyBUaXRsZSBGb3VuZCcsIGZhbHNlKTtcclxuICAgIGxldCBhcnRpc3RuYW1lOiBzdHJpbmcgPSBzYW5pdGl6ZShtZXRhZGF0YS5jb21tb24uYXJ0aXN0ID8/ICcnKTtcclxuICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0FydGlzdCBGb3VuZCcsIGZhbHNlKTtcclxuICAgIGNvbnN0IHNvbmdfbmFtZSA9IGAke3RyYWNrbmFtZX0gLSAke2FydGlzdG5hbWV9YDtcclxuICAgIHRoaXMubG9nX2hlYWRlciA9IHNvbmdfbmFtZTtcclxuICAgIGxldCBlbWJlZGRlZGFydDogbW0uSVBpY3R1cmUgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdDaGVja2luZyBpZiBiZWF0IG1hcCBhbHJlYWR5IGV4aXN0cycpO1xyXG5cclxuICAgIGxldCBiZWF0TWFwRXhpc3RzOiBib29sZWFuID1cclxuICAgICAgZnN4LmV4aXN0c1N5bmMocGF0aC5qb2luKGFyZ3Mub3V0RGlyLCBzb25nX25hbWUsICdpbmZvLmRhdCcpKSB8fFxyXG4gICAgICBmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4oYXJncy5vdXREaXIsIGAke3NvbmdfbmFtZX0uemlwYCkpO1xyXG5cclxuICAgIGlmIChiZWF0TWFwRXhpc3RzKSB7XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0JlYXQgbWFwIGV4aXN0cywgc2tpcHBpbmchJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdTZWFyY2hpbmcgZm9yIGVtYmVkZGVkIGFydCcpO1xyXG5cclxuICAgICAgaWYgKG1ldGFkYXRhLmNvbW1vbi5waWN0dXJlKSB7XHJcbiAgICAgICAgZW1iZWRkZWRhcnQgPSB0aGlzLmZpbmRFbWJlZGRlZEFydChtZXRhZGF0YS5jb21tb24ucGljdHVyZSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZzeC5lbnN1cmVEaXJTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIubm9ybWFsaXplKCksIHNvbmdfbmFtZSkpO1xyXG5cclxuICAgICAgaWYgKGVtYmVkZGVkYXJ0KSB7XHJcbiAgICAgICAgYXJncy5hbGJ1bURpciA9IGF3YWl0IHRoaXMuZXh0cmFjdEVtYmVkZGVkQXJ0KHNvbmdfbmFtZSwgZW1iZWRkZWRhcnQpO1xyXG4gICAgICAgIGFyZ3MuYWxidW1EaXIgPSBhcmdzLmFsYnVtRGlyICYmIGFyZ3MuYWxidW1EaXIgIT09ICdOT05FJ1xyXG4gICAgICAgICAgPyBhcmdzLmFsYnVtRGlyXHJcbiAgICAgICAgICA6IHBhdGguam9pbih0aGlzLnRlbXBEaXIsICdjb3Zlci5qcGcnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnU2V0dGluZyBiZWF0IG1hcCBwYXJhbWV0ZXJzJyk7XHJcblxyXG4gICAgICBpZiAoYXJncy5lbnZpcm9ubWVudCA9PT0gJ1JBTkRPTScpIHtcclxuICAgICAgICBhcmdzLmVudmlyb25tZW50ID0gdGhpcy5nZXRSYW5kb21FbnZpcm9ubWVudCgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5zb25nX2FyZ3MgPSB7XHJcbiAgICAgIHdvcmtpbmdEaXI6IGAke3RoaXMudGVtcERpci5ub3JtYWxpemUoKS5yZXBsYWNlKC9cXFxcL2dpLCAnLycpfS8ke3NvbmdfbmFtZX1gLFxyXG4gICAgICBhbGJ1bURpcjogYCR7YXJncy5hbGJ1bURpci5ub3JtYWxpemUoKS5yZXBsYWNlKC9cXFxcL2dpLCAnLycpfWAsXHJcbiAgICAgIG91dERpcjogYCR7YXJncy5vdXREaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX0vJHtzb25nX25hbWV9YCxcclxuICAgICAgc29uZ19wYXRoOiBgJHtkaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKX1gLFxyXG4gICAgICBzb25nX25hbWU6IHNvbmdfbmFtZSxcclxuICAgICAgZGlmZmljdWx0eTogYXJncy5kaWZmaWN1bHR5LFxyXG4gICAgICBtb2RlbDogYXJncy5tb2RlbCxcclxuICAgICAgdmVyc2lvbjogYXJncy52ZXJzaW9uID8/IDIsXHJcbiAgICAgIGVudmlyb25tZW50OiBhcmdzLmVudmlyb25tZW50ID8/ICdEZWZhdWx0RW52aXJvbm1lbnQnLFxyXG4gICAgICBsaWdodHNJbnRlbnNpdHk6IGFyZ3MubGlnaHRzSW50ZW5zaXR5ID8gMTEuNSAtIGFyZ3MubGlnaHRzSW50ZW5zaXR5IDogMi41LFxyXG4gICAgICB6aXBGaWxlczogYXJncy56aXBGaWxlcyxcclxuICAgICAgc2VlZDogc2VlZHJhbmRvbShzb25nX25hbWUsIHsgZW50cm9weTogdHJ1ZSB9KSgpLFxyXG4gICAgICBldmVudENvbG9yU3dhcE9mZnNldDogMi41LFxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAoIWZzeC5leGlzdHNTeW5jKHRoaXMuc29uZ19hcmdzLm91dERpcikpIHtcclxuICAgICAgZnN4LmVuc3VyZURpclN5bmModGhpcy5zb25nX2FyZ3Mub3V0RGlyKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBiYXNlTGlzdHMgPSB7XHJcbiAgICAgIGV2ZW50c19saXN0OiBbXSxcclxuICAgICAgbm90ZXNfbGlzdDogW10sXHJcbiAgICAgIG9ic3RhY2xlc19saXN0OiBbXSxcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy50cmFja3MgPSB7XHJcbiAgICAgIGJwbTogMCxcclxuICAgICAgYmVhdF90aW1lczogW10sXHJcbiAgICAgIHk6IFtdLFxyXG4gICAgICBzcjogMCxcclxuICAgICAgZWFzeTogeyAuLi5iYXNlTGlzdHMgfSxcclxuICAgICAgbm9ybWFsOiB7IC4uLmJhc2VMaXN0cyB9LFxyXG4gICAgICBoYXJkOiB7IC4uLmJhc2VMaXN0cyB9LFxyXG4gICAgICBleHBlcnQ6IHsgLi4uYmFzZUxpc3RzIH0sXHJcbiAgICAgIGV4cGVydHBsdXM6IHsgLi4uYmFzZUxpc3RzIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIGxldCBzb25nc19qc29uOiB1bmtub3duW10gPSBmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCAnc29uZ3MuanNvbicpKVxyXG4gICAgICA/IEpTT04ucGFyc2UoZnN4LnJlYWRGaWxlU3luYyhwYXRoLmpvaW4odGhpcy50ZW1wRGlyLm5vcm1hbGl6ZSgpLCAnc29uZ3MuanNvbicpKS50b1N0cmluZygpKVxyXG4gICAgICA6IFtdO1xyXG4gICAgc29uZ3NfanNvbi5wdXNoKHRoaXMuc29uZ19hcmdzKTtcclxuICAgIGZzeC53cml0ZUZpbGVTeW5jKHBhdGguam9pbih0aGlzLnRlbXBEaXIubm9ybWFsaXplKCksICdzb25ncy5qc29uJyksIEpTT04uc3RyaW5naWZ5KHNvbmdzX2pzb24sIG51bGwsIDIpKTtcclxuXHJcbiAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdHZW5lcmF0aW5nIGJlYXQgbWFwJyk7XHJcblxyXG4gICAgYXdhaXQgdGhpcy5ydW5QeXRob25TaGVsbCgpO1xyXG5cclxuICAgIGlmICh0aGlzLnNvbmdfYXJncyAmJiB0aGlzLnRyYWNrcyAmJiAoYXdhaXQgaXNQeXRob25TZXJ2ZXJSdW5uaW5nKCkpKSB7XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0xvYWRpbmcgU29uZycpO1xyXG4gICAgICBjb25zdCBtb2RlbFBhcmFtcyA9IChhd2FpdCBnZXRCZWF0RmVhdHVyZXModGhpcy5zb25nX2FyZ3Muc29uZ19wYXRoKSkuZGF0YTtcclxuICAgICAgdGhpcy50cmFja3MgPSB7XHJcbiAgICAgICAgLi4udGhpcy50cmFja3MsXHJcbiAgICAgICAgLi4ubW9kZWxQYXJhbXMsXHJcbiAgICAgIH07XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ1NvbmcgbG9hZGVkJyk7XHJcbiAgICAgIGNvbnN0IGRpZmZpY3VsdGllcyA9IChcclxuICAgICAgICB0aGlzLnNvbmdfYXJncy5kaWZmaWN1bHR5ID09PSAnYWxsJ1xyXG4gICAgICAgICAgPyBbJ2Vhc3knLCAnbm9ybWFsJywgJ2hhcmQnLCAnZXhwZXJ0JywgJ2V4cGVydHBsdXMnXVxyXG4gICAgICAgICAgOiBbdGhpcy5zb25nX2FyZ3MuZGlmZmljdWx0eV1cclxuICAgICAgKS5tYXAoZGlmZmljdWx0eSA9PiBkaWZmaWN1bHR5LnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICBsZXQgcHJvY2Vzc2VkRGlmZmljdWx0ZXM6IHN0cmluZ1tdID0gW107XHJcbiAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ01hcHBpbmcnKTtcclxuICAgICAgZm9yIChjb25zdCBkaWZmaWN1bHR5IG9mIGRpZmZpY3VsdGllcyBhcyAoJ2Vhc3knIHwgJ25vcm1hbCcgfCAnaGFyZCcgfCAnZXhwZXJ0JyB8ICdleHBlcnRwbHVzJylbXSkge1xyXG4gICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coYFByb2Nlc3NpbmcgJHtkaWZmaWN1bHR5fWApO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICB0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ub3Rlc19saXN0ID0gKFxyXG4gICAgICAgICAgICBhd2FpdCBnZXROb3Rlc0xpc3Qoe1xyXG4gICAgICAgICAgICAgIG1vZGVsOiB0aGlzLnNvbmdfYXJncy5tb2RlbCxcclxuICAgICAgICAgICAgICBkaWZmaWN1bHR5OiBkaWZmaWN1bHR5LFxyXG4gICAgICAgICAgICAgIGJlYXRfdGltZXM6IHRoaXMudHJhY2tzLmJlYXRfdGltZXMsXHJcbiAgICAgICAgICAgICAgYnBtOiB0aGlzLnRyYWNrcy5icG0sXHJcbiAgICAgICAgICAgICAgdmVyc2lvbjogdGhpcy5zb25nX2FyZ3MudmVyc2lvbixcclxuICAgICAgICAgICAgICB5OiB0aGlzLnRyYWNrcy55LFxyXG4gICAgICAgICAgICAgIHNyOiB0aGlzLnRyYWNrcy5zcixcclxuICAgICAgICAgICAgICB0ZW1wRGlyOiB0aGlzLnRlbXBEaXIsXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApLmRhdGE7XHJcblxyXG4gICAgICAgICAgaWYgKCF0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ub3Rlc19saXN0IHx8ICFBcnJheS5pc0FycmF5KHRoaXMudHJhY2tzW2RpZmZpY3VsdHldLm5vdGVzX2xpc3QpKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm90ZXMgbGlzdCB3YXMgaW52YWxpZCFcXG5cXHQke0pTT04uc3RyaW5naWZ5KHRoaXMudHJhY2tzW2RpZmZpY3VsdHldLm5vdGVzX2xpc3QpfWApO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHRoaXMudHJhY2tzW2RpZmZpY3VsdHldLmV2ZW50c19saXN0ID0gZ2V0RXZlbnRzTGlzdCh7XHJcbiAgICAgICAgICAgIG5vdGVzX2xpc3Q6IHRoaXMudHJhY2tzW2RpZmZpY3VsdHldLm5vdGVzX2xpc3QsXHJcbiAgICAgICAgICAgIGJwbTogdGhpcy50cmFja3MuYnBtLFxyXG4gICAgICAgICAgICBldmVudENvbG9yU3dhcE9mZnNldDogdGhpcy5zb25nX2FyZ3MuZXZlbnRDb2xvclN3YXBPZmZzZXQsXHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICB0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5vYnN0YWNsZXNfbGlzdCA9IGdldE9ic3RhY2xlc0xpc3Qoe1xyXG4gICAgICAgICAgICBub3Rlc19saXN0OiB0aGlzLnRyYWNrc1tkaWZmaWN1bHR5XS5ub3Rlc19saXN0LFxyXG4gICAgICAgICAgICBicG06IHRoaXMudHJhY2tzLmJwbSxcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHByb2Nlc3NlZERpZmZpY3VsdGVzLnB1c2goZGlmZmljdWx0eSk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgdGhpcy5lcnJvcihlKTtcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coYERpZmZpY3VsdHkgcHJvY2Vzc2luZyBlcnJvciwgJHtkaWZmaWN1bHR5fSBza2lwcGVkIWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKGBQcm9jZXNzaW5nICR7ZGlmZmljdWx0eX0gZG9uZSFgKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdNYXBwaW5nIGRvbmUhJyk7XHJcbiAgICAgIGlmIChwcm9jZXNzZWREaWZmaWN1bHRlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnV3JpdGluZyBmaWxlcyB0byBkaXNrJyk7XHJcbiAgICAgICAgdGhpcy53cml0ZUluZm9GaWxlKHByb2Nlc3NlZERpZmZpY3VsdGVzKTtcclxuICAgICAgICB0aGlzLndyaXRlTGV2ZWxGaWxlKHByb2Nlc3NlZERpZmZpY3VsdGVzKTtcclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdDb252ZXJ0aW5nIG11c2ljIGZpbGUnKTtcclxuICAgICAgICBhd2FpdCBjb252ZXJ0TXVzaWNGaWxlKHRoaXMuc29uZ19hcmdzLnNvbmdfcGF0aCwgdGhpcy5zb25nX2FyZ3Mud29ya2luZ0Rpcik7XHJcbiAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnWmlwcGluZyBmb2xkZXInKTtcclxuICAgICAgICB0aGlzLnppcEZpbGVzKHByb2Nlc3NlZERpZmZpY3VsdGVzKTtcclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKFxyXG4gICAgICAgICAgYCR7dGhpcy5zb25nX2FyZ3Muc29uZ19uYW1lfSB8IEZpbmlzaGVkISBcXG5cXHRMb29rIGZvciAke1xyXG4gICAgICAgICAgICB0aGlzLnNvbmdfYXJncy56aXBGaWxlcyA9PT0gMSA/ICd6aXBwZWQgZm9sZGVyJyA6ICdmb2xkZXInXHJcbiAgICAgICAgICB9IGluICR7dGhpcy5zb25nX2FyZ3Mub3V0RGlyfSwgJHtcclxuICAgICAgICAgICAgdGhpcy5zb25nX2FyZ3MuemlwRmlsZXMgPT09IDEgPyAndW56aXAgdGhlIGZvbGRlciwgJyA6ICcnXHJcbiAgICAgICAgICB9XFxuXFx0cGxhY2UgaW4gdGhlICdDdXN0b21NdXNpYycgZm9sZGVyIGluIEJlYXQgU2FiZXIncyBmaWxlcy5gLFxyXG4gICAgICAgICAgZmFsc2VcclxuICAgICAgICApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuZXJyb3IoJ1NvbmcgcHJvY2Vzc2luZyBlcnJvciEnKTtcclxuICAgICAgfVxyXG4gICAgICBhd2FpdCBjbG9zZVB5dGhvblNlcnZlcigpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5lcnJvcignUHl0aG9uIHNlcnZlciBpcyBub3QgcnVubmluZyEnKTtcclxuICAgIH1cclxuICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0dlbmVyYXRlZCBiZWF0IG1hcCEnKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgcnVuUHl0aG9uU2hlbGwoKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCBzZWxmID0gdGhpcztcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgIGlmICghdGhpcy5zb25nX2FyZ3MgfHwgIXRoaXMudHJhY2tzKSB7XHJcbiAgICAgICAgcmVqZWN0KGZhbHNlKTtcclxuICAgICAgfVxyXG4gICAgICBsZXQgX3JlbWFpbmluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgICAgY29uc3QgZmFpbGVkVG9TdGFydFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICB0aGlzLmxvZygnUHl0aG9uIHByb2Nlc3MgZmFpbGVkIHRvIHNwYXduIC0tIHRpbWVkIG91dCEnKVxyXG4gICAgICAgIHJlamVjdChmYWxzZSk7XHJcbiAgICAgIH0sIDMwMDAwKTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIHBhcnNlT3V0KGRhdGE/OiBzdHJpbmcpIHtcclxuICAgICAgICBkYXRhICYmIHNlbGYuX2xvZyhkYXRhKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZnVuY3Rpb24gcmVjZWl2ZUludGVybmFsKHRoaXM6IGFueSwgZGF0YTogc3RyaW5nIHwgQnVmZmVyLCBlbWl0VHlwZTogJ3N0ZG91dCcgfCAnc3RkZXJyJykge1xyXG4gICAgICAgIGxldCBwYXJ0cyA9ICgnJyArIGRhdGEpLnNwbGl0KG5ld2xpbmUpO1xyXG5cclxuICAgICAgICBpZiAocGFydHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICAvLyBhbiBpbmNvbXBsZXRlIHJlY29yZCwga2VlcCBidWZmZXJpbmdcclxuICAgICAgICAgIF9yZW1haW5pbmcgPSAoX3JlbWFpbmluZyB8fCAnJykgKyBwYXJ0c1swXTtcclxuICAgICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGxhc3RMaW5lID0gcGFydHMucG9wKCk7XHJcbiAgICAgICAgLy8gZml4IHRoZSBmaXJzdCBsaW5lIHdpdGggdGhlIHJlbWFpbmluZyBmcm9tIHRoZSBwcmV2aW91cyBpdGVyYXRpb24gb2YgJ3JlY2VpdmUnXHJcbiAgICAgICAgcGFydHNbMF0gPSAoX3JlbWFpbmluZyB8fCAnJykgKyBwYXJ0c1swXTtcclxuICAgICAgICAvLyBrZWVwIHRoZSByZW1haW5pbmcgZm9yIHRoZSBuZXh0IGl0ZXJhdGlvbiBvZiAncmVjZWl2ZSdcclxuICAgICAgICBfcmVtYWluaW5nID0gbGFzdExpbmU7XHJcblxyXG4gICAgICAgIHBhcnRzLmZvckVhY2goZnVuY3Rpb24gKHBhcnQpIHtcclxuICAgICAgICAgIGlmIChwYXJ0LmluY2x1ZGVzKCdSdW5uaW5nIG9uIGh0dHA6Ly8xMjcuMC4wLjE6NTAwMC8nKSkge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoZmFpbGVkVG9TdGFydFRpbWVvdXQpO1xyXG4gICAgICAgICAgICByZXNvbHZlKHRydWUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcGFyc2VPdXQocGFydCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiByZWNlaXZlU3Rkb3V0KGRhdGE6IHN0cmluZyB8IEJ1ZmZlcikge1xyXG4gICAgICAgIHJldHVybiByZWNlaXZlSW50ZXJuYWwoZGF0YSwgJ3N0ZG91dCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiByZWNlaXZlU3RkZXJyKGRhdGE6IHN0cmluZyB8IEJ1ZmZlcikge1xyXG4gICAgICAgIHJldHVybiByZWNlaXZlSW50ZXJuYWwoZGF0YSwgJ3N0ZGVycicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHl0aG9uQ21kLmluY2x1ZGVzKCdweXRob24uZXhlJykpIHtcclxuICAgICAgICB0aGlzLmFjdGl2ZVNoZWxsID0gZXhlYyhcclxuICAgICAgICAgIGAke3RoaXMuc2V0dGluZ3MucHl0aG9uQ21kfSBcIiR7cGF0aC5ub3JtYWxpemUocGF0aC5qb2luKHRoaXMudGVtcERpci5ub3JtYWxpemUoKS5yZXBsYWNlKC9cXFxcL2dpLCAnLycpLCAnL2JlYXRNYXBTeW50aFNlcnZlci5weScpKX1cImAsXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHRpbWVvdXQ6IDMwMDAwMCxcclxuICAgICAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmFjdGl2ZVNoZWxsID0gZXhlYyhcclxuICAgICAgICAgIGBjZCAke3BhdGguZGlybmFtZSh0aGlzLnNldHRpbmdzLnB5dGhvbkNtZCl9ICYmIHB5dGhvbi5leGUgXCIke3BhdGgubm9ybWFsaXplKHBhdGguam9pbih0aGlzLnRlbXBEaXIubm9ybWFsaXplKCkucmVwbGFjZSgvXFxcXC9naSwgJy8nKSwgJy9iZWF0TWFwU3ludGhTZXJ2ZXIucHknKSl9XCJgLFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB0aW1lb3V0OiAzMDAwMDAsXHJcbiAgICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwub24oJ2Nsb3NlJywgY29kZSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2coJ0ZpbmlzaGVkJyk7XHJcblxyXG4gICAgICAgIGlmICghdGhpcy5zb25nX2FyZ3MpIHtcclxuICAgICAgICAgIHRoaXMuZXJyb3IoJ1NvbmcgYXJncyB3YXMgdW5kZWZpbmVkISBFcnJvciB3aGlsZSBjbG9zaW5nIHNoZWxsIScpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGNvZGUgPT09IDApIHtcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0ZpbmlzaGVkIHN1Y2Nlc3NmdWxseSEnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZyhgRmFpbGVkIHdpdGggZXhpdCBjb2RlOiAke2NvZGV9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwuc3Rkb3V0Py5zZXRFbmNvZGluZygndXRmOCcpO1xyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLnN0ZGVycj8uc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcclxuXHJcbiAgICAgIHRoaXMuYWN0aXZlU2hlbGwuc3Rkb3V0Py5vbignZGF0YScsIGJ1ZmZlciA9PiByZWNlaXZlU3Rkb3V0KGJ1ZmZlcikpO1xyXG5cclxuICAgICAgdGhpcy5hY3RpdmVTaGVsbC5zdGRlcnI/Lm9uKCdkYXRhJywgYnVmZmVyID0+IHJlY2VpdmVTdGRlcnIoYnVmZmVyKSk7XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLm9uY2UoJ3NwYXduJywgKCkgPT4ge1xyXG4gICAgICAgIHRoaXMubG9nKCdQeXRob24gcHJvY2VzcyBzcGF3bmVkIHN1Y2Nlc3NmdWxseSEnKVxyXG4gICAgICAgIGNsZWFyVGltZW91dChmYWlsZWRUb1N0YXJ0VGltZW91dCk7XHJcbiAgICAgICAgcmVzb2x2ZSh0cnVlKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICB0aGlzLmFjdGl2ZVNoZWxsLm9uY2UoJ2Vycm9yJywgKCkgPT4ge1xyXG4gICAgICAgIHRoaXMubG9nKCdQeXRob24gcHJvY2VzcyBmYWlsZWQgdG8gc3Bhd24hJylcclxuICAgICAgICBjbGVhclRpbWVvdXQoZmFpbGVkVG9TdGFydFRpbWVvdXQpO1xyXG4gICAgICAgIHJlamVjdChmYWxzZSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVTaGVsbD8ua2lsbCgnU0lHVEVSTScpO1xyXG4gICAgICB9LCA0NTAwMDApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBraWxsU2hlbGwoKSB7XHJcbiAgICBpZiAodGhpcy5hY3RpdmVTaGVsbCkge1xyXG4gICAgICBjbG9zZVB5dGhvblNlcnZlcigpLmZpbmFsbHkoKCkgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZVNoZWxsPy5jb25uZWN0ZWQgJiYgIXRoaXMuYWN0aXZlU2hlbGwua2lsbCgnU0lHVEVSTScpKSB7XHJcbiAgICAgICAgICAvLyBLaWxscyBhIFBJRCBhbmQgYWxsIGNoaWxkIHByb2Nlc3NcclxuICAgICAgICAgIGV4ZWMoYHRhc2traWxsIC9mIC90IC9waWQgJHt0aGlzLmFjdGl2ZVNoZWxsLnBpZH1gLCAoZXJyLCBzdGRvdXQpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ3N0ZG91dCcsIHN0ZG91dCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzdGRlcnInLCBlcnIpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGRlbGV0ZSB0aGlzLmFjdGl2ZVNoZWxsO1xyXG4gICAgICB9KVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICBnZXRSYW5kb21FbnZpcm9ubWVudCgpIHtcclxuICAgIGNvbnN0IGVudmlyb25tZW50cyA9IFtcclxuICAgICAgJ0RlZmF1bHRFbnZpcm9ubWVudCcsXHJcbiAgICAgICdCaWdNaXJyb3JFbnZpcm9ubWVudCcsXHJcbiAgICAgICdPcmlnaW5zJyxcclxuICAgICAgJ05pY2VFbnZpcm9ubWVudCcsXHJcbiAgICAgICdUcmlhbmdsZUVudmlyb25tZW50JyxcclxuICAgICAgJ0tEQUVudmlyb25tZW50JyxcclxuICAgICAgJ0RyYWdvbnNFbnZpcm9ubWVudCcsXHJcbiAgICAgICdNb25zdGVyY2F0RW52aXJvbm1lbnQnLFxyXG4gICAgICAnQ3JhYlJhdmVFbnZpcm9ubWVudCcsXHJcbiAgICAgICdQYW5pY0Vudmlyb25tZW50JyxcclxuICAgICAgJ1JvY2tldEVudmlyb25tZW50JyxcclxuICAgICAgJ0dyZWVuRGF5RW52aXJvbm1lbnQnLFxyXG4gICAgICAnR3JlZW5EYXlHcmVuYWRlRW52aXJvbm1lbnQnLFxyXG4gICAgXTtcclxuICAgIHJldHVybiBlbnZpcm9ubWVudHNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZW52aXJvbm1lbnRzLmxlbmd0aCldO1xyXG4gIH1cclxuXHJcbiAgemlwRmlsZXMoZGlmZmljdWx0aWVzOiBzdHJpbmdbXSkge1xyXG4gICAgaWYgKCF0aGlzLnNvbmdfYXJncykge1xyXG4gICAgICB0aGlzLmVycm9yKCdTb25nIGFyZ3Mgd2FzIHVuZGVmaW5lZCwgY291bGQgbm90IHppcCBmaWxlcyEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHdvcmtpbmdEaXIgPSB0aGlzLnNvbmdfYXJncy53b3JraW5nRGlyO1xyXG4gICAgY29uc3Qgb3V0RGlyID0gdGhpcy5zb25nX2FyZ3Mub3V0RGlyO1xyXG4gICAgaWYgKCFmc3guZXhpc3RzU3luYyhwYXRoLmpvaW4od29ya2luZ0RpciwgJ2NvdmVyLmpwZycpKSkge1xyXG4gICAgICBmc3guY29weUZpbGVTeW5jKHRoaXMuc29uZ19hcmdzLmFsYnVtRGlyLCBwYXRoLmpvaW4od29ya2luZ0RpciwgJ2NvdmVyLmpwZycpKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGZpbGVzID0gW1xyXG4gICAgICBwYXRoLmpvaW4od29ya2luZ0RpciwgJ2luZm8uZGF0JyksXHJcbiAgICAgIHBhdGguam9pbih3b3JraW5nRGlyLCAnY292ZXIuanBnJyksXHJcbiAgICAgIHBhdGguam9pbih3b3JraW5nRGlyLCAnc29uZy5lZ2cnKSxcclxuICAgICAgLi4uZGlmZmljdWx0aWVzLm1hcChkaWZmaWN1bHR5ID0+IHBhdGguam9pbih3b3JraW5nRGlyLCBgJHtkaWZmaWN1bHR5fS5kYXRgKSksXHJcbiAgICBdO1xyXG4gICAgaWYgKHRoaXMuc29uZ19hcmdzLnppcEZpbGVzID09PSAxKSB7XHJcbiAgICAgIGNvbnN0IHppcCA9IG5ldyBBZG1aaXAoKTtcclxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XHJcbiAgICAgICAgemlwLmFkZExvY2FsRmlsZShmaWxlKTtcclxuICAgICAgICBmc3gudW5saW5rU3luYyhmaWxlKTtcclxuICAgICAgfVxyXG4gICAgICB6aXAud3JpdGVaaXAocGF0aC5qb2luKHRoaXMuc29uZ19hcmdzLm91dERpci5zdWJzdHIoMCwgdGhpcy5zb25nX2FyZ3Mub3V0RGlyLmxhc3RJbmRleE9mKCcvJykpLCBgJHt0aGlzLnNvbmdfYXJncy5zb25nX25hbWV9LnppcGApKTtcclxuICAgICAgZnN4LnJtZGlyU3luYyh3b3JraW5nRGlyKTtcclxuICAgICAgZnN4LnJtZGlyU3luYyh0aGlzLnNvbmdfYXJncy5vdXREaXIpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XHJcbiAgICAgICAgZnN4LmNvcHlGaWxlU3luYyhmaWxlLCBwYXRoLnJlc29sdmUob3V0RGlyLCBwYXRoLmJhc2VuYW1lKGZpbGUpKSk7XHJcbiAgICAgICAgZnN4LnVubGlua1N5bmMoZmlsZSk7XHJcbiAgICAgIH1cclxuICAgICAgZnN4LnJtZGlyU3luYyh3b3JraW5nRGlyKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHdyaXRlTGV2ZWxGaWxlKGRpZmZpY3VsdGllczogc3RyaW5nW10pIHtcclxuICAgIGlmICghdGhpcy5zb25nX2FyZ3MpIHtcclxuICAgICAgdGhpcy5lcnJvcignU29uZyBhcmdzIHdhcyB1bmRlZmluZWQsIGNvdWxkIG5vdCB3cml0ZSBsZXZlbCBmaWxlIScpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMudHJhY2tzKSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoJ1RyYWNrcyB3YXMgdW5kZWZpbmVkLCBjb3VsZCBub3Qgd3JpdGUgbGV2ZWwgZmlsZSEnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgd29ya2luZ0RpciA9IHRoaXMuc29uZ19hcmdzLndvcmtpbmdEaXI7XHJcbiAgICBjb25zdCB0cmFja3MgPSB0aGlzLnRyYWNrcztcclxuICAgIGZvciAoY29uc3QgZGlmZmljdWx0eSBvZiBkaWZmaWN1bHRpZXMpIHtcclxuICAgICAgY29uc3QgbGV2ZWwgPSB7XHJcbiAgICAgICAgX3ZlcnNpb246ICcyLjAuMCcsXHJcbiAgICAgICAgX2N1c3RvbURhdGE6IHtcclxuICAgICAgICAgIF90aW1lOiAnJywgLy8gbm90IHN1cmUgd2hhdCB0aW1lIHJlZmVycyB0b1xyXG4gICAgICAgICAgX0JQTUNoYW5nZXM6IFtdLFxyXG4gICAgICAgICAgX2Jvb2ttYXJrczogW10sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBfZXZlbnRzOiB0cmFja3NbZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpXVsnZXZlbnRzX2xpc3QnXSxcclxuICAgICAgICBfbm90ZXM6IHRyYWNrc1tkaWZmaWN1bHR5LnRvTG93ZXJDYXNlKCldWydub3Rlc19saXN0J10sXHJcbiAgICAgICAgX29ic3RhY2xlczogdHJhY2tzW2RpZmZpY3VsdHkudG9Mb3dlckNhc2UoKV1bJ29ic3RhY2xlc19saXN0J10sXHJcbiAgICAgIH07XHJcbiAgICAgIGZzeC53cml0ZUpTT05TeW5jKHBhdGguam9pbih3b3JraW5nRGlyLCBgJHtkaWZmaWN1bHR5LnRvTG93ZXJDYXNlKCl9LmRhdGApLCBsZXZlbCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB3cml0ZUluZm9GaWxlKGRpZmZpY3VsdGllcz86IHN0cmluZ1tdKSB7XHJcbiAgICBpZiAoIXRoaXMuc29uZ19hcmdzKSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoJ1NvbmcgYXJncyB3YXMgdW5kZWZpbmVkLCBjb3VsZCBub3Qgd3JpdGUgaW5mbyBmaWxlIScpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMudHJhY2tzKSB7XHJcbiAgICAgIHRoaXMuZXJyb3IoJ1RyYWNrcyB3YXMgdW5kZWZpbmVkLCBjb3VsZCBub3Qgd3JpdGUgaW5mbyBmaWxlIScpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpbnRlcmZhY2UgQmVhdE1hcEluZm8ge1xyXG4gICAgICBfZGlmZmljdWx0eTogc3RyaW5nO1xyXG4gICAgICBfZGlmZmljdWx0eVJhbms6IG51bWJlcjtcclxuICAgICAgX2JlYXRtYXBGaWxlbmFtZTogc3RyaW5nO1xyXG4gICAgICBfbm90ZUp1bXBNb3ZlbWVudFNwZWVkOiBudW1iZXI7XHJcbiAgICAgIF9ub3RlSnVtcFN0YXJ0QmVhdE9mZnNldDogbnVtYmVyO1xyXG4gICAgICBfY3VzdG9tRGF0YToge307XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5OiBCZWF0TWFwSW5mb1tdID0gW107XHJcblxyXG4gICAgY29uc3QgZ2V0QmVhdG1hcEluZm8gPSAoZGlmZmljdWx0eTogc3RyaW5nLCByYW5rOiBudW1iZXIsIG1vdmVtZW50U3BlZWQ6IG51bWJlcik6IEJlYXRNYXBJbmZvID0+IHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBfZGlmZmljdWx0eTogZGlmZmljdWx0eSxcclxuICAgICAgICBfZGlmZmljdWx0eVJhbms6IHJhbmssXHJcbiAgICAgICAgX2JlYXRtYXBGaWxlbmFtZTogYCR7ZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpfS5kYXRgLFxyXG4gICAgICAgIF9ub3RlSnVtcE1vdmVtZW50U3BlZWQ6IG1vdmVtZW50U3BlZWQsXHJcbiAgICAgICAgX25vdGVKdW1wU3RhcnRCZWF0T2Zmc2V0OiAwLFxyXG4gICAgICAgIF9jdXN0b21EYXRhOiB7fSxcclxuICAgICAgfTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZWFzeUJlYXRtYXBJbmZvID0gZ2V0QmVhdG1hcEluZm8oJ0Vhc3knLCAxLCA4KTtcclxuICAgIGNvbnN0IG5vcm1hbEJlYXRtYXBJbmZvID0gZ2V0QmVhdG1hcEluZm8oJ05vcm1hbCcsIDMsIDEwKTtcclxuICAgIGNvbnN0IGhhcmRCZWF0bWFwSW5mbyA9IGdldEJlYXRtYXBJbmZvKCdIYXJkJywgNSwgMTIpO1xyXG4gICAgY29uc3QgZXhwZXJ0QmVhdG1hcEluZm8gPSBnZXRCZWF0bWFwSW5mbygnRXhwZXJ0JywgNywgMTQpO1xyXG4gICAgY29uc3QgZXhwZXJ0cGx1c0JlYXRtYXBJbmZvID0gZ2V0QmVhdG1hcEluZm8oJ0V4cGVydFBsdXMnLCA5LCAxNik7XHJcblxyXG4gICAgY29uc3QgYmVhdG1hcEluZm8gPSB7XHJcbiAgICAgIGVhc3k6IGVhc3lCZWF0bWFwSW5mbyxcclxuICAgICAgbm9ybWFsOiBub3JtYWxCZWF0bWFwSW5mbyxcclxuICAgICAgaGFyZDogaGFyZEJlYXRtYXBJbmZvLFxyXG4gICAgICBleHBlcnQ6IGV4cGVydEJlYXRtYXBJbmZvLFxyXG4gICAgICBleHBlcnRwbHVzOiBleHBlcnRwbHVzQmVhdG1hcEluZm8sXHJcbiAgICB9O1xyXG5cclxuICAgIHN3aXRjaCAodGhpcy5zb25nX2FyZ3MuZGlmZmljdWx0eS50b0xvd2VyQ2FzZSgpKSB7XHJcbiAgICAgIGNhc2UgJ2Vhc3knOlxyXG4gICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW2Vhc3lCZWF0bWFwSW5mb107XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgJ25vcm1hbCc6XHJcbiAgICAgICAgZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXkgPSBbbm9ybWFsQmVhdG1hcEluZm9dO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdoYXJkJzpcclxuICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IFtoYXJkQmVhdG1hcEluZm9dO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdleHBlcnQnOlxyXG4gICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW2V4cGVydEJlYXRtYXBJbmZvXTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnZXhwZXJ0cGx1cyc6XHJcbiAgICAgICAgZGlmZmljdWx0eUJlYXRtYXBJbmZvQXJyYXkgPSBbZXhwZXJ0cGx1c0JlYXRtYXBJbmZvXTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBpZiAoZGlmZmljdWx0aWVzKSB7XHJcbiAgICAgICAgICBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSA9IGRpZmZpY3VsdGllcy5tYXAoZGlmZktleSA9PiBiZWF0bWFwSW5mb1tkaWZmS2V5XSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGRpZmZpY3VsdHlCZWF0bWFwSW5mb0FycmF5ID0gW1xyXG4gICAgICAgICAgICBlYXN5QmVhdG1hcEluZm8sXHJcbiAgICAgICAgICAgIG5vcm1hbEJlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgICBoYXJkQmVhdG1hcEluZm8sXHJcbiAgICAgICAgICAgIGV4cGVydEJlYXRtYXBJbmZvLFxyXG4gICAgICAgICAgICBleHBlcnRwbHVzQmVhdG1hcEluZm8sXHJcbiAgICAgICAgICBdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBfYXJ0aXN0ID0gdGhpcy5zb25nX2FyZ3Muc29uZ19uYW1lLnNwbGl0KCcgLSAnKVt0aGlzLnNvbmdfYXJncy5zb25nX25hbWUuc3BsaXQoJyAtICcpLmxlbmd0aCAtIDFdO1xyXG4gICAgY29uc3QgaW5mbyA9IHtcclxuICAgICAgX3ZlcnNpb246ICcyLjAuMCcsXHJcbiAgICAgIF9zb25nTmFtZTogdGhpcy5zb25nX2FyZ3Muc29uZ19uYW1lLFxyXG4gICAgICBfc29uZ1N1Yk5hbWU6ICcnLFxyXG4gICAgICBfc29uZ0F1dGhvck5hbWU6IF9hcnRpc3QsXHJcbiAgICAgIF9sZXZlbEF1dGhvck5hbWU6ICdCZWF0TWFwU3ludGgnLFxyXG4gICAgICBfYmVhdHNQZXJNaW51dGU6IE1hdGguZmxvb3IodGhpcy50cmFja3MuYnBtKSxcclxuICAgICAgX3NvbmdUaW1lT2Zmc2V0OiAwLFxyXG4gICAgICBfc2h1ZmZsZTogMCxcclxuICAgICAgX3NodWZmbGVQZXJpb2Q6IDAsXHJcbiAgICAgIF9wcmV2aWV3U3RhcnRUaW1lOiAxMCxcclxuICAgICAgX3ByZXZpZXdEdXJhdGlvbjogMzAsXHJcbiAgICAgIF9zb25nRmlsZW5hbWU6ICdzb25nLmVnZycsXHJcbiAgICAgIF9jb3ZlckltYWdlRmlsZW5hbWU6ICdjb3Zlci5qcGcnLFxyXG4gICAgICBfZW52aXJvbm1lbnROYW1lOiB0aGlzLnNvbmdfYXJncy5lbnZpcm9ubWVudCxcclxuICAgICAgX2N1c3RvbURhdGE6IHt9LFxyXG4gICAgICBfZGlmZmljdWx0eUJlYXRtYXBTZXRzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgX2JlYXRtYXBDaGFyYWN0ZXJpc3RpY05hbWU6ICdTdGFuZGFyZCcsXHJcbiAgICAgICAgICBfZGlmZmljdWx0eUJlYXRtYXBzOiBkaWZmaWN1bHR5QmVhdG1hcEluZm9BcnJheSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfTtcclxuXHJcbiAgICBmc3gud3JpdGVKU09OU3luYyhwYXRoLmpvaW4odGhpcy5zb25nX2FyZ3Mud29ya2luZ0RpciwgJ2luZm8uZGF0JyksIGluZm8pO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZXh0cmFjdEVtYmVkZGVkQXJ0KHNvbmdfbmFtZTogc3RyaW5nLCBlbWJlZGRlZGFydDogbW0uSVBpY3R1cmUpIHtcclxuICAgIGlmIChlbWJlZGRlZGFydC5kYXRhLmxlbmd0aCA+IDApIHtcclxuICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IHByb2Nlc3NpbmchJyk7XHJcbiAgICAgIGxldCBjb252ZXJ0ZWRJbWFnZTogYW55O1xyXG4gICAgICBsZXQgbmV3QnVmZmVyOiBCdWZmZXI7XHJcbiAgICAgIGNvbnN0IGltZ0RpciA9IHBhdGguam9pbih0aGlzLnRlbXBEaXIubm9ybWFsaXplKCksIHNvbmdfbmFtZSwgJ2NvdmVyLmpwZycpO1xyXG4gICAgICBzd2l0Y2ggKGVtYmVkZGVkYXJ0LmZvcm1hdC50b0xvd2VyQ2FzZSgpKSB7XHJcbiAgICAgICAgY2FzZSAnaW1hZ2UvYm1wJzpcclxuICAgICAgICAgIHRoaXMuYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0VtYmVkZGVkIGFydCB3cml0aW5nIScpO1xyXG4gICAgICAgICAgY29udmVydGVkSW1hZ2UgPSBhd2FpdCBqaW1wLnJlYWQoZW1iZWRkZWRhcnQuZGF0YSk7XHJcbiAgICAgICAgICBuZXdCdWZmZXIgPSBjb252ZXJ0ZWRJbWFnZS5nZXRCdWZmZXJBc3luYygnaW1hZ2UvanBlZycpO1xyXG4gICAgICAgICAgZnN4LndyaXRlRmlsZVN5bmMoaW1nRGlyLCBuZXdCdWZmZXIpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgICBjYXNlICdpbWFnZS9naWYnOlxyXG4gICAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IHdyaXRpbmchJyk7XHJcbiAgICAgICAgICBjb252ZXJ0ZWRJbWFnZSA9IGF3YWl0IGppbXAucmVhZChlbWJlZGRlZGFydC5kYXRhKTtcclxuICAgICAgICAgIG5ld0J1ZmZlciA9IGNvbnZlcnRlZEltYWdlLmdldEJ1ZmZlckFzeW5jKCdpbWFnZS9qcGVnJyk7XHJcbiAgICAgICAgICBmc3gud3JpdGVGaWxlU3luYyhpbWdEaXIsIG5ld0J1ZmZlcik7XHJcbiAgICAgICAgICByZXR1cm4gaW1nRGlyO1xyXG4gICAgICAgIGNhc2UgJ2ltYWdlL2pwZWcnOlxyXG4gICAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IHdyaXRpbmchJyk7XHJcbiAgICAgICAgICBmc3gud3JpdGVGaWxlU3luYyhpbWdEaXIsIGVtYmVkZGVkYXJ0LmRhdGEpO1xyXG4gICAgICAgICAgcmV0dXJuIGltZ0RpcjtcclxuICAgICAgICBjYXNlICdpbWFnZS9wbmcnOlxyXG4gICAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IHdyaXRpbmchJyk7XHJcbiAgICAgICAgICBjb252ZXJ0ZWRJbWFnZSA9IGF3YWl0IGppbXAucmVhZChlbWJlZGRlZGFydC5kYXRhKTtcclxuICAgICAgICAgIG5ld0J1ZmZlciA9IGNvbnZlcnRlZEltYWdlLmdldEJ1ZmZlckFzeW5jKCdpbWFnZS9qcGVnJyk7XHJcbiAgICAgICAgICBmc3gud3JpdGVGaWxlU3luYyhpbWdEaXIsIG5ld0J1ZmZlcik7XHJcbiAgICAgICAgICByZXR1cm4gaW1nRGlyO1xyXG4gICAgICAgIGNhc2UgJ2ltYWdlL3RpZmYnOlxyXG4gICAgICAgICAgdGhpcy5hcHBlbmRNZXNzYWdlVGFza0xvZygnRW1iZWRkZWQgYXJ0IHdyaXRpbmchJyk7XHJcbiAgICAgICAgICBjb252ZXJ0ZWRJbWFnZSA9IGF3YWl0IGppbXAucmVhZChlbWJlZGRlZGFydC5kYXRhKTtcclxuICAgICAgICAgIG5ld0J1ZmZlciA9IGNvbnZlcnRlZEltYWdlLmdldEJ1ZmZlckFzeW5jKCdpbWFnZS9qcGVnJyk7XHJcbiAgICAgICAgICBmc3gud3JpdGVGaWxlU3luYyhpbWdEaXIsIG5ld0J1ZmZlcik7XHJcbiAgICAgICAgICByZXR1cm4gaW1nRGlyO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gJ05PTkUnO1xyXG4gIH1cclxuXHJcbiAgZmluZEVtYmVkZGVkQXJ0KHBpY3R1cmU6IG1tLklQaWN0dXJlW10pIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGljdHVyZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICBsZXQgY3VycmVudFR5cGUgPSBwaWN0dXJlW2ldLnR5cGU/LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgIGlmIChcclxuICAgICAgICBjdXJyZW50VHlwZSA9PT0gJ2NvdmVyIChmcm9udCknIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdjb3ZlciBhcnQgKGZyb250KScgfHxcclxuICAgICAgICBjdXJyZW50VHlwZSA9PT0gJ3BpYycgfHxcclxuICAgICAgICBjdXJyZW50VHlwZSA9PT0gJ2FwaWMnIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdjb3ZyJyB8fFxyXG4gICAgICAgIGN1cnJlbnRUeXBlID09PSAnbWV0YWRhdGFfYmxvY2tfcGljdHVyZScgfHxcclxuICAgICAgICBjdXJyZW50VHlwZSA9PT0gJ3dtL3BpY3R1cmUnIHx8XHJcbiAgICAgICAgY3VycmVudFR5cGUgPT09ICdwaWN0dXJlJ1xyXG4gICAgICApIHtcclxuICAgICAgICB0aGlzLmFwcGVuZE1lc3NhZ2VUYXNrTG9nKCdFbWJlZGRlZCBhcnQgZm91bmQhJyk7XHJcbiAgICAgICAgcmV0dXJuIHBpY3R1cmVbaV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG4iXX0=