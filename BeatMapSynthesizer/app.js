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
const python_shell_1 = require("python-shell");
const mm = require("music-metadata");
const fsx = require("fs-extra");
const compareVersions = require("compare-versions");
const os_1 = require("os");
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
        this.pythonInternalPath = path.join(this.appPath, "build/python");
        this.scriptsInternalPath = path.join(this.appPath, "build/scripts");
        this.tempDir = path.join(process.env.APPDATA, 'temp', 'beatmapsynthesizer');
        this.options = {
            mode: 'text',
            pythonPath: path.join(this.tempDir, "python/python.exe"),
            pythonOptions: ['-u']
        };
    }
    // Class methods
    copyFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise(resolve => {
                fsx.copy(this.scriptsInternalPath, path.join(this.tempDir, 'scripts'));
                // Quick check to see if Python.exe was modified in the last day, this prevents unnecessarily copying the Python files
                let updateFiles = false;
                if (!fsx.existsSync(path.join(this.tempDir, 'version.txt'))) {
                    updateFiles = true;
                }
                else if (compareVersions.compare(fsx.readFileSync(path.join(this.tempDir, 'version.txt')).toString(), this.appVersion, '<')) {
                    updateFiles = true;
                }
                if (updateFiles) {
                    fsx.writeFile(path.join(this.tempDir, 'version.txt'), this.appVersion).then(() => {
                        fsx.copy(this.pythonInternalPath, path.join(this.tempDir, 'python'))
                            .then(() => { resolve(updateFiles); });
                    });
                }
                else {
                    resolve(updateFiles);
                }
            });
        });
    }
    updatePython() {
        return __awaiter(this, void 0, void 0, function* () {
            _log('updatePython - Start');
            return new Promise(resolve => {
                python_shell_1.PythonShell.runString(`import subprocess;import sys;import os;subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip']);subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '${path.join(this.tempDir, '/scripts/py_requirements.txt').normalize().replace(/\\/gi, "/")}'])`, this.options, function () { })
                    .on('message', function (message) {
                    if (message.includes('Requirement already'))
                        _log(message);
                    else
                        _appendMessageTaskLog(message);
                })
                    .on('stderr', function (err) {
                    _log(err);
                })
                    .on('close', () => {
                    _log('updatePython - Finished');
                    resolve(true);
                })
                    .on('error', () => {
                    _log('updatePython - Error');
                    resolve(false);
                });
            });
        });
    }
    generateBeatMaps(dir, args) {
        return __awaiter(this, void 0, void 0, function* () {
            _log('generateBeatMaps - Start');
            args.dir = dir;
            let metadata = yield mm.parseFile(args.dir);
            let invalidchars = ["<", ">", ":", '"', "/", "\\", "|", "?", "*"];
            let trackname = metadata.common.title;
            let artistname = metadata.common.artist;
            for (var invalidchar of invalidchars) {
                if (trackname.includes(invalidchar))
                    trackname.replace(invalidchar, '^');
                if (artistname.includes(invalidchar))
                    artistname.replace(invalidchar, '^');
            }
            _log('generateBeatMaps - Metadata read');
            let temp_options = this.options;
            temp_options.args = [
                `${args.dir.normalize().replace(/\\/gi, "/")}`,
                `${trackname} - ${artistname}`,
                `${args.difficulty}`,
                `${args.model}`,
                '-k', args.k.toString(),
                '--version', args.version.toString(),
                '--workingDir', this.tempDir.normalize().replace(/\\/gi, "/"),
                '--outDir', args.outDir.normalize().replace(/\\/gi, "/"),
                '--zipFiles', args.zipFiles.toString()
            ];
            _log('generateBeatMaps - Arguments set');
            return new Promise(resolve => {
                python_shell_1.PythonShell.run(path.join(this.tempDir, '/scripts/beatmapsynth.py'), temp_options, function (err, out) { })
                    .on('message', (message) => {
                    _appendMessageTaskLog(message);
                })
                    .on('stderr', (err) => {
                    _log(err);
                })
                    .on('close', () => {
                    _log('generateBeatMaps - Finished');
                    resolve(true);
                })
                    .on('error', () => {
                    _log('generateBeatMaps - Error');
                    resolve(false);
                });
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
    totalCount += 2;
    _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
    _appendMessageTaskLog('Beat Map Synthesizer Started!');
    const mainWorker = new worker();
    mainWorker.copyFiles().then(() => {
        currentCount += 1;
        _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
        _appendMessageTaskLog('Initialized Files!');
        mainWorker.updatePython().then(() => {
            currentCount += 1;
            _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
            _appendMessageTaskLog('Updated Python!');
            const coreCount = os_1.cpus().length;
            let inUseCores = 0;
            for (let file of dir) {
                while (inUseCores > coreCount) {
                    // Wait for processes to finish
                }
                if (currentCount < totalCount) {
                    inUseCores += 1;
                    mainWorker.generateBeatMaps(file, args).then(() => {
                        currentCount += 1;
                        _updateTaskProgress(currentCount, totalCount);
                        _appendMessageTaskLog(`Beat Map Generated for ${path.basename(file)}!`);
                        inUseCores -= 1;
                    });
                }
            }
        });
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