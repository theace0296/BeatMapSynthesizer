"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Modules to control application life and create native browser window
const electron_1 = require("electron");
const path = require("path");
const child_process_1 = require("child_process");
const mm = require("music-metadata");
const fsx = require("fs-extra");
const compareVersions = require("compare-versions");
const os_1 = require("os");
const util_1 = require("util");
const sanitize = require('sanitize-filename');
/**
 * __beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
class __beatMapArgs {
    constructor() {
        this.dir = '';
        this.difficulty = 'all';
        this.model = 'random';
        this.k = 5;
        this.version = 2;
        this.outDir = util_1.isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? electron_1.app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR;
        this.zipFiles = 0;
        this.environment = 'DefaultEnvironment';
    }
}
/**
 * `__coreCount` is the 'usable' cores for running multiple beat map generations at once.
 * It is based off of the average system resource usage and will fallback to one processes at a time
 * if system resources are not plentiful.
 * Reserve 2 cores, if possible, for system usage.
 * 1073741824 is 1024MB in Bytes.
 */
const __coreCount = (() => {
    let workingCores = os_1.cpus().length > 2 ? os_1.cpus().length - 2 : 1;
    if (os_1.totalmem() >= (workingCores * 1073741824)) {
        return workingCores;
    }
    else if ((os_1.totalmem() / 1073741824) <= workingCores) {
        return Math.floor(os_1.totalmem() / 1073741824);
    }
    return workingCores;
})();
/**
 * `worker` is a class for creating hidden processes that are responsible for running operations.
 */
class worker {
    // Constructor
    constructor() {
        // create the worker
        this.appPath = electron_1.app.getAppPath();
        this.appVersion = electron_1.app.getVersion();
        this.scriptsInternalPath = path.join(this.appPath, "build/scripts");
        this.tempDir = path.join(process.env.APPDATA, 'beat-map-synthesizer', 'temp');
        this.pythonExePath = path.join(this.tempDir, "beatmapsynth.exe");
        this.shellsRunning = 0;
        this.activeShells = [];
    }
    // Class methods
    async initFiles() {
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
                    let files = ["cover.jpg", "ffmpeg.exe", "ffplay.exe", "ffprobe.exe",
                        "models/HMM_easy.pkl", "models/HMM_easy_v2.pkl", "models/HMM_expert.pkl", "models/HMM_expert_v2.pkl", "models/HMM_expertPlus.pkl",
                        "models/HMM_expertPlus_v2.pkl", "models/HMM_hard.pkl", "models/HMM_hard_v2.pkl", "models/HMM_normal.pkl", "models/HMM_normal_v2.pkl"];
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
    async generateBeatMaps(dir, args) {
        _log('generateBeatMaps - Start');
        let metadata = await mm.parseFile(dir);
        let trackname = sanitize(metadata.common.title);
        let artistname = sanitize(metadata.common.artist);
        let temp_args = [
            `"${dir.normalize().replace(/\\/gi, "/")}"`,
            `"${trackname} - ${artistname}"`,
            `"${args.difficulty}"`,
            `"${args.model}"`,
            '-k', args.k.toString(),
            '--version', args.version.toString(),
            '--environment', `"${args.environment}"`,
            '--workingDir', `"${this.tempDir.normalize().replace(/\\/gi, "/")}"`,
            '--outDir', `"${args.outDir.normalize().replace(/\\/gi, "/")}"`,
            '--zipFiles', args.zipFiles.toString()
        ];
        let beatMapExists = (fsx.existsSync(path.join(args.outDir, `${trackname} - ${artistname}`, 'info.dat')) || fsx.existsSync(path.join(args.outDir, `${trackname} - ${artistname}.zip`)));
        return new Promise(resolve => {
            if (!beatMapExists) {
                let _remaining;
                function parseOut(data) {
                    if (!data)
                        return '';
                    _appendMessageTaskLog(data);
                }
                ;
                function parseErr(data) {
                    if (!data)
                        return '';
                    _log(data);
                }
                ;
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
                        if (emitType == 'stdout')
                            parseOut(part);
                        else if (emitType == 'stderr')
                            parseErr(part);
                    });
                    return this;
                }
                ;
                function receiveStdout(data) {
                    return receiveInternal(data, 'stdout');
                }
                ;
                function receiveStderr(data) {
                    return receiveInternal(data, 'stderr');
                }
                ;
                const shell = child_process_1.spawn(this.pythonExePath, temp_args, { windowsVerbatimArguments: true });
                this.activeShells.push(shell);
                shell.on('close', () => {
                    _log('generateBeatMaps - Finished');
                    --this.shellsRunning;
                    resolve(true);
                });
                shell.stdout.setEncoding('utf8');
                shell.stderr.setEncoding('utf8');
                shell.stdout.on('data', (buffer) => receiveStdout(buffer));
                shell.stderr.on('data', (buffer) => receiveStderr(buffer));
                setTimeout(() => {
                    shell.kill();
                }, 120000);
            }
            else {
                --this.shellsRunning;
                resolve(true);
            }
        });
    }
    async killAllShells() {
        return new Promise(resolve => {
            let shellsKilledSuccessfully = 0;
            for (let shell of this.activeShells) {
                shell.kill();
                if (shell.killed) {
                    shellsKilledSuccessfully++;
                }
            }
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
let __mainWindow;
/**
 * `__mainWorker` is the worker class that runs the operations.
 */
const __mainWorker = new worker();
/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
electron_1.app.on('ready', async () => {
    _createMainWindow();
    electron_1.app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            _createMainWindow();
    });
    __mainWorker.initFiles();
});
/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
electron_1.app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
/**
 * `_createMainWindow()` is responsible for the initial creation of the main window.
 */
function _createMainWindow() {
    // Create the browser window.
    __mainWindow = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(electron_1.app.getAppPath(), 'preload.js')
        }
    });
    // and load the index.html of the app.
    __mainWindow.loadFile(path.join(electron_1.app.getAppPath(), "index.html"));
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
function _log(message) {
    __mainWindow.webContents.send('console-log', message);
}
/**
 * `_error()` is responsible for sending error messages to the Chromium Console.
 * @param message  The message to be sent to the console.
 */
