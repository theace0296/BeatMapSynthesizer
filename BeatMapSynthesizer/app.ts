// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import promiseIpc from 'electron-promise-ipc';
import * as path from 'path';
import * as fsx from 'fs-extra';

/**
 * `mainWindow` is the render process window the user interacts with.
 */
let mainWindow: Electron.BrowserWindow;

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
            preload: path.join(app.getAppPath().toString(), "preload.js")
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
 * `workerWindow` is a class for creating hidden process windows that are responsible for running operations.
 */
class workerWindow {
    // Class variables
    window: Electron.BrowserWindow;

    // Constructor
    constructor() {
        // create hidden worker window
        this.window = new BrowserWindow({
            parent: mainWindow,
            show: false,
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(app.getAppPath().toString(), "worker.js")
            }
        });

        // load the worker.html
        this.window.loadFile(path.join(app.getAppPath().toString(), 'worker.html'));

        this.window.on("closed", () => {
            // Dereference the window object, usually you would store windows
            // in an array if your app supports multi windows, this is the time
            // when you should delete the corresponding element.
            this.window = null;
        });

        return this;
    }

    // Class methods
    async copyFiles(): Promise<unknown> {
        return (await promiseIpc.send('worker-copy-files', this.window.webContents));
    }

    async updatePython(): Promise<unknown> {
        return (await promiseIpc.send('worker-update-python', this.window.webContents));
    }

    async generateBeatMaps(dir: string, args: beatMapArgs) {
        args.dir = dir;
        return (await promiseIpc.send('worker-generate-beatmaps', this.window.webContents, args));
    }

    close() {
        this.window.close();
    }
}

/**
 * beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
export class beatMapArgs {
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
        return this;
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
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    })
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
 * `__log__` is a inter-process communication channel for sending
 * log messages to the Chromium Console.
 * @param event  The inter-process communication sender of `__log__`.
 * @param message  The message to be sent to the console.
 */
ipcMain.on('__log__', (event, message: string) => _log(message));

/**
 * `__error__` is a inter-process communication channel for sending
 * error messages to the Chromium Console.
 * @param event  The inter-process communication sender of `__error__`.
 * @param message  The message to be sent to the console.
 */
ipcMain.on('__error__', (event, error: string) => _error(error));

/**
 * `__cancelOperation__` is a inter-process communication channel for stopping
 * the current operation.
 * @param event  The inter-process communication sender of `__error__`.
 */
ipcMain.on('__cancelOperation__', (event) => {
    // Integrate this IPC for canceling the beat map generation...
});

/**
 * `__updateTaskProgress__` is a inter-process communication channel for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param event  The inter-process communication sender of `__error__`.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 */
ipcMain.on('__updateTaskProgress__', (event, value: number, maxValue: number) => {
    mainWindow.webContents.send('task-progress', value, maxValue);
    if ((value / maxValue) < 1)
        mainWindow.setProgressBar(value / maxValue);
    else
        mainWindow.setProgressBar(-1);
});

/**
 * `__appendMessageTaskLog__` is a inter-process communication channel for sending
 * log messages to the task log element the user sees.
 * @param event  The inter-process communication sender of `__appendMessageTaskLog__`.
 * @param message  The message to be sent to the task log.
 */
ipcMain.on('__appendMessageTaskLog__', (event, message: string) => mainWindow.webContents.send('task-log-append-message', message));

/**
 * `__selectDirectory__` is a inter-process communication channel for opening
 * a native OS directory selection dialog.
 * @param event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectDirectory__', (event) => {
    const options: Electron.OpenDialogOptions = {
        title: 'Select a folder',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        properties: ['openDirectory', 'multiSelections']
    };

    dialog.showOpenDialog(mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                event.sender.send("selectFilesDirs-finished", dirs.filePaths);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `__selectFiles__` is a inter-process communication channel for opening
 * a native OS file selection dialog.
 * @param event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectFiles__', (event) => {
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
                event.sender.send("selectFilesDirs-finished", dirs.filePaths);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `__selectDirectory__` is a inter-process communication channel for opening
 * a native OS directory selection dialog.
 * @param event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectOutDirectory__', (event) => {
    const options: Electron.OpenDialogOptions = {
        title: 'Select a folder',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH,
        properties: ['openDirectory']
    };

    dialog.showOpenDialog(mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                event.sender.send("selectOutDirectory-finished", dirs.filePaths[0]);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `countFilesInDir` is a function that recursively counts the files that match a filter in a directory.
 * @param startPath The top-most level to start the search in.
 * @param filter A regular expression filter to filter the search results.
 * @returns An array of files found during the search.
 */
async function countFilesInDir(startPath: string, filter: RegExp) {
    var results: string[] = [];
    const files = fsx.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fsx.lstatSync(filename);
        if (stat.isDirectory()) {
            results = results.concat(await countFilesInDir(filename, filter));
        } else if (filter.test(filename)) {
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
 * `__generateBeatMap__` is a inter-process communication channel for starting
 * the beat map generation.
 * @param event  The inter-process communication sender of `__generateBeatMap__`.
 * @param opType A numerical value that indicates whether the 'dir' is an array of file paths or folder paths
 * @param dir  The path of the directory/file to generate the beat map from.
 * @param difficulty  The difficulty to generate the beat map at.
 * @param model The model to use for generating the beat map.
 * @param k The number of song segments to use in a segmented model.
 * @param version The version of data to use when using a HMM model.
 * @param outDir The directory to put the output files.
 */
ipcMain.on('__generateBeatMap__', async function (event, opType: number, dir: string | string[], args: beatMapArgs) {
    let totalCount = 0;
    let currentCount = 0;

    if (opType === 0) {
        // Folders
        if (typeof dir === 'string') {
            // Single Folder
            let newDir = await countFilesInDir(dir, /mp3|wav|flv|raw|ogg|egg/);
            totalCount = newDir.length;
            dir = newDir;
        }
        else if (Array.isArray(dir)) {
            // Multiple Folders
            let newDir: string[];
            dir.forEach(async (folder: string) => {
                newDir.concat(await countFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/));
            });
            totalCount = newDir.length;
            dir = newDir;
        }
    }
    else if (typeof dir === 'string') {
        // Single File
        let newDir = [dir];
        totalCount = newDir.length;
        dir = newDir;
    }

    totalCount += 2;
    event.sender.send('__updateTaskProgress__', currentCount, totalCount);

    let mainWorker = new workerWindow();

    mainWorker.copyFiles();
    currentCount += 1;
    event.sender.send('__updateTaskProgress__', currentCount, totalCount);

    mainWorker.updatePython();
    currentCount += 1;
    event.sender.send('__updateTaskProgress__', currentCount, totalCount);

    dir.forEach((file: string) => {
        if (currentCount < totalCount) {
            mainWorker.generateBeatMaps(file, args);
            currentCount += 1;
            event.sender.send('__updateTaskProgress__', currentCount, totalCount);
        }
    });
    event.sender.send('task-log-append-message', 'Beat Map Complete!');
    mainWorker.close();
});