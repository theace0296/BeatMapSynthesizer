// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, dialog, ProgressBarOptions } from 'electron';
import * as path from "path";
import { execFile, exec, ChildProcess } from 'child_process';
import * as mm from 'music-metadata';
import * as fsx from 'fs-extra';
import * as compareVersions from 'compare-versions';
import { EOL as newline, cpus, totalmem } from 'os';
import { isNullOrUndefined } from 'util';
import sanitize from 'sanitize-filename';
import jimp from 'jimp';

/**
 * __beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
class __beatMapArgs {
    dir: string;
    difficulty: string;
    model: string;
    version: number;
    outDir: string;
    zipFiles: number;
    environment: string;
    lightsIntensity: number;
    albumDir: string;

    debug: number;

    constructor() {
        this.dir = '';
        this.difficulty = 'all';
        this.model = 'random';
        this.version = 2;
        this.outDir = process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH;
        this.zipFiles = 0;
        this.environment = 'RANDOM';
        this.lightsIntensity = 9;
        this.albumDir = "NONE";

        this.debug = 0;
    }
}

/**
 * `__coreCount` is the 'usable' cores for running multiple beat map generations at once.
 * It is based off of the average system resource usage and will fallback to one processes at a time
 * if system resources are not plentiful.
 * Reserve half the cores, if possible, for system usage.
 * 2147483648 is 2GB in Bytes.
 */
const __coreCount: number = (() => {
    // Temp lower core count for multitasking
    return 2;
    let workingCores: number = cpus().length > 2 ? Math.floor(cpus().length / 2) : 1;
    if (totalmem() >= (workingCores * 2147483648)) {
        return workingCores;
    }
    else if ((totalmem() / 2147483648) <= workingCores) {
        return Math.floor(totalmem() / 2147483648);
    }
    return workingCores;
})();

/**
 * `worker` is a class for creating hidden processes that are responsible for running operations.
 */
class worker {
    // Class variables
    appPath: string;
    appVersion: string;
    scriptsInternalPath: string;
    tempDir: string;
    pythonExePath: string;
    shellsRunning: number;
    activeShells: ChildProcess[];

    // Constructor
    constructor() {
        // create the worker
        this.appPath = app.getAppPath();
        this.appVersion = app.getVersion();
        this.scriptsInternalPath = path.join(this.appPath, "build/scripts");
        this.tempDir = path.join(process.env.APPDATA, 'beat-map-synthesizer', 'temp');
        this.pythonExePath = path.join(this.tempDir, "beatmapsynth.exe");
        this.shellsRunning = 0;
        this.activeShells = [];
    }

    // Class methods
    async initFiles(): Promise<boolean> {
        return new Promise(resolve => {
            fsx.copySync(path.join(this.scriptsInternalPath, 'beatmapsynth.exe'), path.join(this.tempDir, 'beatmapsynth.exe'));
            let updateFiles = false;
            if (!fsx.existsSync(path.join(this.tempDir, 'version.txt'))) {
                updateFiles = true;
            }
            else if (compareVersions.compare(fsx.readFileSync(path.join(this.tempDir, 'version.txt')).toString(), this.appVersion, '<')) {
                updateFiles = true;
            }

            if (updateFiles) {
                fsx.writeFile(path.join(this.tempDir, 'version.txt'), this.appVersion)
                    .then(() => {
                        let files: string[] = ["cover.jpg", "ffmpeg.exe", "ffplay.exe", "ffprobe.exe",
                            "models/HMM_easy_v1.pkl", "models/HMM_normal_v1.pkl", "models/HMM_hard_v1.pkl", "models/HMM_expert_v1.pkl", "models/HMM_expertPlus_v1.pkl",
                            "models/HMM_easy_v2.pkl", "models/HMM_normal_v2.pkl", "models/HMM_hard_v2.pkl", "models/HMM_expert_v2.pkl", "models/HMM_expertPlus_v2.pkl", 
                            "models/HMM_easy_v3.pkl", "models/HMM_normal_v3.pkl", "models/HMM_hard_v3.pkl", "models/HMM_expert_v3.pkl", "models/HMM_expertPlus_v3.pkl",
                            "models/HMM_easy_v4.pkl", "models/HMM_normal_v4.pkl", "models/HMM_hard_v4.pkl", "models/HMM_expert_v4.pkl", "models/HMM_expertPlus_v4.pkl"];

                        for (let file of files) {
                            fsx.copySync(path.join(this.scriptsInternalPath, file), path.join(this.tempDir, file));
                        }
                    })
                    .then(() => {
                        resolve(updateFiles);
                    });
            }
            else {
                resolve(updateFiles);
            }
        });
    }

