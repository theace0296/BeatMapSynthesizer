"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Modules to control application life and create native browser window
const electron_1 = require("electron");
const path = require("path");
const child_process_1 = require("child_process");
const mm = require("music-metadata");
const fsx = require("fs-extra");
const compareVersions = require("compare-versions");
const os_1 = require("os");
const sanitize = require('sanitize-filename');
const coreCount = calcUsableCores();
/**
 * `calcUsableCores` calculates the 'usable' cores for running multiple beat map generations at once.
 * It is based off of the average system resource usage and will fallback to one processes at a time
 * if system resources are not plentiful.
 * Reserve 2 cores, if possible, for system usage.
 * 1073741824 is 1024MB in Bytes.
 */
function calcUsableCores() {
    let workingCores = os_1.cpus().length > 2 ? os_1.cpus().length - 2 : 1;
    if (os_1.totalmem() >= (workingCores * 1073741824)) {
        return workingCores;
    }
    else if ((os_1.totalmem() / 1073741824) <= workingCores) {
        return Math.floor(os_1.totalmem() / 1073741824);
    }
    else {
        return workingCores;
    }
}
/**
 * `mainWindow` is the render process window the user interacts with.
 */
let mainWindow;
/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
electron_1.app.on('ready', () => __awaiter(void 0, void 0, void 0, function* () {
    createMainWindow();
    electron_1.app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
}));
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
 * `createMainWindow()` is responsible for the initial creation of the main window.
 */
function createMainWindow() {
    // Create the browser window.
    mainWindow = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(electron_1.app.getAppPath(), 'preload.js')
        }
    });
    // and load the index.html of the app.
    mainWindow.loadFile(path.join(electron_1.app.getAppPath().toString(), "index.html"));
    // Open the DevTools.
    // mainWindow.webContents.openDevTools()
    // Emitted when the window is closed.
    mainWindow.on("closed", () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
}
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
        this.exePath = path.join(this.tempDir, "beatmapsynth.exe");
        this.shellsRunning = 0;
    }
    // Class methods
    copyFiles() {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    generateBeatMaps(dir, args) {
        return __awaiter(this, void 0, void 0, function* () {
            _log('generateBeatMaps - Start');
            let metadata = yield mm.parseFile(dir);
            let trackname = sanitize(metadata.common.title);
            let artistname = sanitize(metadata.common.artist);
            let temp_args = [
                `"${dir.normalize().replace(/\\/gi, "/")}"`,
                `"${trackname} - ${artistname}"`,
                `"${args.difficulty}"`,
                `"${args.model}"`,
                '-k', args.k.toString(),
                '--version', args.version.toString(),
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
                        else if (typeof data !== 'string')
                            _appendMessageTaskLog(data.toString());
                        _appendMessageTaskLog(data);
                    }
                    ;
                    function parseErr(data) {
                        if (!data)
                            return '';
                        else if (typeof data !== 'string')
                            _log(data.toString());
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
                    const shell = child_process_1.spawn(this.exePath, temp_args, { windowsVerbatimArguments: true });
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
        });
    }
}
/**
 * beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
class beatMapArgs {
    constructor() {
        this.dir = '';
        this.difficulty = 'all';
        this.model = 'random';
        this.k = 5;
        this.version = 2;
        this.outDir = process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH;
        this.zipFiles = 0;
    }
}
/**
 * `_log()` is responsible for sending log messages to the Chromium Console.
 * @param message  The message to be sent to the console.
 */
function _log(message) {
    mainWindow.webContents.send('console-log', message);
}
/**
 * `_error()` is responsible for sending error messages to the Chromium Console.
 * @param message  The message to be sent to the console.
 */
function _error(message) {
    mainWindow.webContents.send('console-error', message);
}
/**
 * `_updateTaskProgress` is responsible for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 * @param options The options to pass to the progress bar, the default is { mode: 'normal' }
 */
function _updateTaskProgress(value, maxValue, options = { mode: 'normal' }) {
    mainWindow.webContents.send('task-progress', value, maxValue);
    if ((value / maxValue) < 1)
        mainWindow.setProgressBar(value / maxValue, options);
    else
        mainWindow.setProgressBar(-1);
}
/**
 * `_appendMessageTaskLog` is responsible for sending
 * log messages to the task log element the user sees.
 * @param message  The message to be sent to the task log.
 */
function _appendMessageTaskLog(message) {
    mainWindow.webContents.send('task-log-append-message', message);
}
;
/**
 * `countFilesInDir` is a function that recursively counts the files that match a filter in a directory.
 * @param startPath The top-most level to start the search in.
 * @param filter A regular expression filter to filter the search results.
 * @returns An array of files found during the search.
 */
function countFilesInDir(startPath, filter) {
    var results = [];
    const files = fsx.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fsx.lstatSync(filename);
        if (stat.isDirectory()) {
            results = results.concat(countFilesInDir(filename, filter));
        }
        else if (filter.test(filename)) {
            results.push(filename);
        }
    }
    return results;
}
/**
 * `findFilesInDir` is a function that recursively searches the files that match a filter in a directory
 * and runs a callback on each file.
 * @param startPath The top-most level to start the search in.
 * @param filter A regular expression filter to filter the search results.
 * @param callback A function to have run on each file.
 */
