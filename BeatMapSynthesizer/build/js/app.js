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
// Modules to control application life and create native browser window
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fsx = __importStar(require("fs-extra"));
const async_1 = require("async");
const worker_1 = require("./worker");
const pythonServer_1 = __importDefault(require("./pythonServer"));
const pythonApi_1 = require("./pythonApi");
const timeoutFunctionWithCallback = (file, fn, cb, ...fn_args) => {
    const functionPromise = new Promise(async (resolve) => {
        const ret = await fn(file, ...fn_args);
        _log(file);
        cb();
        resolve(ret);
    });
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
        timeout = setTimeout((err) => {
            _error(`${file} Error: \n${err}`);
            cb();
            reject(err);
        }, 450000, new Error('Operation timed out.'));
    });
    return Promise.race([functionPromise, timeoutPromise]).then((value) => {
        clearTimeout(timeout);
        return value;
    }, () => {
        clearTimeout(timeout);
        return null;
    });
};
let __mainWindow;
let __pythonServer;
let __workerQueue = async_1.queue((_, cb) => cb(), 6);
let __activeWorkers = [];
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
});
/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
electron_1.app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    for (const worker of __activeWorkers) {
        worker.stopWorker();
    }
    __activeWorkers = [];
    __workerQueue.kill();
    if (__pythonServer.activeShell) {
        __pythonServer.killShell();
    }
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
/**
 * `_createMainWindow()` is responsible for the initial creation of the main window.
 */
function _createMainWindow() {
    const dimensions = electron_1.screen.getPrimaryDisplay().size;
    // Create the browser window.
    __mainWindow = new electron_1.BrowserWindow({
        height: dimensions.height / 2,
        width: dimensions.width / 2,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false,
        },
    });
    // and load the index.html of the app.
    __mainWindow.loadFile(path.join(electron_1.app.getAppPath(), 'build/index.html'));
    // Open the DevTools.
    __mainWindow.webContents.openDevTools();
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
    if (value / maxValue < 1)
        __mainWindow.setProgressBar(value / maxValue, options);
    else
        __mainWindow.setProgressBar(-1);
}
/**
 * `_appendMessageTaskLog` is responsible for sending
 * log messages to the task log element the user sees.
 * @param message  The message to be sent to the task log.
 */
function _appendMessageTaskLog(message, group) {
    __mainWindow.webContents.send('task-log-append-message', message, group);
}
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
    _updateTaskProgress(1, 1);
    for (const worker of __activeWorkers) {
        worker.stopWorker();
    }
    __activeWorkers = [];
    if (!__workerQueue.idle()) {
        __workerQueue.pause();
        __workerQueue.kill();
        __workerQueue = async_1.queue((_, cb) => cb(), 6);
    }
    if (__pythonServer.activeShell) {
        __pythonServer.killShell();
    }
    await __pythonServer.startPythonServer();
    if (await pythonApi_1.isPythonServerRunning()) {
        _log('Application Ready!');
    }
    else {
        _error('An error occured while starting the Python server!');
    }
    _appendMessageTaskLog('Beat Map Generation Canceled!');
});
/**
 * `__ready__` is a inter-process communication channel for altering the main process that the renderer is ready.
 * @param _event  The inter-process communication sender of `__ready__`.
 */