    async generateBeatMaps(dir: string, args: __beatMapArgs): Promise<boolean> {
        _log('generateBeatMaps - Start');
        let metadata: mm.IAudioMetadata = await mm.parseFile(dir);
        _log('generateBeatMaps - Metadata Loaded');
        let trackname: string = sanitize(metadata.common.title);
        _log('generateBeatMaps - Song Title Found');
        let artistname: string = sanitize(metadata.common.artist);
        _log('generateBeatMaps - Artist Found');
        let embeddedart: mm.IPicture = null;

        _log('generateBeatMaps - Checking if beat map exists');

        let beatMapExists: boolean = (fsx.existsSync(path.join(args.outDir, `${trackname} - ${artistname}`, 'info.dat')) || fsx.existsSync(path.join(args.outDir, `${trackname} - ${artistname}.zip`)));

        if (beatMapExists) {
            _log('generateBeatMaps - Beat map exists, skipping!');
        }
        else {
            _log('generateBeatMaps - Searching for embedded art');

            if (!isNullOrUndefined(metadata.common.picture)) {
                for (let i = 0; i < metadata.common.picture.length; i++) {
                    let currentType = metadata.common.picture[i].type.toLowerCase();
                    if (currentType == 'cover (front)' || currentType == 'cover art (front)' ||
                        currentType == 'pic' || currentType == 'apic' || currentType == 'covr' ||
                        currentType == 'metadata_block_picture' || currentType == 'wm/picture' ||
                        currentType == 'picture') {
                        embeddedart = metadata.common.picture[i];
                        _log('generateBeatMaps - Embedded art found!');
                        break;
                    }
                }
            }

            fsx.mkdirSync(path.join(this.tempDir.normalize(), `${trackname} - ${artistname}`));

            _log('generateBeatMaps - Search for embedded art finished');

            if (!isNullOrUndefined(embeddedart)) {
                if (embeddedart.data.length > 0) {
                    _log('generateBeatMaps - Embedded art processing!');
                    let convertedImage: any;
                    let newBuffer: Buffer;
                    const imgDir = path.join(this.tempDir.normalize(), `${trackname} - ${artistname}`, 'cover.jpg');
                    switch (embeddedart.format.toLowerCase()) {
                        case 'image/bmp':
                            _log('generateBeatMaps - Embedded art writing!');
                            convertedImage = await jimp.read(embeddedart.data);
                            newBuffer = convertedImage.getBufferAsync('image/jpeg');
                            fsx.writeFileSync(imgDir, newBuffer);
                            args.albumDir = imgDir;
                            break;
                        case 'image/gif':
                            _log('generateBeatMaps - Embedded art writing!');
                            convertedImage = await jimp.read(embeddedart.data);
                            newBuffer = convertedImage.getBufferAsync('image/jpeg');
                            fsx.writeFileSync(imgDir, newBuffer);
                            args.albumDir = imgDir;
                            break;
                        case 'image/jpeg':
                            _log('generateBeatMaps - Embedded art writing!');
                            fsx.writeFileSync(imgDir, embeddedart.data);
                            args.albumDir = imgDir;
                            break;
                        case 'image/png':
                            _log('generateBeatMaps - Embedded art writing!');
                            convertedImage = await jimp.read(embeddedart.data);
                            newBuffer = convertedImage.getBufferAsync('image/jpeg');
                            fsx.writeFileSync(imgDir, newBuffer);
                            args.albumDir = imgDir;
                            break;
                        case 'image/tiff':
                            _log('generateBeatMaps - Embedded art writing!');
                            convertedImage = await jimp.read(embeddedart.data);
                            newBuffer = convertedImage.getBufferAsync('image/jpeg');
                            fsx.writeFileSync(imgDir, newBuffer);
                            args.albumDir = imgDir;
                            break;
                    }
                }
            }

            _log('generateBeatMaps - Setting beat map parameters');

            if (args.environment == 'RANDOM') {
                let environments = ["DefaultEnvironment", "BigMirrorEnvironment", "Origins", "NiceEnvironment", "TriangleEnvironment", "KDAEnvironment", "DragonsEnvironment",
                    "MonstercatEnvironment", "CrabRaveEnvironment", "PanicEnvironment", "RocketEnvironment", "GreenDayEnvironment", "GreenDayGrenadeEnvironment"];
                args.environment = environments[Math.floor(Math.random() * environments.length)];
            }
        }

        let temp_args: string[] = [
            `"${dir.normalize().replace(/\\/gi, "/")}"`,
            `"${trackname} - ${artistname}"`,
            `"${args.difficulty}"`,
            `"${args.model}"`,
            '--version', args.version.toString(),
            '--environment', `"${args.environment}"`,
            '--lightsIntensity', args.lightsIntensity.toString(),
            '--albumDir', `"${args.albumDir.normalize().replace(/\\/gi, "/")}"`,
            '--workingDir', `"${this.tempDir.normalize().replace(/\\/gi, "/")}"`,
            '--outDir', `"${args.outDir.normalize().replace(/\\/gi, "/")}"`,
            '--zipFiles', args.zipFiles.toString(),
            '--debug', args.debug.toString()
        ];

        return new Promise(resolve => {
            if (!beatMapExists) {
                let _remaining: string;

                function parseOut(data: string) {
                    if (!data)
                        return '';
                    _appendMessageTaskLog(data, `${trackname}${artistname}`.replace(/[^\w\d]/gi, "").toLowerCase().toString());
                };

                function parseErr(data: string) {
                    if (!data)
                        return '';
                    _log(data);
                };

                function receiveInternal(data: string | Buffer, emitType: 'stdout' | 'stderr') {
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
                        if (emitType == 'stdout')
                            parseOut(part);
                        else if (emitType == 'stderr')
                            parseErr(part);
                    });

                    return this;
                };

                function receiveStdout(data: string | Buffer) {
                    return receiveInternal(data, 'stdout');
                };

                function receiveStderr(data: string | Buffer) {
                    return receiveInternal(data, 'stderr');
                };

                _log('generateBeatMaps - Generating beat map');

                const shell = execFile(this.pythonExePath, temp_args, { windowsVerbatimArguments: true, timeout: 300000 });
                this.activeShells.push(shell);

                shell.on('close', (code) => {
                    _log('generateBeatMaps - Finished');
                    if (fsx.existsSync(path.join(this.tempDir.normalize(), `${trackname} - ${artistname}`, 'cover.jpg')))
                        fsx.unlinkSync(path.join(this.tempDir.normalize(), `${trackname} - ${artistname}`, 'cover.jpg'));
                    if (fsx.existsSync(path.join(this.tempDir.normalize().normalize(), `${trackname} - ${artistname}`)))
                        fsx.rmdirSync(path.join(this.tempDir.normalize().normalize(), `${trackname} - ${artistname}`));
                    --this.shellsRunning;
                    _appendMessageTaskLog(`${trackname} - ${artistname} | Finished with exit code: ${code}`, `${trackname}${artistname}`.replace(/[^\w\d]/gi, "").toLowerCase().toString());
                    resolve(true);
                });

                shell.stdout.setEncoding('utf8');
                shell.stderr.setEncoding('utf8');

                shell.stdout.on('data', (buffer) => receiveStdout(buffer));

                shell.stderr.on('data', (buffer) => receiveStderr(buffer));

                setTimeout(() => {
                    shell.kill('SIGTERM');
                }, 450000)

            }
            else {
                --this.shellsRunning;
                resolve(true);
            }
        });
    }

    async killAllShells() {
        return new Promise(resolve => {
            let shellsKilledSuccessfully: number = 0;
            for (let shell of this.activeShells) {
                shell.kill('SIGTERM');

                // Kills a PID and all child process
                exec(`taskkill /f /t /pid ${shell.pid}`, (err, stdout) => {
                    console.log('stdout', stdout)
                    console.log('stderr', err)
                });

                if (shell.killed) {
                    shellsKilledSuccessfully++;
                }
            }

            // Kills a process based on filename of the exe and all child processes
            exec(`taskkill /f /t /im beatmapsynth.exe`, (err, stdout) => {
                console.log('stdout', stdout)
                console.log('stderr', err)
            });

            if (shellsKilledSuccessfully === this.activeShells.length) {
                this.activeShells.length = 0;
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    }
}

/**
 * `__mainWindow` is the render process window the user interacts with.
 */
let __mainWindow: Electron.BrowserWindow;

/**
 * `__mainWorker` is the worker class that runs the operations.
 */
const __mainWorker = new worker();

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', async () => {
    _createMainWindow();
    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0)
            _createMainWindow();
    });
    __mainWorker.initFiles();
})