function findFilesInDir(startPath, filter, callback) {
    const files = fsx.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fsx.lstatSync(filename);
        if (stat.isDirectory()) {
            findFilesInDir(filename, filter, callback);
        }
        else if (filter.test(filename)) {
            callback(filename);
        }
    }
}
/**
 * `__cancelOperation__` is a inter-process communication channel for stopping the current operation.
 * @param event  The inter-process communication sender of `__cancelOperation__`.
 */
electron_1.ipcMain.on('__cancelOperation__', (event) => __awaiter(void 0, void 0, void 0, function* () {
    // Integrate this IPC for canceling the beat map generation...
}));
/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectDirectory__', (event) => {
    const options = {
        title: 'Select a folder',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        properties: ['openDirectory', 'multiSelections']
    };
    electron_1.dialog.showOpenDialog(mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            event.sender.send("selectFilesDirs-finished", dirs.filePaths);
        }
    }).catch((err) => {
        _error(err);
    });
});
/**
 * `__selectFiles__` is a inter-process communication channel for opening a native OS file selection dialog.
 * @param event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectFiles__', (event) => {
    const options = {
        title: 'Select an audio file',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        filters: [{
                name: 'Audio files', extensions: ['mp3', 'wav', 'flv', 'raw', 'ogg', 'egg']
            }],
        properties: ['openFile', 'multiSelections']
    };
    electron_1.dialog.showOpenDialog(mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            event.sender.send("selectFilesDirs-finished", dirs.filePaths);
        }
    }).catch((err) => {
        _error(err);
    });
});
/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectOutDirectory__', (event) => {
    const options = {
        title: 'Select a folder',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        properties: ['openDirectory']
    };
    electron_1.dialog.showOpenDialog(mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            event.sender.send("selectOutDirectory-finished", dirs.filePaths[0]);
        }
    }).catch((err) => {
        _error(err);
    });
});
/**
 * `_generateBeatMap` is a function for starting the beat map generation.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
function _generateBeatMap(opType, dir, args) {
    let totalCount = 0;
    let currentCount = 0;
    if (opType === 0) {
        // Folders
        let newDir = [];
        dir.forEach((folder) => {
            findFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/, (file) => { newDir.push(file); });
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
    const mainWorker = new worker();
    mainWorker.copyFiles().then(() => {
        currentCount += 1;
        _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
        _appendMessageTaskLog('Initialized Files!');
        let index = -1;
        function generate() {
            while (mainWorker.shellsRunning < coreCount && index < (dir.length - 1)) {
                mainWorker.shellsRunning += 1;
                index += 1;
                mainWorker.generateBeatMaps(dir[index], args).then(() => {
                    currentCount += 1;
                    _updateTaskProgress(currentCount, totalCount);
                    _appendMessageTaskLog(`Beat Map Generated for ${path.basename(dir[index])}!`);
                    if (index == (dir.length - 1) && mainWorker.shellsRunning == 0) {
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
 * @param event  The inter-process communication sender of `__generateBeatMap__`.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
electron_1.ipcMain.on('__generateBeatMap__', (event, opType, dir, args) => {
    _generateBeatMap(opType, dir, args);
});
//# sourceMappingURL=app.js.map