electron_1.ipcMain.on('__ready__', async (_event) => {
    // Start up the Python server
    __pythonServer = new pythonServer_1.default(_log, _error);
    await __pythonServer.startPythonServer();
    if (await pythonApi_1.isPythonServerRunning()) {
        _log('Application Ready!');
    }
    else {
        _error('An error occured while starting the Python server!');
    }
});
/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectDirectory__', _event => {
    const options = {
        title: 'Select a folder',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR ?? electron_1.app.getAppPath(),
        properties: ['openDirectory', 'multiSelections'],
    };
    electron_1.dialog
        .showOpenDialog(__mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            _event.sender.send('selectFilesDirs-finished', dirs.filePaths);
        }
    })
        .catch((err) => {
        _error(err);
    });
});
/**
 * `__selectFiles__` is a inter-process communication channel for opening a native OS file selection dialog.
 * @param _event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectFiles__', _event => {
    const options = {
        title: 'Select an audio file',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR ?? electron_1.app.getAppPath(),
        filters: [
            {
                name: 'Audio files',
                extensions: ['mp3', 'wav', 'flv', 'raw', 'ogg', 'egg'],
            },
        ],
        properties: ['openFile', 'multiSelections'],
    };
    electron_1.dialog
        .showOpenDialog(__mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            _event.sender.send('selectFilesDirs-finished', dirs.filePaths);
        }
    })
        .catch((err) => {
        _error(err);
    });
});
/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
electron_1.ipcMain.on('__selectOutDirectory__', _event => {
    const options = {
        title: 'Select a folder',
        defaultPath: process.env.PORTABLE_EXECUTABLE_DIR ?? electron_1.app.getAppPath(),
        properties: ['openDirectory'],
    };
    electron_1.dialog
        .showOpenDialog(__mainWindow, options)
        .then((dirs) => {
        if (!dirs.canceled) {
            _event.sender.send('selectOutDirectory-finished', dirs.filePaths[0]);
        }
    })
        .catch((err) => {
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
            _findFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/, (file) => {
                newDir.push(file);
            });
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
    totalCount = dir.length;
    _updateTaskProgress(currentCount, totalCount);
    const generate = async (file, generate_args) => {
        const worker = new worker_1.Worker(_appendMessageTaskLog, _error);
        __activeWorkers.push(worker);
        try {
            await worker.generateBeatMaps(file, generate_args);
        }
        catch (e) {
            _error(e);
        }
        finally {
            worker.stopWorker();
            __activeWorkers.filter(worker => worker.running);
        }
    };
    const generateWithTimeout = (file) => timeoutFunctionWithCallback(file, generate, () => {
        currentCount += 1;
        _updateTaskProgress(currentCount, totalCount);
    }, args);
    for (const file of dir) {
        __workerQueue.push(file, () => generateWithTimeout(file));
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2FwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1RUFBdUU7QUFDdkUsdUNBQTJGO0FBQzNGLDJDQUE2QjtBQUM3Qiw4Q0FBZ0M7QUFDaEMsaUNBQTJDO0FBRTNDLHFDQUFrQztBQUNsQyxrRUFBMEM7QUFDMUMsMkNBQW9EO0FBRXBELE1BQU0sMkJBQTJCLEdBQUcsQ0FDbEMsSUFBWSxFQUNaLEVBQXVDLEVBQ3ZDLEVBQWEsRUFDYixHQUFHLE9BQVksRUFDRCxFQUFFO0lBQ2hCLE1BQU0sZUFBZSxHQUFHLElBQUksT0FBTyxDQUFPLEtBQUssRUFBQyxPQUFPLEVBQUMsRUFBRTtRQUN4RCxNQUFNLEdBQUcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDWCxFQUFFLEVBQUUsQ0FBQztRQUNMLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNmLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxPQUFlLENBQUM7SUFDcEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDM0QsT0FBTyxHQUFHLFVBQVUsQ0FDbEIsQ0FBQyxHQUFVLEVBQUUsRUFBRTtZQUNiLE1BQU0sQ0FBQyxHQUFHLElBQUksYUFBYSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ2xDLEVBQUUsRUFBRSxDQUFDO1lBQ0wsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsQ0FBQyxFQUNELE1BQU0sRUFDTixJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUNsQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlLEVBQUUsY0FB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Y3JlYXRlIG5hdGl2ZSBicm93c2VyIHdpbmRvd1xyXG5pbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIGlwY01haW4sIGRpYWxvZywgUHJvZ3Jlc3NCYXJPcHRpb25zLCBzY3JlZW4gfSBmcm9tICdlbGVjdHJvbic7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCAqIGFzIGZzeCBmcm9tICdmcy1leHRyYSc7XHJcbmltcG9ydCB7IHF1ZXVlLCBRdWV1ZU9iamVjdCB9IGZyb20gJ2FzeW5jJztcclxuaW1wb3J0IF9fYmVhdE1hcEFyZ3MgZnJvbSAnLi9fX2JlYXRNYXBBcmdzJztcclxuaW1wb3J0IHsgV29ya2VyIH0gZnJvbSAnLi93b3JrZXInO1xyXG5pbXBvcnQgUHl0aG9uU2VydmVyIGZyb20gJy4vcHl0aG9uU2VydmVyJztcclxuaW1wb3J0IHsgaXNQeXRob25TZXJ2ZXJSdW5uaW5nIH0gZnJvbSAnLi9weXRob25BcGknO1xyXG5cclxuY29uc3QgdGltZW91dEZ1bmN0aW9uV2l0aENhbGxiYWNrID0gKFxyXG4gIGZpbGU6IHN0cmluZyxcclxuICBmbjogKGZpbGU6IHN0cmluZywgLi4uYXJnczogYW55KSA9PiBhbnksXHJcbiAgY2I6ICgpID0+IGFueSxcclxuICAuLi5mbl9hcmdzOiBhbnlcclxuKTogUHJvbWlzZTxhbnk+ID0+IHtcclxuICBjb25zdCBmdW5jdGlvblByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihhc3luYyByZXNvbHZlID0+IHtcclxuICAgIGNvbnN0IHJldCA9IGF3YWl0IGZuKGZpbGUsIC4uLmZuX2FyZ3MpO1xyXG4gICAgX2xvZyhmaWxlKTtcclxuICAgIGNiKCk7XHJcbiAgICByZXNvbHZlKHJldCk7XHJcbiAgfSk7XHJcbiAgbGV0IHRpbWVvdXQ6IG51bWJlcjtcclxuICBjb25zdCB0aW1lb3V0UHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KFxyXG4gICAgICAoZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgIF9lcnJvcihgJHtmaWxlfSBFcnJvcjogXFxuJHtlcnJ9YCk7XHJcbiAgICAgICAgY2IoKTtcclxuICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgfSxcclxuICAgICAgNDUwMDAwLFxyXG4gICAgICBuZXcgRXJyb3IoJ09wZXJhdGlvbiB0aW1lZCBvdXQuJylcclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiBQcm9taXNlLnJhY2UoW2Z1bmN0aW9uUHJvbWlzZSwgdGltZW91dFByb21pc2VdKS50aGVuKFxyXG4gICAgKHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xyXG4gICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICB9LFxyXG4gICAgKCkgPT4ge1xyXG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICk7XHJcbn07XHJcblxyXG5sZXQgX19tYWluV2luZG93OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93O1xyXG5sZXQgX19weXRob25TZXJ2ZXI6IFB5dGhvblNlcnZlcjtcclxubGV0IF9fd29ya2VyUXVldWUgPSBxdWV1ZSgoXywgY2IpID0+IGNiKCksIDYpO1xyXG5sZXQgX19hY3RpdmVXb3JrZXJzOiBXb3JrZXJbXSA9IFtdO1xyXG5cclxuLyoqXHJcbiAqIFRoaXMgbWV0aG9kIHdpbGwgYmUgY2FsbGVkIHdoZW4gRWxlY3Ryb24gaGFzIGZpbmlzaGVkXHJcbiAqIGluaXRpYWxpemF0aW9uIGFuZCBpcyByZWFkeSB0byBjcmVhdGUgYnJvd3NlciB3aW5kb3dzLlxyXG4gKiBTb21lIEFQSXMgY2FuIG9ubHkgYmUgdXNlZCBhZnRlciB0aGlzIGV2ZW50IG9jY3Vycy5cclxuICovXHJcbmFwcC5vbigncmVhZHknLCBhc3luYyAoKSA9PiB7XHJcbiAgX2NyZWF0ZU1haW5XaW5kb3coKTtcclxuICBhcHAub24oJ2FjdGl2YXRlJywgKCkgPT4ge1xyXG4gICAgLy8gT24gbWFjT1MgaXQncyBjb21tb24gdG8gcmUtY3JlYXRlIGEgd2luZG93IGluIHRoZSBhcHAgd2hlbiB0aGVcclxuICAgIC8vIGRvY2sgaWNvbiBpcyBjbGlja2VkIGFuZCB0aGVyZSBhcmUgbm8gb3RoZXIgd2luZG93cyBvcGVuLlxyXG4gICAgaWYgKEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmxlbmd0aCA9PT0gMCkgX2NyZWF0ZU1haW5XaW5kb3coKTtcclxuICB9KTtcclxufSk7XHJcblxyXG4vKipcclxuICogUXVpdCB3aGVuIGFsbCB3aW5kb3dzIGFyZSBjbG9zZWQuXHJcbiAqIE9uIE9TIFggaXQgaXMgY29tbW9uIGZvciBhcHBsaWNhdGlvbnMgYW5kIHRoZWlyIG1lbnUgYmFyXHJcbiAqIHRvIHN0YXkgYWN0aXZlIHVudGlsIHRoZSB1c2VyIHF1aXRzIGV4cGxpY2l0bHkgd2l0aCBDbWQgKyBRLlxyXG4gKi9cclxuYXBwLm9uKCd3aW5kb3ctYWxsLWNsb3NlZCcsICgpID0+IHtcclxuICAvLyBPbiBtYWNPUyBpdCBpcyBjb21tb24gZm9yIGFwcGxpY2F0aW9ucyBhbmQgdGhlaXIgbWVudSBiYXJcclxuICAvLyB0byBzdGF5IGFjdGl2ZSB1bnRpbCB0aGUgdXNlciBxdWl0cyBleHBsaWNpdGx5IHdpdGggQ21kICsgUVxyXG4gIGZvciAoY29uc3Qgd29ya2VyIG9mIF9fYWN0aXZlV29ya2Vycykge1xyXG4gICAgd29ya2VyLnN0b3BXb3JrZXIoKTtcclxuICB9XHJcbiAgX19hY3RpdmVXb3JrZXJzID0gW107XHJcbiAgX193b3JrZXJRdWV1ZS5raWxsKCk7XHJcbiAgaWYgKF9fcHl0aG9uU2VydmVyLmFjdGl2ZVNoZWxsKSB7XHJcbiAgICBfX3B5dGhvblNlcnZlci5raWxsU2hlbGwoKTtcclxuICB9XHJcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gIT09ICdkYXJ3aW4nKSBhcHAucXVpdCgpO1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBgX2NyZWF0ZU1haW5XaW5kb3coKWAgaXMgcmVzcG9uc2libGUgZm9yIHRoZSBpbml0aWFsIGNyZWF0aW9uIG9mIHRoZSBtYWluIHdpbmRvdy5cclxuICovXHJcbmZ1bmN0aW9uIF9jcmVhdGVNYWluV2luZG93KCkge1xyXG4gIGNvbnN0IGRpbWVuc2lvbnMgPSBzY3JlZW4uZ2V0UHJpbWFyeURpc3BsYXkoKS5zaXplO1xyXG4gIC8vIENyZWF0ZSB0aGUgYnJvd3NlciB3aW5kb3cuXHJcbiAgX19tYWluV2luZG93ID0gbmV3IEJyb3dzZXJXaW5kb3coe1xyXG4gICAgaGVpZ2h0OiBkaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICB3aWR0aDogZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICBhdXRvSGlkZU1lbnVCYXI6IHRydWUsXHJcbiAgICB3ZWJQcmVmZXJlbmNlczoge1xyXG4gICAgICBub2RlSW50ZWdyYXRpb246IHRydWUsXHJcbiAgICAgIGVuYWJsZVJlbW90ZU1vZHVsZTogdHJ1ZSxcclxuICAgICAgY29udGV4dElzb2xhdGlvbjogZmFsc2UsXHJcbiAgICB9LFxyXG4gIH0pO1xyXG5cclxuICAvLyBhbmQgbG9hZCB0aGUgaW5kZXguaHRtbCBvZiB0aGUgYXBwLlxyXG4gIF9fbWFpbldpbmRvdy5sb2FkRmlsZShwYXRoLmpvaW4oYXBwLmdldEFwcFBhdGgoKSwgJ2J1aWxkL2luZGV4Lmh0bWwnKSk7XHJcblxyXG4gIC8vIE9wZW4gdGhlIERldlRvb2xzLlxyXG4gIF9fbWFpbldpbmRvdy53ZWJDb250ZW50cy5vcGVuRGV2VG9vbHMoKVxyXG59XHJcblxyXG4vKipcclxuICogYF9sb2coKWAgaXMgcmVzcG9uc2libGUgZm9yIHNlbmRpbmcgbG9nIG1lc3NhZ2VzIHRvIHRoZSBDaHJvbWl1bSBDb25zb2xlLlxyXG4gKiBAcGFyYW0gbWVzc2FnZSAgVGhlIG1lc3NhZ2UgdG8gYmUgc2VudCB0byB0aGUgY29uc29sZS5cclxuICovXHJcbmZ1bmN0aW9uIF9sb2cobWVzc2FnZTogc3RyaW5nKSB7XHJcbiAgX19tYWluV2luZG93LndlYkNvbnRlbnRzLnNlbmQoJ2NvbnNvbGUtbG9nJywgbWVzc2FnZSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgX2Vycm9yKClgIGlzIHJlc3BvbnNpYmxlIGZvciBzZW5kaW5nIGVycm9yIG1lc3NhZ2VzIHRvIHRoZSBDaHJvbWl1bSBDb25zb2xlLlxyXG4gKiBAcGFyYW0gbWVzc2FnZSAgVGhlIG1lc3NhZ2UgdG8gYmUgc2VudCB0byB0aGUgY29uc29sZS5cclxuICovXHJcbmZ1bmN0aW9uIF9lcnJvcihtZXNzYWdlOiBzdHJpbmcpIHtcclxuICBfX21haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnY29uc29sZS1lcnJvcicsIG1lc3NhZ2UpO1xyXG59XHJcblxyXG4vKipcclxuICogYF91cGRhdGVUYXNrUHJvZ3Jlc3NgIGlzIHJlc3BvbnNpYmxlIGZvciB1cGRhdGluZ1xyXG4gKiB0aGUgcHJvZ3Jlc3MgYmFyIGluIHRoZSByZW5kZXIgcHJvY2VzcyB3aXRoIHRoZSBjdXJyZW50IGFuZCBtYXggdmFsdWVzIG9mIHRoZSBwcm9ncmVzcyBiYXIuXHJcbiAqIEBwYXJhbSB2YWx1ZSAgVGhlIGN1cnJlbnQgdmFsdWUgb2YgdGhlIHByb2dyZXNzIGJhci5cclxuICogQHBhcmFtIG1heFZhbHVlICBUaGUgbWF4aW11bSB2YWx1ZSBvZiB0aGUgcHJvZ3Jlc3MgYmFyLlxyXG4gKiBAcGFyYW0gb3B0aW9ucyBUaGUgb3B0aW9ucyB0byBwYXNzIHRvIHRoZSBwcm9ncmVzcyBiYXIsIHRoZSBkZWZhdWx0IGlzIHsgbW9kZTogJ25vcm1hbCcgfVxyXG4gKi9cclxuZnVuY3Rpb24gX3VwZGF0ZVRhc2tQcm9ncmVzcyh2YWx1ZTogbnVtYmVyLCBtYXhWYWx1ZTogbnVtYmVyLCBvcHRpb25zOiBQcm9ncmVzc0Jhck9wdGlvbnMgPSB7IG1vZGU6ICdub3JtYWwnIH0pIHtcclxuICBfX21haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgndGFzay1wcm9ncmVzcycsIHZhbHVlLCBtYXhWYWx1ZSk7XHJcbiAgaWYgKHZhbHVlIC8gbWF4VmFsdWUgPCAxKSBfX21haW5XaW5kb3cuc2V0UHJvZ3Jlc3NCYXIodmFsdWUgLyBtYXhWYWx1ZSwgb3B0aW9ucyk7XHJcbiAgZWxzZSBfX21haW5XaW5kb3cuc2V0UHJvZ3Jlc3NCYXIoLTEpO1xyXG59XHJcblxyXG4vKipcclxuICogYF9hcHBlbmRNZXNzYWdlVGFza0xvZ2AgaXMgcmVzcG9uc2libGUgZm9yIHNlbmRpbmdcclxuICogbG9nIG1lc3NhZ2VzIHRvIHRoZSB0YXNrIGxvZyBlbGVtZW50IHRoZSB1c2VyIHNlZXMuXHJcbiAqIEBwYXJhbSBtZXNzYWdlICBUaGUgbWVzc2FnZSB0byBiZSBzZW50IHRvIHRoZSB0YXNrIGxvZy5cclxuICovXHJcbmZ1bmN0aW9uIF9hcHBlbmRNZXNzYWdlVGFza0xvZyhtZXNzYWdlOiBzdHJpbmcsIGdyb3VwPzogc3RyaW5nKSB7XHJcbiAgX19tYWluV2luZG93LndlYkNvbnRlbnRzLnNlbmQoJ3Rhc2stbG9nLWFwcGVuZC1tZXNzYWdlJywgbWVzc2FnZSwgZ3JvdXApO1xyXG59XHJcblxyXG4vKipcclxuICogYF9maW5kRmlsZXNJbkRpcmAgaXMgYSBmdW5jdGlvbiB0aGF0IHJlY3Vyc2l2ZWx5IHNlYXJjaGVzIHRoZSBmaWxlcyB0aGF0IG1hdGNoIGEgZmlsdGVyIGluIGEgZGlyZWN0b3J5XHJcbiAqIGFuZCBydW5zIGEgY2FsbGJhY2sgb24gZWFjaCBmaWxlLlxyXG4gKiBAcGFyYW0gc3RhcnRQYXRoIFRoZSB0b3AtbW9zdCBsZXZlbCB0byBzdGFydCB0aGUgc2VhcmNoIGluLlxyXG4gKiBAcGFyYW0gZmlsdGVyIEEgcmVndWxhciBleHByZXNzaW9uIGZpbHRlciB0byBmaWx0ZXIgdGhlIHNlYXJjaCByZXN1bHRzLlxyXG4gKiBAcGFyYW0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBoYXZlIHJ1biBvbiBlYWNoIGZpbGUuXHJcbiAqL1xyXG5mdW5jdGlvbiBfZmluZEZpbGVzSW5EaXIoc3RhcnRQYXRoOiBzdHJpbmcsIGZpbHRlcjogUmVnRXhwLCBjYWxsYmFjazogRnVuY3Rpb24pIHtcclxuICBjb25zdCBmaWxlcyA9IGZzeC5yZWFkZGlyU3luYyhzdGFydFBhdGgpO1xyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IGZpbGVuYW1lID0gcGF0aC5qb2luKHN0YXJ0UGF0aCwgZmlsZXNbaV0pO1xyXG4gICAgY29uc3Qgc3RhdCA9IGZzeC5sc3RhdFN5bmMoZmlsZW5hbWUpO1xyXG4gICAgaWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xyXG4gICAgICBfZmluZEZpbGVzSW5EaXIoZmlsZW5hbWUsIGZpbHRlciwgY2FsbGJhY2spO1xyXG4gICAgfSBlbHNlIGlmIChmaWx0ZXIudGVzdChmaWxlbmFtZSkpIHtcclxuICAgICAgY2FsbGJhY2soZmlsZW5hbWUpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIGBfX2NhbmNlbE9wZXJhdGlvbl9fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBzdG9wcGluZyB0aGUgY3VycmVudCBvcGVyYXRpb24uXHJcbiAqIEBwYXJhbSBfZXZlbnQgIFRoZSBpbnRlci1wcm9jZXNzIGNvbW11bmljYXRpb24gc2VuZGVyIG9mIGBfX2NhbmNlbE9wZXJhdGlvbl9fYC5cclxuICovXHJcbmlwY01haW4ub24oJ19fY2FuY2VsT3BlcmF0aW9uX18nLCBhc3luYyBfZXZlbnQgPT4ge1xyXG4gIF91cGRhdGVUYXNrUHJvZ3Jlc3MoMSwgMSk7XHJcbiAgZm9yIChjb25zdCB3b3JrZXIgb2YgX19hY3RpdmVXb3JrZXJzKSB7XHJcbiAgICB3b3JrZXIuc3RvcFdvcmtlcigpO1xyXG4gIH1cclxuICBfX2FjdGl2ZVdvcmtlcnMgPSBbXTtcclxuICBpZiAoIV9fd29ya2VyUXVldWUuaWRsZSgpKSB7XHJcbiAgICBfX3dvcmtlclF1ZXVlLnBhdXNlKCk7XHJcbiAgICBfX3dvcmtlclF1ZXVlLmtpbGwoKTtcclxuICAgIF9fd29ya2VyUXVldWUgPSBxdWV1ZSgoXywgY2IpID0+IGNiKCksIDYpO1xyXG4gIH1cclxuICBpZiAoX19weXRob25TZXJ2ZXIuYWN0aXZlU2hlbGwpIHtcclxuICAgIF9fcHl0aG9uU2VydmVyLmtpbGxTaGVsbCgpO1xyXG4gIH1cclxuICBhd2FpdCBfX3B5dGhvblNlcnZlci5zdGFydFB5dGhvblNlcnZlcigpO1xyXG4gIGlmIChhd2FpdCBpc1B5dGhvblNlcnZlclJ1bm5pbmcoKSkge1xyXG4gICAgX2xvZygnQXBwbGljYXRpb24gUmVhZHkhJyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIF9lcnJvcignQW4gZXJyb3Igb2NjdXJlZCB3aGlsZSBzdGFydGluZyB0aGUgUHl0aG9uIHNlcnZlciEnKTtcclxuICB9XHJcbiAgX2FwcGVuZE1lc3NhZ2VUYXNrTG9nKCdCZWF0IE1hcCBHZW5lcmF0aW9uIENhbmNlbGVkIScpO1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBgX19yZWFkeV9fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBhbHRlcmluZyB0aGUgbWFpbiBwcm9jZXNzIHRoYXQgdGhlIHJlbmRlcmVyIGlzIHJlYWR5LlxyXG4gKiBAcGFyYW0gX2V2ZW50ICBUaGUgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIHNlbmRlciBvZiBgX19yZWFkeV9fYC5cclxuICovXHJcbmlwY01haW4ub24oJ19fcmVhZHlfXycsIGFzeW5jIF9ldmVudCA9PiB7XHJcbiAgLy8gU3RhcnQgdXAgdGhlIFB5dGhvbiBzZXJ2ZXJcclxuICBfX3B5dGhvblNlcnZlciA9IG5ldyBQeXRob25TZXJ2ZXIoX2xvZywgX2Vycm9yKTtcclxuICBhd2FpdCBfX3B5dGhvblNlcnZlci5zdGFydFB5dGhvblNlcnZlcigpO1xyXG4gIGlmIChhd2FpdCBpc1B5dGhvblNlcnZlclJ1bm5pbmcoKSkge1xyXG4gICAgX2xvZygnQXBwbGljYXRpb24gUmVhZHkhJyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIF9lcnJvcignQW4gZXJyb3Igb2NjdXJlZCB3aGlsZSBzdGFydGluZyB0aGUgUHl0aG9uIHNlcnZlciEnKTtcclxuICB9XHJcbn0pO1xyXG5cclxuLyoqXHJcbiAqIGBfX3NlbGVjdERpcmVjdG9yeV9fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBvcGVuaW5nIGEgbmF0aXZlIE9TIGRpcmVjdG9yeSBzZWxlY3Rpb24gZGlhbG9nLlxyXG4gKiBAcGFyYW0gX2V2ZW50ICBUaGUgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIHNlbmRlciBvZiBgX19zZWxlY3REaXJlY3RvcnlfX2AuXHJcbiAqIEByZXR1cm5zICAgICAgVGhlIGBfX3NlbGVjdERpcmVjdG9yeV9fYCBjaGFubmVsIHdpbGwgc2VuZCB0aGUgcmVzdWx0cyBvZiB0aGUgZGlhbG9nIGJhY2sgdG8gdGhlIGV2ZW50IHNlbmRlci5cclxuICovXHJcbmlwY01haW4ub24oJ19fc2VsZWN0RGlyZWN0b3J5X18nLCBfZXZlbnQgPT4ge1xyXG4gIGNvbnN0IG9wdGlvbnM6IEVsZWN0cm9uLk9wZW5EaWFsb2dPcHRpb25zID0ge1xyXG4gICAgdGl0bGU6ICdTZWxlY3QgYSBmb2xkZXInLFxyXG4gICAgZGVmYXVsdFBhdGg6IHByb2Nlc3MuZW52LlBPUlRBQkxFX0VYRUNVVEFCTEVfRElSID8/IGFwcC5nZXRBcHBQYXRoKCksXHJcbiAgICBwcm9wZXJ0aWVzOiBbJ29wZW5EaXJlY3RvcnknLCAnbXVsdGlTZWxlY3Rpb25zJ10sXHJcbiAgfTtcclxuXHJcbiAgZGlhbG9nXHJcbiAgICAuc2hvd09wZW5EaWFsb2coX19tYWluV2luZG93IGFzIEJyb3dzZXJXaW5kb3csIG9wdGlvbnMpXHJcbiAgICAudGhlbigoZGlyczogRWxlY3Ryb24uT3BlbkRpYWxvZ1JldHVyblZhbHVlKSA9PiB7XHJcbiAgICAgIGlmICghZGlycy5jYW5jZWxlZCkge1xyXG4gICAgICAgIF9ldmVudC5zZW5kZXIuc2VuZCgnc2VsZWN0RmlsZXNEaXJzLWZpbmlzaGVkJywgZGlycy5maWxlUGF0aHMpO1xyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKChlcnI6IHN0cmluZykgPT4ge1xyXG4gICAgICBfZXJyb3IoZXJyKTtcclxuICAgIH0pO1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBgX19zZWxlY3RGaWxlc19fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBvcGVuaW5nIGEgbmF0aXZlIE9TIGZpbGUgc2VsZWN0aW9uIGRpYWxvZy5cclxuICogQHBhcmFtIF9ldmVudCAgVGhlIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBzZW5kZXIgb2YgYF9fc2VsZWN0RmlsZXNfX2AuXHJcbiAqIEByZXR1cm5zICAgICAgVGhlIGBfX3NlbGVjdEZpbGVzX19gIGNoYW5uZWwgd2lsbCBzZW5kIHRoZSByZXN1bHRzIG9mIHRoZSBkaWFsb2cgYmFjayB0byB0aGUgZXZlbnQgc2VuZGVyLlxyXG4gKi9cclxuaXBjTWFpbi5vbignX19zZWxlY3RGaWxlc19fJywgX2V2ZW50ID0+IHtcclxuICBjb25zdCBvcHRpb25zOiBFbGVjdHJvbi5PcGVuRGlhbG9nT3B0aW9ucyA9IHtcclxuICAgIHRpdGxlOiAnU2VsZWN0IGFuIGF1ZGlvIGZpbGUnLFxyXG4gICAgZGVmYXVsdFBhdGg6IHByb2Nlc3MuZW52LlBPUlRBQkxFX0VYRUNVVEFCTEVfRElSID8/IGFwcC5nZXRBcHBQYXRoKCksXHJcbiAgICBmaWx0ZXJzOiBbXHJcbiAgICAgIHtcclxuICAgICAgICBuYW1lOiAnQXVkaW8gZmlsZXMnLFxyXG4gICAgICAgIGV4dGVuc2lvbnM6IFsnbXAzJywgJ3dhdicsICdmbHYnLCAncmF3JywgJ29nZycsICdlZ2cnXSxcclxuICAgICAgfSxcclxuICAgIF0sXHJcbiAgICBwcm9wZXJ0aWVzOiBbJ29wZW5GaWxlJywgJ211bHRpU2VsZWN0aW9ucyddLFxyXG4gIH07XHJcblxyXG4gIGRpYWxvZ1xyXG4gICAgLnNob3dPcGVuRGlhbG9nKF9fbWFpbldpbmRvdyBhcyBCcm93c2VyV2luZG93LCBvcHRpb25zKVxyXG4gICAgLnRoZW4oKGRpcnM6IEVsZWN0cm9uLk9wZW5EaWFsb2dSZXR1cm5WYWx1ZSkgPT4ge1xyXG4gICAgICBpZiAoIWRpcnMuY2FuY2VsZWQpIHtcclxuICAgICAgICBfZXZlbnQuc2VuZGVyLnNlbmQoJ3NlbGVjdEZpbGVzRGlycy1maW5pc2hlZCcsIGRpcnMuZmlsZVBhdGhzKTtcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIC5jYXRjaCgoZXJyOiBzdHJpbmcpID0+IHtcclxuICAgICAgX2Vycm9yKGVycik7XHJcbiAgICB9KTtcclxufSk7XHJcblxyXG4vKipcclxuICogYF9fc2VsZWN0RGlyZWN0b3J5X19gIGlzIGEgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIGNoYW5uZWwgZm9yIG9wZW5pbmcgYSBuYXRpdmUgT1MgZGlyZWN0b3J5IHNlbGVjdGlvbiBkaWFsb2cuXHJcbiAqIEBwYXJhbSBfZXZlbnQgIFRoZSBpbnRlci1wcm9jZXNzIGNvbW11bmljYXRpb24gc2VuZGVyIG9mIGBfX3NlbGVjdERpcmVjdG9yeV9fYC5cclxuICogQHJldHVybnMgICAgICBUaGUgYF9fc2VsZWN0RGlyZWN0b3J5X19gIGNoYW5uZWwgd2lsbCBzZW5kIHRoZSByZXN1bHRzIG9mIHRoZSBkaWFsb2cgYmFjayB0byB0aGUgZXZlbnQgc2VuZGVyLlxyXG4gKi9cclxuaXBjTWFpbi5vbignX19zZWxlY3RPdXREaXJlY3RvcnlfXycsIF9ldmVudCA9PiB7XHJcbiAgY29uc3Qgb3B0aW9uczogRWxlY3Ryb24uT3BlbkRpYWxvZ09wdGlvbnMgPSB7XHJcbiAgICB0aXRsZTogJ1NlbGVjdCBhIGZvbGRlcicsXHJcbiAgICBkZWZhdWx0UGF0aDogcHJvY2Vzcy5lbnYuUE9SVEFCTEVfRVhFQ1VUQUJMRV9ESVIgPz8gYXBwLmdldEFwcFBhdGgoKSxcclxuICAgIHByb3BlcnRpZXM6IFsnb3BlbkRpcmVjdG9yeSddLFxyXG4gIH07XHJcblxyXG4gIGRpYWxvZ1xyXG4gICAgLnNob3dPcGVuRGlhbG9nKF9fbWFpbldpbmRvdyBhcyBCcm93c2VyV2luZG93LCBvcHRpb25zKVxyXG4gICAgLnRoZW4oKGRpcnM6IEVsZWN0cm9uLk9wZW5EaWFsb2dSZXR1cm5WYWx1ZSkgPT4ge1xyXG4gICAgICBpZiAoIWRpcnMuY2FuY2VsZWQpIHtcclxuICAgICAgICBfZXZlbnQuc2VuZGVyLnNlbmQoJ3NlbGVjdE91dERpcmVjdG9yeS1maW5pc2hlZCcsIGRpcnMuZmlsZVBhdGhzWzBdKTtcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIC5jYXRjaCgoZXJyOiBzdHJpbmcpID0+IHtcclxuICAgICAgX2Vycm9yKGVycik7XHJcbiAgICB9KTtcclxufSk7XHJcblxyXG4vKipcclxuICogYF9nZW5lcmF0ZUJlYXRNYXBzYCBpcyBhIGZ1bmN0aW9uIGZvciBzdGFydGluZyB0aGUgYmVhdCBtYXAgZ2VuZXJhdGlvbi5cclxuICogQHBhcmFtIG9wVHlwZSBBIG51bWVyaWNhbCB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aGV0aGVyIHRoZSAnZGlyJyBpcyBhbiBhcnJheSBvZiBmaWxlIHBhdGhzIG9yIGZvbGRlciBwYXRoc1xyXG4gKiBAcGFyYW0gZGlyICBUaGUgcGF0aCBvZiB0aGUgZGlyZWN0b3J5L2ZpbGUgdG8gZ2VuZXJhdGUgdGhlIGJlYXQgbWFwIGZyb20uXHJcbiAqIEBwYXJhbSBhcmdzICBBIG1hcCBvZiBhcmd1bWVudHMgdG8gdXNlIGZvciBnZW5lcmF0aW5nIHRoZSBiZWF0IG1hcHNcclxuICovXHJcbmZ1bmN0aW9uIF9nZW5lcmF0ZUJlYXRNYXBzKG9wVHlwZTogbnVtYmVyLCBkaXI6IHN0cmluZ1tdLCBhcmdzOiBfX2JlYXRNYXBBcmdzKSB7XHJcbiAgbGV0IHRvdGFsQ291bnQgPSAwO1xyXG4gIGxldCBjdXJyZW50Q291bnQgPSAwO1xyXG5cclxuICBpZiAob3BUeXBlID09PSAwKSB7XHJcbiAgICAvLyBGb2xkZXJzXHJcbiAgICBsZXQgbmV3RGlyOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIGRpci5mb3JFYWNoKChmb2xkZXI6IHN0cmluZykgPT4ge1xyXG4gICAgICBfZmluZEZpbGVzSW5EaXIoZm9sZGVyLCAvbXAzfHdhdnxmbHZ8cmF3fG9nZ3xlZ2cvLCAoZmlsZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgbmV3RGlyLnB1c2goZmlsZSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgICB0b3RhbENvdW50ID0gbmV3RGlyLmxlbmd0aDtcclxuICAgIGRpciA9IG5ld0RpcjtcclxuICB9IGVsc2Uge1xyXG4gICAgLy8gRmlsZXNcclxuICAgIHRvdGFsQ291bnQgPSBkaXIubGVuZ3RoO1xyXG4gIH1cclxuXHJcbiAgX3VwZGF0ZVRhc2tQcm9ncmVzcyhjdXJyZW50Q291bnQsIHRvdGFsQ291bnQsIHsgbW9kZTogJ2luZGV0ZXJtaW5hdGUnIH0pO1xyXG4gIF9hcHBlbmRNZXNzYWdlVGFza0xvZygnQmVhdCBNYXAgU3ludGhlc2l6ZXIgU3RhcnRlZCEnKTtcclxuXHJcbiAgdG90YWxDb3VudCA9IGRpci5sZW5ndGg7XHJcbiAgX3VwZGF0ZVRhc2tQcm9ncmVzcyhjdXJyZW50Q291bnQsIHRvdGFsQ291bnQpO1xyXG5cclxuICBjb25zdCBnZW5lcmF0ZSA9IGFzeW5jIChmaWxlOiBzdHJpbmcsIGdlbmVyYXRlX2FyZ3M6IF9fYmVhdE1hcEFyZ3MpID0+IHtcclxuICAgIGNvbnN0IHdvcmtlciA9IG5ldyBXb3JrZXIoX2FwcGVuZE1lc3NhZ2VUYXNrTG9nLCBfZXJyb3IpO1xyXG4gICAgX19hY3RpdmVXb3JrZXJzLnB1c2god29ya2VyKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHdvcmtlci5nZW5lcmF0ZUJlYXRNYXBzKGZpbGUsIGdlbmVyYXRlX2FyZ3MpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBfZXJyb3IoZSBhcyBhbnkpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgd29ya2VyLnN0b3BXb3JrZXIoKTtcclxuICAgICAgX19hY3RpdmVXb3JrZXJzLmZpbHRlcih3b3JrZXIgPT4gd29ya2VyLnJ1bm5pbmcpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGNvbnN0IGdlbmVyYXRlV2l0aFRpbWVvdXQgPSAoZmlsZTogc3RyaW5nKSA9PlxyXG4gICAgdGltZW91dEZ1bmN0aW9uV2l0aENhbGxiYWNrKFxyXG4gICAgICBmaWxlLFxyXG4gICAgICBnZW5lcmF0ZSxcclxuICAgICAgKCkgPT4ge1xyXG4gICAgICAgIGN1cnJlbnRDb3VudCArPSAxO1xyXG4gICAgICAgIF91cGRhdGVUYXNrUHJvZ3Jlc3MoY3VycmVudENvdW50LCB0b3RhbENvdW50KTtcclxuICAgICAgfSxcclxuICAgICAgYXJnc1xyXG4gICAgKTtcclxuXHJcbiAgZm9yIChjb25zdCBmaWxlIG9mIGRpcikge1xyXG4gICAgX193b3JrZXJRdWV1ZS5wdXNoKGZpbGUsICgpID0+IGdlbmVyYXRlV2l0aFRpbWVvdXQoZmlsZSkpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIGBfX2dlbmVyYXRlQmVhdE1hcF9fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBzdGFydGluZyB0aGUgYmVhdCBtYXAgZ2VuZXJhdGlvbi5cclxuICogQHBhcmFtIF9ldmVudCAgVGhlIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBzZW5kZXIgb2YgYF9fZ2VuZXJhdGVCZWF0TWFwX19gLlxyXG4gKiBAcGFyYW0gb3BUeXBlIEEgbnVtZXJpY2FsIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoZXRoZXIgdGhlICdkaXInIGlzIGFuIGFycmF5IG9mIGZpbGUgcGF0aHMgb3IgZm9sZGVyIHBhdGhzXHJcbiAqIEBwYXJhbSBkaXIgIFRoZSBwYXRoIG9mIHRoZSBkaXJlY3RvcnkvZmlsZSB0byBnZW5lcmF0ZSB0aGUgYmVhdCBtYXAgZnJvbS5cclxuICogQHBhcmFtIGFyZ3MgIEEgbWFwIG9mIGFyZ3VtZW50cyB0byB1c2UgZm9yIGdlbmVyYXRpbmcgdGhlIGJlYXQgbWFwc1xyXG4gKi9cclxuaXBjTWFpbi5vbignX19nZW5lcmF0ZUJlYXRNYXBfXycsIChfZXZlbnQsIG9wVHlwZTogbnVtYmVyLCBkaXI6IHN0cmluZ1tdLCBhcmdzOiBfX2JlYXRNYXBBcmdzKSA9PiB7XHJcbiAgX2dlbmVyYXRlQmVhdE1hcHMob3BUeXBlLCBkaXIsIGFyZ3MpO1xyXG59KTtcclxuIl19