"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Modules to control application life and create native browser window
const electron_1 = require("electron");
const path = require("path");
const python_shell_1 = require("python-shell");
const mm = require("music-metadata");
/**
 * `mainWindow` is the render process window the user interacts with.
 */
let mainWindow;
/**
 * `createMainWindow()` is responsible for the initial creation of the main window.
 */
function createWindow() {
    // Create the browser window.
    mainWindow = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(electron_1.app.getAppPath().toString(), "preload.js")
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
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
electron_1.app.on('window-all-closed', function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
/**
 * `__log__` is a inter-process communication channel for sending
 * log messages to the Chromium Console.
 * @param event  The inter-process communication sender of `__log__`.
 * @param message  The message to be sent to the console.
 */
electron_1.ipcMain.on('__log__', function (event, message) {
    _log(message);
});
/**
 * `__error__` is a inter-process communication channel for sending
 * error messages to the Chromium Console.
 * @param event  The inter-process communication sender of `__error__`.
 * @param message  The message to be sent to the console.
 */
electron_1.ipcMain.on('__error__', function (event, error) {
    _error(error);
});
/**
 * `__cancelOperation__` is a inter-process communication channel for stopping
 * the current operation.
 * @param event  The inter-process communication sender of `__error__`.
 */
electron_1.ipcMain.on('__cancelOperation__', function (event) {
    // Integrate this IPC for canceling the beat map generation...
});
/**
 * `__updateTaskProgress__` is a inter-process communication channel for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param event  The inter-process communication sender of `__error__`.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 */
electron_1.ipcMain.on('__updateTaskProgress__', function (event, value, maxValue) {
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
electron_1.ipcMain.on('__appendMessageTaskLog__', function (event, message) {
    mainWindow.webContents.send('task-log-append-message', message);
});
/**
 * `__selectDirectory__` is a inter-process communication channel for opening
 * a native OS directory selection dialog.
 * @param event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectDirectory__', function (event) {
    const options = {
        title: 'Select a folder',
        defaultPath: 'C:\\',
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
 * `__selectFiles__` is a inter-process communication channel for opening
 * a native OS file selection dialog.
 * @param event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectFiles__', function (event) {
    const options = {
        title: 'Select an audio file',
        defaultPath: 'C:\\',
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
 * `__generateBeatMap__` is a inter-process communication channel for starting
 * the beat map generation.
 * @param event  The inter-process communication sender of `__generateBeatMap__`.
 * @param dir  The path of the directory/file to generate the beat map from.
 */
electron_1.ipcMain.on('__generateBeatMap__', function (event, dir, difficulty, model, k = 5, version = 2) {
    // Integrate this IPC for generating a beat map
    let options = {
        mode: 'text',
        pythonPath: path.join(electron_1.app.getAppPath().toString(), "build/python/python.exe"),
        pythonOptions: ['-u']
    };
    python_shell_1.PythonShell.runString(`import subprocess;import sys;import os;subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip']);subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '${path.join(electron_1.app.getAppPath().toString(), '/build/scripts/py_requirements.txt').normalize().replace(/\\/gi, "/")}'])`, options, function () { })
        .on('message', function (message) {
        mainWindow.webContents.send('task-log-append-message', message);
    })
        .on('stderr', function (err) {
        mainWindow.webContents.send('task-log-append-message', err.message);
    })
        .on('close', function () {
        mm.parseFile(dir).then(metadata => {
            options.args = [`${dir.normalize().replace(/\\/gi, "/")}`, `${metadata.common.title} - ${metadata.common.artist}`, `${difficulty}`, `${model}`, '-k', k.toString(), '--version', version.toString()];
            python_shell_1.PythonShell.run(path.join(electron_1.app.getAppPath().toString(), '/build/scripts/beatmapsynth.py'), options, function () { })
                .on('message', function (message) {
                mainWindow.webContents.send('task-log-append-message', message);
            })
                .on('stderr', function (err) {
                mainWindow.webContents.send('task-log-append-message', err.message);
            });
        });
    });
});
//# sourceMappingURL=app.js.map