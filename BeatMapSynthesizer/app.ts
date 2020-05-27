// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, dialog, ProgressBarOptions } from 'electron';
import * as path from "path";
import { spawn, ChildProcess } from 'child_process';
import * as mm from 'music-metadata';
import * as fsx from 'fs-extra';
import * as compareVersions from 'compare-versions';
import { EOL as newline, cpus, totalmem } from 'os';
const sanitize = require('sanitize-filename');

const coreCount: number = calcUsableCores();

/**
 * `calcUsableCores` calculates the 'usable' cores for running multiple beat map generations at once.
 * It is based off of the average system resource usage and will fallback to one processes at a time
 * if system resources are not plentiful. 
 * Reserve 2 cores, if possible, for system usage.
 * 1073741824 is 1024MB in Bytes.
 */
function calcUsableCores(): number {
    let workingCores: number = cpus().length > 2 ? cpus().length - 2 : 1;
    if (totalmem() >= (workingCores * 1073741824)) {
        return workingCores;
    }
    else if ((totalmem() / 1073741824) <= workingCores) {
        return Math.floor(totalmem() / 1073741824);
    }
    else {
        return workingCores;
    }
}

/**
 * `mainWindow` is the render process window the user interacts with.
 */
let mainWindow: Electron.BrowserWindow;

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', async () => {
    createMainWindow();
    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
})

/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin')
        app.quit();
})

/**
 * `createMainWindow()` is responsible for the initial creation of the main window.
 */
function createMainWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(app.getAppPath(), 'preload.js')
        }
    });

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(app.getAppPath().toString(), "index.html"));

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
    // Class variables
    appPath: string;
    appVersion: string;
    scriptsInternalPath: string;
    tempDir: string;
    exePath: string;
    shellsRunning: number;
    shells: ChildProcess[];

    // Constructor
    constructor() {
        // create the worker
        this.appPath = app.getAppPath();
        this.appVersion = app.getVersion();
        this.scriptsInternalPath = path.join(this.appPath, "build/scripts");
        this.tempDir = path.join(process.env.APPDATA, 'beat-map-synthesizer', 'temp');
        this.exePath = path.join(this.tempDir, "beatmapsynth.exe");
        this.shellsRunning = 0;
        this.shells = [];
    }

    // Class methods
    async copyFiles(): Promise<boolean> {
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

    async generateBeatMaps(dir: string, args: beatMapArgs): Promise<boolean> {
        _log('generateBeatMaps - Start');
        let metadata: mm.IAudioMetadata = await mm.parseFile(dir);
        let trackname: string = sanitize(metadata.common.title);
        let artistname: string = sanitize(metadata.common.artist);

        let temp_args: string[] = [
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

        let beatMapExists: boolean = (fsx.existsSync(path.join(args.outDir, `${trackname} - ${artistname}`, 'info.dat')) || fsx.existsSync(path.join(args.outDir, `${trackname} - ${artistname}.zip`)));

        return new Promise(resolve => {
            if (!beatMapExists) {
                let _remaining: string;

                function parseOut(data: string) {
                    if (!data)
                        return '';
                    _appendMessageTaskLog(data);
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

                const shell = spawn(this.exePath, temp_args, { windowsVerbatimArguments: true });
                this.shells.push(shell);

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
            for (let shell of this.shells) {
                shell.kill();
                if (shell.killed) {
                    shellsKilledSuccessfully++;
                }
            }

            if (shellsKilledSuccessfully === this.shells.length) {
                this.shells.length = 0;
                resolve(true);
            }
            else {
                resolve(false);
            }
        });
    }
}

/**
 * `mainWorker` is the worker class that runs the operations.
 */
const mainWorker = new worker();

/**
 * beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
class beatMapArgs {
    dir: string;
    difficulty: string;
    model: string;
    k: number;
    version: number;
    outDir: string;
    zipFiles: number;

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
function _log(message: string) {
    mainWindow.webContents.send('console-log', message);
}

/**
 * `_error()` is responsible for sending error messages to the Chromium Console.
 * @param message  The message to be sent to the console.
 */
function _error(message: string) {
    mainWindow.webContents.send('console-error', message);
}

/**
 * `_updateTaskProgress` is responsible for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 * @param options The options to pass to the progress bar, the default is { mode: 'normal' }
 */
function _updateTaskProgress(value: number, maxValue: number, options: ProgressBarOptions = { mode: 'normal' }) {
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
function _appendMessageTaskLog(message: string) {
    mainWindow.webContents.send('task-log-append-message', message)
};

/**
 * `findFilesInDir` is a function that recursively searches the files that match a filter in a directory 
 * and runs a callback on each file.
 * @param startPath The top-most level to start the search in.
 * @param filter A regular expression filter to filter the search results.
 * @param callback A function to have run on each file.
 */
function findFilesInDir(startPath: string, filter: RegExp, callback: Function) {
    const files = fsx.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fsx.lstatSync(filename);
        if (stat.isDirectory()) {
            findFilesInDir(filename, filter, callback);
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
    mainWorker.killAllShells().then(() => {
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
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        properties: ['openDirectory', 'multiSelections']
    };

    dialog.showOpenDialog(mainWindow, options)
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
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        filters: [{
            name: 'Audio files', extensions: [ 'mp3', 'wav', 'flv', 'raw', 'ogg', 'egg' ] }],
        properties: ['openFile', 'multiSelections']
    };

    dialog.showOpenDialog(mainWindow, options)
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
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        properties: ['openDirectory']
    };

    dialog.showOpenDialog(mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                _event.sender.send("selectOutDirectory-finished", dirs.filePaths[0]);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `_generateBeatMap` is a function for starting the beat map generation.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
function _generateBeatMap(opType: number, dir: string[], args: beatMapArgs) {
    let totalCount = 0;
    let currentCount = 0;

    if (opType === 0) {
        // Folders
        let newDir: string[] = [];
        
        dir.forEach((folder: string) => {
            findFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/, (file: string) => { newDir.push(file); });
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
 * @param _event  The inter-process communication sender of `__generateBeatMap__`.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param args  A map of arguments to use for generating the beat maps
 */
ipcMain.on('__generateBeatMap__', (_event, opType: number, dir: string[], args: beatMapArgs) => {
    _generateBeatMap(opType, dir, args);
});