function _error(message) {
    __mainWindow.webContents.send('console-error', message);
}
/**
 * `_updateTaskProgress` is responsible for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 * @param options The options to pass to the progress bar, the default is { mode: 'normal' }
 */
function _updateTaskProgress(value, maxValue, options = { mode: 'normal' }) {
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
function _appendMessageTaskLog(message) {
    __mainWindow.webContents.send('task-log-append-message', message);
}
;
/**
 * `_findFilesInDir` is a function that recursively searches the files that match a filter in a directory
 * and runs a callback on each file.
 * @param startPath The top-most level to start the search in.
 * @param filter A regular expression filter to filter the search results.
 * @param callback A function to have run on each file.
 */
function _findFilesInDir(startPath, filter, callback) {
    const files = fsx.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fsx.lstatSync(filename);
        if (stat.isDirectory()) {
            _findFilesInDir(filename, filter, callback);
        }
        else if (filter.test(filename)) {
            callback(filename);
        }
    }
}
/**
 * `__cancelOperation__` is a inter-process communication channel for stopping the current operation.
 * @param _event  The inter-process communication sender of `__cancelOperation__`.
 */
electron_1.ipcMain.on('__cancelOperation__', async (_event) => {
    __mainWorker.killAllShells().then(() => {
        _appendMessageTaskLog("Beat Map Generation Canceled!");
    });
});
/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectDirectory__', (_event) => {
    const options = {
        title: 'Select a folder',
        defaultPath: util_1.isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? electron_1.app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR,
        properties: ['openDirectory', 'multiSelections']
    };
    electron_1.dialog.showOpenDialog(__mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            _event.sender.send("selectFilesDirs-finished", dirs.filePaths);
        }
    }).catch((err) => {
        _error(err);
    });
});
/**
 * `__selectFiles__` is a inter-process communication channel for opening a native OS file selection dialog.
 * @param _event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectFiles__', (_event) => {
    const options = {
        title: 'Select an audio file',
        defaultPath: util_1.isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? electron_1.app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR,
        filters: [{
                name: 'Audio files', extensions: ['mp3', 'wav', 'flv', 'raw', 'ogg', 'egg']
            }],
        properties: ['openFile', 'multiSelections']
    };
    electron_1.dialog.showOpenDialog(__mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            _event.sender.send("selectFilesDirs-finished", dirs.filePaths);
        }
    }).catch((err) => {
        _error(err);
    });
});
/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectOutDirectory__', (_event) => {
    const options = {
        title: 'Select a folder',
        defaultPath: util_1.isNullOrUndefined(process.env.PORTABLE_EXECUTABLE_DIR) ? electron_1.app.getAppPath() : process.env.PORTABLE_EXECUTABLE_DIR,
        properties: ['openDirectory']
    };
    electron_1.dialog.showOpenDialog(__mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            _event.sender.send("selectOutDirectory-finished", dirs.filePaths[0]);
        }
    }).catch((err) => {
        _error(err);
    });
});
/**
 * `_generateBeatMaps` is a function for starting the beat map generation.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
function _generateBeatMaps(opType, dir, args) {
    let totalCount = 0;
    let currentCount = 0;
    if (opType === 0) {
        // Folders
        let newDir = [];
        dir.forEach((folder) => {
            _findFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/, (file) => { newDir.push(file); });
        });
        totalCount = newDir.length;
        dir = newDir;
    }
    else {
        // Files
        totalCount = dir.length;
    }
    totalCount += 1;
    _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
    _appendMessageTaskLog('Beat Map Synthesizer Started!');
    __mainWorker.initFiles().then(() => {
        currentCount += 1;
        _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
        _appendMessageTaskLog('Initialized Files!');
        let index = -1;
        function generate() {
            while (__mainWorker.shellsRunning < __coreCount && index < (dir.length - 1)) {
                __mainWorker.shellsRunning += 1;
                index += 1;
                __mainWorker.generateBeatMaps(dir[index], args).then(() => {
                    currentCount += 1;
                    _updateTaskProgress(currentCount, totalCount);
                    _appendMessageTaskLog(`Beat Map Generated for ${path.basename(dir[index])}!`);
                    if (index == (dir.length - 1) && __mainWorker.shellsRunning == 0) {
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
electron_1.ipcMain.on('__generateBeatMap__', (_event, opType, dir, args) => {
    _generateBeatMaps(opType, dir, args);
});
//# sourceMappingURL=app.js.map