/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    __mainWorker.killAllShells();
    if (process.platform !== 'darwin')
        app.quit();
})

/**
 * `_createMainWindow()` is responsible for the initial creation of the main window.
 */
function _createMainWindow() {
    // Create the browser window.
    __mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(app.getAppPath(), 'preload.js')
        }
    });

    // and load the index.html of the app.
    __mainWindow.loadFile(path.join(app.getAppPath(), "index.html"));

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()

    // Emitted when the window is closed.
    __mainWindow.on("closed", () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        __mainWindow = null;
    });

}

/**
 * `_log()` is responsible for sending log messages to the Chromium Console.
 * @param message  The message to be sent to the console.
 */
function _log(message: string) {
    __mainWindow.webContents.send('console-log', message);
}

/**
 * `_error()` is responsible for sending error messages to the Chromium Console.
 * @param message  The message to be sent to the console.
 */
function _error(message: string) {
    __mainWindow.webContents.send('console-error', message);
}

/**
 * `_updateTaskProgress` is responsible for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 * @param options The options to pass to the progress bar, the default is { mode: 'normal' }
 */
function _updateTaskProgress(value: number, maxValue: number, options: ProgressBarOptions = { mode: 'normal' }) {
    __mainWindow.webContents.send('task-progress', value, maxValue);
    if ((value / maxValue) < 1)
        __mainWindow.setProgressBar(value / maxValue, options);
    else
        __mainWindow.setProgressBar(-1);
}

