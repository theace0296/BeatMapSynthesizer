// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { PythonShell, Options, PythonShellError } from 'python-shell';
import * as mm from 'music-metadata';
import * as fsx from 'fs-extra';

/**
 * `mainWindow` is the render process window the user interacts with.
 */
let mainWindow: Electron.BrowserWindow;

/**
 * `createMainWindow()` is responsible for the initial creation of the main window.
 */
function createWindow() {
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
    createWindow();

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    })
})

/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
app.on('window-all-closed', function () {
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
ipcMain.on('__log__', function (event, message: string) {
    _log(message);
});

/**
 * `__error__` is a inter-process communication channel for sending
 * error messages to the Chromium Console.
 * @param event  The inter-process communication sender of `__error__`.
 * @param message  The message to be sent to the console.
 */
ipcMain.on('__error__', function (event, error: string) {
    _error(error);
});

/**
 * `__cancelOperation__` is a inter-process communication channel for stopping
 * the current operation.
 * @param event  The inter-process communication sender of `__error__`.
 */
ipcMain.on('__cancelOperation__', function (event) {
    // Integrate this IPC for canceling the beat map generation...
});

/**
 * `__updateTaskProgress__` is a inter-process communication channel for updating
 * the progress bar in the render process with the current and max values of the progress bar.
 * @param event  The inter-process communication sender of `__error__`.
 * @param value  The current value of the progress bar.
 * @param maxValue  The maximum value of the progress bar.
 */
ipcMain.on('__updateTaskProgress__', function (event, value: number, maxValue: number) {
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
ipcMain.on('__appendMessageTaskLog__', function (event, message: string) {
    mainWindow.webContents.send('task-log-append-message', message);
});

/**
 * `__selectDirectory__` is a inter-process communication channel for opening
 * a native OS directory selection dialog.
 * @param event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectDirectory__', function (event) {
    const options: Electron.OpenDialogOptions = {
        title: 'Select a folder',
        defaultPath: 'C:\\',
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
ipcMain.on('__selectFiles__', function (event) {
    const options: Electron.OpenDialogOptions = {
        title: 'Select an audio file',
        defaultPath: 'C:\\',
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
ipcMain.on('__selectOutDirectory__', function (event) {
    const options: Electron.OpenDialogOptions = {
        title: 'Select a folder',
        defaultPath: 'C:\\',
        properties: ['openDirectory']
    };

    dialog.showOpenDialog(mainWindow, options)
        .then((dirs: Electron.OpenDialogReturnValue) => {
            if (!dirs.canceled) {
                event.sender.send("selectOutDirectory-finished", dirs.filePaths);
            }
        }).catch((err: string) => {
            _error(err);
        });
});

/**
 * `__generateBeatMap__` is a inter-process communication channel for starting
 * the beat map generation.
 * @param event  The inter-process communication sender of `__generateBeatMap__`.
 * @param dir  The path of the directory/file to generate the beat map from.
 */
ipcMain.on('__generateBeatMap__', function (event, dir: string, difficulty: string, model: string, k: number = 5, version: number = 2, outDir: string = process.env.PORTABLE_EXECUTABLE_DIR) {
    let pythonInternalPath = path.join(app.getAppPath().toString(), "build/python");
    let scriptsInternalPath = path.join(app.getAppPath().toString(), "build/scripts");
    let tempDir = path.join(process.env.APPDATA, 'temp', 'beatmapsynthesizer');

    mainWindow.setProgressBar(0);
    mainWindow.webContents.send('task-progress', 0, 4);

    fsx.copy(scriptsInternalPath, path.join(tempDir, 'scripts'))
        .then(() => {
            mainWindow.webContents.send('task-progress', 1, 4);
            mainWindow.setProgressBar(.25);

            // Quick check to see if Python.exe was modified in the last day, this prevents unnecessarily copying the Python files
            // Eventually this can just be tied to file versions and the auto-update system
            let updatePythonFiles = (Date.now() - fsx.statSync(path.join(tempDir, 'python', 'python.exe')).mtimeMs) > 86400000; 

            if (updatePythonFiles) {
                fsx.copy(pythonInternalPath, path.join(tempDir, 'python')).then(() => {
                    mainWindow.webContents.send('task-progress', 2, 4);
                    mainWindow.setProgressBar(.50);

                    let options: Options = {
                        mode: 'text',
                        pythonPath: path.join(tempDir, "python/python.exe"),
                        pythonOptions: ['-u']
                    };

                    PythonShell.runString(`import subprocess;import sys;import os;subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip']);subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '${path.join(tempDir, '/scripts/py_requirements.txt').normalize().replace(/\\/gi, "/")}'])`, options, function () { /* Callback not used */ })
                        .on('message', function (message: string) {
                            if (message)
                                mainWindow.webContents.send('task-log-append-message', message);
                        })
                        .on('stderr', function (err: PythonShellError) {
                            if (err)
                                mainWindow.webContents.send('task-log-append-message', err.message);
                        })
                        .on('close', function () {
                            mainWindow.webContents.send('task-progress', 3, 4);
                            mainWindow.setProgressBar(.75);

                            mm.parseFile(dir).then(metadata => {
                                options.args = [
                                    `${dir.normalize().replace(/\\/gi, "/")}`,
                                    `${metadata.common.title} - ${metadata.common.artist}`,
                                    `${difficulty}`,
                                    `${model}`,
                                    '-k', k.toString(),
                                    '--version', version.toString(),
                                    '--workingDir', tempDir.normalize().replace(/\\/gi, "/"),
                                    '--outDir', outDir.normalize().replace(/\\/gi, "/")
                                ];
                                PythonShell.run(path.join(tempDir, '/scripts/beatmapsynth.py'), options, function (err, out) { /* Callback not used */ })
                                    .on('message', function (message: string) {
                                        if (message && message != 'undefined')
                                            mainWindow.webContents.send('task-log-append-message', message);
                                    })
                                    .on('stderr', function (err: PythonShellError) {
                                        if (err)
                                            mainWindow.webContents.send('task-log-append-message', err.message);
                                    })
                                    .on('close', function () {
                                        mainWindow.webContents.send('task-progress', 4, 4);
                                        mainWindow.setProgressBar(1);
                                        mainWindow.webContents.send('task-log-append-message', 'Beat Map Complete!');
                                    });
                            });
                        });
                });
            } else {
                mainWindow.webContents.send('task-progress', 2, 4);
                mainWindow.setProgressBar(.50);

                let options: Options = {
                    mode: 'text',
                    pythonPath: path.join(tempDir, "python/python.exe"),
                    pythonOptions: ['-u']
                };

                mainWindow.webContents.send('task-progress', 3, 4);
                mainWindow.setProgressBar(.75);

                mm.parseFile(dir).then(metadata => {
                    options.args = [
                        `${dir.normalize().replace(/\\/gi, "/")}`,
                        `${metadata.common.title} - ${metadata.common.artist}`,
                        `${difficulty}`,
                        `${model}`,
                        '-k', k.toString(),
                        '--version', version.toString(),
                        '--workingDir', tempDir.normalize().replace(/\\/gi, "/"),
                        '--outDir', outDir.normalize().replace(/\\/gi, "/")
                    ];
                    PythonShell.run(path.join(tempDir, '/scripts/beatmapsynth.py'), options, function (err, out) { /* Callback not used */ })
                        .on('message', function (message: string) {
                            if (message && message != 'undefined')
                                mainWindow.webContents.send('task-log-append-message', message);
                        })
                        .on('stderr', function (err: PythonShellError) {
                            if (err)
                                mainWindow.webContents.send('task-log-append-message', err.message);
                        })
                        .on('close', function () {
                            mainWindow.webContents.send('task-progress', 4, 4);
                            mainWindow.setProgressBar(1);
                            mainWindow.webContents.send('task-log-append-message', 'Beat Map Complete!');
                        });
                });
            }
        });
});