/**
 * `_appendMessageTaskLog` is responsible for sending
 * log messages to the task log element the user sees.
 * @param message  The message to be sent to the task log.
 */
function _appendMessageTaskLog(message: string, group: string="MAIN") {
    __mainWindow.webContents.send('task-log-append-message', message, group)
};

/**
 * `_findFilesInDir` is a function that recursively searches the files that match a filter in a directory
 * and runs a callback on each file.
 * @param startPath The top-most level to start the search in.
 * @param filter A regular expression filter to filter the search results.
 * @param callback A function to have run on each file.
 */
function _findFilesInDir(startPath: string, filter: RegExp, callback: Function) {
    const files = fsx.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fsx.lstatSync(filename);
        if (stat.isDirectory()) {
            _findFilesInDir(filename, filter, callback);
        } else if (filter.test(filename)) {
            callback(filename);
        }
    }
}

/**
 * `__cancelOperation__` is a inter-process communication channel for stopping the current operation.
 * @param _event  The inter-process communication sender of `__cancelOperation__`.
 */
ipcMain.on('__cancelOperation__', async (_event) => {
    __mainWorker.killAllShells().then(() => {
        _appendMessageTaskLog("Beat Map Generation Canceled!");
    });
});

/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectDirectory__', (_event) => {
    const options: Electron.OpenDialogOptions = {
        title: 'Select a folder',
        defaultPath: isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR,
        properties: ['openDirectory', 'multiSelections']
    };

    dialog.showOpenDialog(__mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                _event.sender.send("selectFilesDirs-finished", dirs.filePaths);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `__selectFiles__` is a inter-process communication channel for opening a native OS file selection dialog.
 * @param _event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectFiles__', (_event) => {
    const options: Electron.OpenDialogOptions = {
        title: 'Select an audio file',
        defaultPath: isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR,
        filters: [{
            name: 'Audio files', extensions: ['mp3', 'wav', 'flv', 'raw', 'ogg', 'egg']
        }],
        properties: ['openFile', 'multiSelections']
    };

    dialog.showOpenDialog(__mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                _event.sender.send("selectFilesDirs-finished", dirs.filePaths);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectOutDirectory__', (_event) => {
    const options: Electron.OpenDialogOptions = {
        title: 'Select a folder',
        defaultPath: isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR,
        properties: ['openDirectory']
    };

    dialog.showOpenDialog(__mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                _event.sender.send("selectOutDirectory-finished", dirs.filePaths[0]);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `_generateBeatMaps` is a function for starting the beat map generation.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
function _generateBeatMaps(opType: number, dir: string[], args: __beatMapArgs) {
    let totalCount = 0;
    let currentCount = 0;

    if (opType === 0) {
        // Folders
        let newDir: string[] = [];

        dir.forEach((folder: string) => {
            _findFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/, (file: string) => { newDir.push(file); });
        });
        totalCount = newDir.length;
        dir = newDir;
    }
    else {
        // Files
        totalCount = dir.length;
    }

    _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
    _appendMessageTaskLog('Beat Map Synthesizer Started!');

    __mainWorker.initFiles().then(() => {
        _appendMessageTaskLog('Initialized Files!');
        _updateTaskProgress(currentCount, totalCount);

        let index = -1;
        function generate() {
            while (__mainWorker.shellsRunning < __coreCount && index < dir.length) {
                __mainWorker.shellsRunning += 1;
                index += 1;
                __mainWorker.generateBeatMaps(dir[index], args)
                    .then(() => {
                        currentCount += 1;
                        _updateTaskProgress(currentCount, totalCount);
                        if (index == dir.length && __mainWorker.shellsRunning == 0) {
                            _updateTaskProgress(totalCount, totalCount);
                            _appendMessageTaskLog('Beat Map Synthesizer Finished!');
                            return;
                        }
                        generate();
                    })
                    .catch(() => {
                        currentCount += 1;
                        _updateTaskProgress(currentCount, totalCount);
                        if (index == dir.length && __mainWorker.shellsRunning == 0) {
                            _updateTaskProgress(totalCount, totalCount);
                            _appendMessageTaskLog('Beat Map Synthesizer Finished!');
                            return;
                        }
                        generate();
                    });
            }
        }
        generate();

    });
}

/**
 * `__generateBeatMap__` is a inter-process communication channel for starting the beat map generation.
 * @param _event  The inter-process communication sender of `__generateBeatMap__`.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
ipcMain.on('__generateBeatMap__', (_event, opType: number, dir: string[], args: __beatMapArgs) => {
    _generateBeatMaps(opType, dir, args);
});