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
Object.defineProperty(exports, "__esModule", { value: true });
// Modules to control application life and create native browser window
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fsx = __importStar(require("fs-extra"));
const worker_1 = require("./worker");
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
/**
 * `__mainWindow` is the render process window the user interacts with.
 */
let __mainWindow;
/**
 * `__activeWorkers` is an array of active workers.
 */
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
    __activeWorkers.forEach(worker => worker.killShell());
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
    // mainWindow.webContents.openDevTools()
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
electron_1.ipcMain.on('__cancelOperation__', _event => {
    __activeWorkers.forEach(worker => worker.killShell());
    _appendMessageTaskLog('Beat Map Generation Canceled!');
});
/**
 * `__ready__` is a inter-process communication channel for altering the main process that the renderer is ready.
 * @param _event  The inter-process communication sender of `__ready__`.
 */
electron_1.ipcMain.on('__ready__', async (_event) => {
    new worker_1.Worker(_appendMessageTaskLog, _log, _error); // Init a worker to run python startup procedures.
    _log('Application Ready!');
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
        const worker = new worker_1.Worker(_appendMessageTaskLog, _log, _error);
        __activeWorkers.push(worker);
        try {
            await worker.generateBeatMaps(file, generate_args);
        }
        catch (e) {
            _error(e);
        }
        worker.killShell();
    };
    const promises = dir.map((file) => timeoutFunctionWithCallback(file, generate, () => {
        currentCount += 1;
        _updateTaskProgress(currentCount, totalCount);
    }, args));
    Promise.all(promises).then(() => {
        __activeWorkers.forEach(worker => worker.killShell());
        __activeWorkers = [];
        _appendMessageTaskLog('Beat Map Synthesizer Finished!');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2FwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1RUFBdUU7QUFDdkUsdUNBQTJGO0FBQzNGLDJDQUE2QjtBQUM3Qiw4Q0FBZ0M7QUFFaEMscUNBQWtDO0FBRWxDLE1BQU0sMkJBQTJCLEdBQUcsQ0FDbEMsSUFBWSxFQUNaLEVBQXVDLEVBQ3ZDLEVBQWEsRUFDYixHQUFHLE9BQVksRUFDRCxFQUFFO0lBQ2hCLE1BQU0sZUFBZSxHQUFHLElBQUksT0FBTyxDQUFPLEtBQUssRUFBQyxPQUFPLEVBQUMsRUFBRTtRQUN4RCxNQUFNLEdBQUcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDWCxFQUFFLEVBQUUsQ0FBQztRQUNMLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNmLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxPQUFlLENBQUM7SUFDcEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDM0QsT0FBTyxHQUFHLFVBQVUsQ0FDbEIsQ0FBQyxHQUFVLEVBQUUsRUFBRTtZQUNiLE1BQU0sQ0FBQyxHQUFHLElBQUksYUFBYSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ2xDLEVBQUUsRUFBRSxDQUFDO1lBQ0wsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsQ0FBQyxFQUNELE1BQU0sRUFDTixJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUNsQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQ3pELENBQUMsS0FBVSxFQUFF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IjpbIi8vIE1vZHVsZXMgdG8gY29udHJvbCBhcHBsaWNhdGlvbiBsaWZlIGFuZCBjcmVhdGUgbmF0aXZlIGJyb3dzZXIgd2luZG93XHJcbmltcG9ydCB7IGFwcCwgQnJvd3NlcldpbmRvdywgaXBjTWFpbiwgZGlhbG9nLCBQcm9ncmVzc0Jhck9wdGlvbnMsIHNjcmVlbiB9IGZyb20gJ2VsZWN0cm9uJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0ICogYXMgZnN4IGZyb20gJ2ZzLWV4dHJhJztcclxuaW1wb3J0IF9fYmVhdE1hcEFyZ3MgZnJvbSAnLi9fX2JlYXRNYXBBcmdzJztcclxuaW1wb3J0IHsgV29ya2VyIH0gZnJvbSAnLi93b3JrZXInO1xyXG5cclxuY29uc3QgdGltZW91dEZ1bmN0aW9uV2l0aENhbGxiYWNrID0gKFxyXG4gIGZpbGU6IHN0cmluZyxcclxuICBmbjogKGZpbGU6IHN0cmluZywgLi4uYXJnczogYW55KSA9PiBhbnksXHJcbiAgY2I6ICgpID0+IGFueSxcclxuICAuLi5mbl9hcmdzOiBhbnlcclxuKTogUHJvbWlzZTxhbnk+ID0+IHtcclxuICBjb25zdCBmdW5jdGlvblByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihhc3luYyByZXNvbHZlID0+IHtcclxuICAgIGNvbnN0IHJldCA9IGF3YWl0IGZuKGZpbGUsIC4uLmZuX2FyZ3MpO1xyXG4gICAgX2xvZyhmaWxlKTtcclxuICAgIGNiKCk7XHJcbiAgICByZXNvbHZlKHJldCk7XHJcbiAgfSk7XHJcbiAgbGV0IHRpbWVvdXQ6IG51bWJlcjtcclxuICBjb25zdCB0aW1lb3V0UHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KFxyXG4gICAgICAoZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgIF9lcnJvcihgJHtmaWxlfSBFcnJvcjogXFxuJHtlcnJ9YCk7XHJcbiAgICAgICAgY2IoKTtcclxuICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgfSxcclxuICAgICAgNDUwMDAwLFxyXG4gICAgICBuZXcgRXJyb3IoJ09wZXJhdGlvbiB0aW1lZCBvdXQuJylcclxuICAgICk7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiBQcm9taXNlLnJhY2UoW2Z1bmN0aW9uUHJvbWlzZSwgdGltZW91dFByb21pc2VdKS50aGVuKFxyXG4gICAgKHZhbHVlOiBhbnkpID0+IHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xyXG4gICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICB9LFxyXG4gICAgKCkgPT4ge1xyXG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gICk7XHJcbn07XHJcblxyXG4vKipcclxuICogYF9fbWFpbldpbmRvd2AgaXMgdGhlIHJlbmRlciBwcm9jZXNzIHdpbmRvdyB0aGUgdXNlciBpbnRlcmFjdHMgd2l0aC5cclxuICovXHJcbmxldCBfX21haW5XaW5kb3c6IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XHJcblxyXG4vKipcclxuICogYF9fYWN0aXZlV29ya2Vyc2AgaXMgYW4gYXJyYXkgb2YgYWN0aXZlIHdvcmtlcnMuXHJcbiAqL1xyXG5sZXQgX19hY3RpdmVXb3JrZXJzOiBXb3JrZXJbXSA9IFtdO1xyXG5cclxuLyoqXHJcbiAqIFRoaXMgbWV0aG9kIHdpbGwgYmUgY2FsbGVkIHdoZW4gRWxlY3Ryb24gaGFzIGZpbmlzaGVkXHJcbiAqIGluaXRpYWxpemF0aW9uIGFuZCBpcyByZWFkeSB0byBjcmVhdGUgYnJvd3NlciB3aW5kb3dzLlxyXG4gKiBTb21lIEFQSXMgY2FuIG9ubHkgYmUgdXNlZCBhZnRlciB0aGlzIGV2ZW50IG9jY3Vycy5cclxuICovXHJcbmFwcC5vbigncmVhZHknLCBhc3luYyAoKSA9PiB7XHJcbiAgX2NyZWF0ZU1haW5XaW5kb3coKTtcclxuICBhcHAub24oJ2FjdGl2YXRlJywgKCkgPT4ge1xyXG4gICAgLy8gT24gbWFjT1MgaXQncyBjb21tb24gdG8gcmUtY3JlYXRlIGEgd2luZG93IGluIHRoZSBhcHAgd2hlbiB0aGVcclxuICAgIC8vIGRvY2sgaWNvbiBpcyBjbGlja2VkIGFuZCB0aGVyZSBhcmUgbm8gb3RoZXIgd2luZG93cyBvcGVuLlxyXG4gICAgaWYgKEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmxlbmd0aCA9PT0gMCkgX2NyZWF0ZU1haW5XaW5kb3coKTtcclxuICB9KTtcclxufSk7XHJcblxyXG4vKipcclxuICogUXVpdCB3aGVuIGFsbCB3aW5kb3dzIGFyZSBjbG9zZWQuXHJcbiAqIE9uIE9TIFggaXQgaXMgY29tbW9uIGZvciBhcHBsaWNhdGlvbnMgYW5kIHRoZWlyIG1lbnUgYmFyXHJcbiAqIHRvIHN0YXkgYWN0aXZlIHVudGlsIHRoZSB1c2VyIHF1aXRzIGV4cGxpY2l0bHkgd2l0aCBDbWQgKyBRLlxyXG4gKi9cclxuYXBwLm9uKCd3aW5kb3ctYWxsLWNsb3NlZCcsICgpID0+IHtcclxuICAvLyBPbiBtYWNPUyBpdCBpcyBjb21tb24gZm9yIGFwcGxpY2F0aW9ucyBhbmQgdGhlaXIgbWVudSBiYXJcclxuICAvLyB0byBzdGF5IGFjdGl2ZSB1bnRpbCB0aGUgdXNlciBxdWl0cyBleHBsaWNpdGx5IHdpdGggQ21kICsgUVxyXG4gIF9fYWN0aXZlV29ya2Vycy5mb3JFYWNoKHdvcmtlciA9PiB3b3JrZXIua2lsbFNoZWxsKCkpO1xyXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnZGFyd2luJykgYXBwLnF1aXQoKTtcclxufSk7XHJcblxyXG4vKipcclxuICogYF9jcmVhdGVNYWluV2luZG93KClgIGlzIHJlc3BvbnNpYmxlIGZvciB0aGUgaW5pdGlhbCBjcmVhdGlvbiBvZiB0aGUgbWFpbiB3aW5kb3cuXHJcbiAqL1xyXG5mdW5jdGlvbiBfY3JlYXRlTWFpbldpbmRvdygpIHtcclxuICBjb25zdCBkaW1lbnNpb25zID0gc2NyZWVuLmdldFByaW1hcnlEaXNwbGF5KCkuc2l6ZTtcclxuICAvLyBDcmVhdGUgdGhlIGJyb3dzZXIgd2luZG93LlxyXG4gIF9fbWFpbldpbmRvdyA9IG5ldyBCcm93c2VyV2luZG93KHtcclxuICAgIGhlaWdodDogZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgd2lkdGg6IGRpbWVuc2lvbnMud2lkdGggLyAyLFxyXG4gICAgYXV0b0hpZGVNZW51QmFyOiB0cnVlLFxyXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcclxuICAgICAgbm9kZUludGVncmF0aW9uOiB0cnVlLFxyXG4gICAgICBlbmFibGVSZW1vdGVNb2R1bGU6IHRydWUsXHJcbiAgICAgIGNvbnRleHRJc29sYXRpb246IGZhbHNlLFxyXG4gICAgfSxcclxuICB9KTtcclxuXHJcbiAgLy8gYW5kIGxvYWQgdGhlIGluZGV4Lmh0bWwgb2YgdGhlIGFwcC5cclxuICBfX21haW5XaW5kb3cubG9hZEZpbGUocGF0aC5qb2luKGFwcC5nZXRBcHBQYXRoKCksICdidWlsZC9pbmRleC5odG1sJykpO1xyXG5cclxuICAvLyBPcGVuIHRoZSBEZXZUb29scy5cclxuICAvLyBtYWluV2luZG93LndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgX2xvZygpYCBpcyByZXNwb25zaWJsZSBmb3Igc2VuZGluZyBsb2cgbWVzc2FnZXMgdG8gdGhlIENocm9taXVtIENvbnNvbGUuXHJcbiAqIEBwYXJhbSBtZXNzYWdlICBUaGUgbWVzc2FnZSB0byBiZSBzZW50IHRvIHRoZSBjb25zb2xlLlxyXG4gKi9cclxuZnVuY3Rpb24gX2xvZyhtZXNzYWdlOiBzdHJpbmcpIHtcclxuICBfX21haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgnY29uc29sZS1sb2cnLCBtZXNzYWdlKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIGBfZXJyb3IoKWAgaXMgcmVzcG9uc2libGUgZm9yIHNlbmRpbmcgZXJyb3IgbWVzc2FnZXMgdG8gdGhlIENocm9taXVtIENvbnNvbGUuXHJcbiAqIEBwYXJhbSBtZXNzYWdlICBUaGUgbWVzc2FnZSB0byBiZSBzZW50IHRvIHRoZSBjb25zb2xlLlxyXG4gKi9cclxuZnVuY3Rpb24gX2Vycm9yKG1lc3NhZ2U6IHN0cmluZykge1xyXG4gIF9fbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCdjb25zb2xlLWVycm9yJywgbWVzc2FnZSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgX3VwZGF0ZVRhc2tQcm9ncmVzc2AgaXMgcmVzcG9uc2libGUgZm9yIHVwZGF0aW5nXHJcbiAqIHRoZSBwcm9ncmVzcyBiYXIgaW4gdGhlIHJlbmRlciBwcm9jZXNzIHdpdGggdGhlIGN1cnJlbnQgYW5kIG1heCB2YWx1ZXMgb2YgdGhlIHByb2dyZXNzIGJhci5cclxuICogQHBhcmFtIHZhbHVlICBUaGUgY3VycmVudCB2YWx1ZSBvZiB0aGUgcHJvZ3Jlc3MgYmFyLlxyXG4gKiBAcGFyYW0gbWF4VmFsdWUgIFRoZSBtYXhpbXVtIHZhbHVlIG9mIHRoZSBwcm9ncmVzcyBiYXIuXHJcbiAqIEBwYXJhbSBvcHRpb25zIFRoZSBvcHRpb25zIHRvIHBhc3MgdG8gdGhlIHByb2dyZXNzIGJhciwgdGhlIGRlZmF1bHQgaXMgeyBtb2RlOiAnbm9ybWFsJyB9XHJcbiAqL1xyXG5mdW5jdGlvbiBfdXBkYXRlVGFza1Byb2dyZXNzKHZhbHVlOiBudW1iZXIsIG1heFZhbHVlOiBudW1iZXIsIG9wdGlvbnM6IFByb2dyZXNzQmFyT3B0aW9ucyA9IHsgbW9kZTogJ25vcm1hbCcgfSkge1xyXG4gIF9fbWFpbldpbmRvdy53ZWJDb250ZW50cy5zZW5kKCd0YXNrLXByb2dyZXNzJywgdmFsdWUsIG1heFZhbHVlKTtcclxuICBpZiAodmFsdWUgLyBtYXhWYWx1ZSA8IDEpIF9fbWFpbldpbmRvdy5zZXRQcm9ncmVzc0Jhcih2YWx1ZSAvIG1heFZhbHVlLCBvcHRpb25zKTtcclxuICBlbHNlIF9fbWFpbldpbmRvdy5zZXRQcm9ncmVzc0JhcigtMSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgX2FwcGVuZE1lc3NhZ2VUYXNrTG9nYCBpcyByZXNwb25zaWJsZSBmb3Igc2VuZGluZ1xyXG4gKiBsb2cgbWVzc2FnZXMgdG8gdGhlIHRhc2sgbG9nIGVsZW1lbnQgdGhlIHVzZXIgc2Vlcy5cclxuICogQHBhcmFtIG1lc3NhZ2UgIFRoZSBtZXNzYWdlIHRvIGJlIHNlbnQgdG8gdGhlIHRhc2sgbG9nLlxyXG4gKi9cclxuZnVuY3Rpb24gX2FwcGVuZE1lc3NhZ2VUYXNrTG9nKG1lc3NhZ2U6IHN0cmluZywgZ3JvdXA/OiBzdHJpbmcpIHtcclxuICBfX21haW5XaW5kb3cud2ViQ29udGVudHMuc2VuZCgndGFzay1sb2ctYXBwZW5kLW1lc3NhZ2UnLCBtZXNzYWdlLCBncm91cCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgX2ZpbmRGaWxlc0luRGlyYCBpcyBhIGZ1bmN0aW9uIHRoYXQgcmVjdXJzaXZlbHkgc2VhcmNoZXMgdGhlIGZpbGVzIHRoYXQgbWF0Y2ggYSBmaWx0ZXIgaW4gYSBkaXJlY3RvcnlcclxuICogYW5kIHJ1bnMgYSBjYWxsYmFjayBvbiBlYWNoIGZpbGUuXHJcbiAqIEBwYXJhbSBzdGFydFBhdGggVGhlIHRvcC1tb3N0IGxldmVsIHRvIHN0YXJ0IHRoZSBzZWFyY2ggaW4uXHJcbiAqIEBwYXJhbSBmaWx0ZXIgQSByZWd1bGFyIGV4cHJlc3Npb24gZmlsdGVyIHRvIGZpbHRlciB0aGUgc2VhcmNoIHJlc3VsdHMuXHJcbiAqIEBwYXJhbSBjYWxsYmFjayBBIGZ1bmN0aW9uIHRvIGhhdmUgcnVuIG9uIGVhY2ggZmlsZS5cclxuICovXHJcbmZ1bmN0aW9uIF9maW5kRmlsZXNJbkRpcihzdGFydFBhdGg6IHN0cmluZywgZmlsdGVyOiBSZWdFeHAsIGNhbGxiYWNrOiBGdW5jdGlvbikge1xyXG4gIGNvbnN0IGZpbGVzID0gZnN4LnJlYWRkaXJTeW5jKHN0YXJ0UGF0aCk7XHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWxlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3QgZmlsZW5hbWUgPSBwYXRoLmpvaW4oc3RhcnRQYXRoLCBmaWxlc1tpXSk7XHJcbiAgICBjb25zdCBzdGF0ID0gZnN4LmxzdGF0U3luYyhmaWxlbmFtZSk7XHJcbiAgICBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpKSB7XHJcbiAgICAgIF9maW5kRmlsZXNJbkRpcihmaWxlbmFtZSwgZmlsdGVyLCBjYWxsYmFjayk7XHJcbiAgICB9IGVsc2UgaWYgKGZpbHRlci50ZXN0KGZpbGVuYW1lKSkge1xyXG4gICAgICBjYWxsYmFjayhmaWxlbmFtZSk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogYF9fY2FuY2VsT3BlcmF0aW9uX19gIGlzIGEgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIGNoYW5uZWwgZm9yIHN0b3BwaW5nIHRoZSBjdXJyZW50IG9wZXJhdGlvbi5cclxuICogQHBhcmFtIF9ldmVudCAgVGhlIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBzZW5kZXIgb2YgYF9fY2FuY2VsT3BlcmF0aW9uX19gLlxyXG4gKi9cclxuaXBjTWFpbi5vbignX19jYW5jZWxPcGVyYXRpb25fXycsIF9ldmVudCA9PiB7XHJcbiAgX19hY3RpdmVXb3JrZXJzLmZvckVhY2god29ya2VyID0+IHdvcmtlci5raWxsU2hlbGwoKSk7XHJcbiAgX2FwcGVuZE1lc3NhZ2VUYXNrTG9nKCdCZWF0IE1hcCBHZW5lcmF0aW9uIENhbmNlbGVkIScpO1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBgX19yZWFkeV9fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBhbHRlcmluZyB0aGUgbWFpbiBwcm9jZXNzIHRoYXQgdGhlIHJlbmRlcmVyIGlzIHJlYWR5LlxyXG4gKiBAcGFyYW0gX2V2ZW50ICBUaGUgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIHNlbmRlciBvZiBgX19yZWFkeV9fYC5cclxuICovXHJcbmlwY01haW4ub24oJ19fcmVhZHlfXycsIGFzeW5jIF9ldmVudCA9PiB7XHJcbiAgbmV3IFdvcmtlcihfYXBwZW5kTWVzc2FnZVRhc2tMb2csIF9sb2csIF9lcnJvcik7IC8vIEluaXQgYSB3b3JrZXIgdG8gcnVuIHB5dGhvbiBzdGFydHVwIHByb2NlZHVyZXMuXHJcbiAgX2xvZygnQXBwbGljYXRpb24gUmVhZHkhJyk7XHJcbn0pO1xyXG5cclxuLyoqXHJcbiAqIGBfX3NlbGVjdERpcmVjdG9yeV9fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBvcGVuaW5nIGEgbmF0aXZlIE9TIGRpcmVjdG9yeSBzZWxlY3Rpb24gZGlhbG9nLlxyXG4gKiBAcGFyYW0gX2V2ZW50ICBUaGUgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIHNlbmRlciBvZiBgX19zZWxlY3REaXJlY3RvcnlfX2AuXHJcbiAqIEByZXR1cm5zICAgICAgVGhlIGBfX3NlbGVjdERpcmVjdG9yeV9fYCBjaGFubmVsIHdpbGwgc2VuZCB0aGUgcmVzdWx0cyBvZiB0aGUgZGlhbG9nIGJhY2sgdG8gdGhlIGV2ZW50IHNlbmRlci5cclxuICovXHJcbmlwY01haW4ub24oJ19fc2VsZWN0RGlyZWN0b3J5X18nLCBfZXZlbnQgPT4ge1xyXG4gIGNvbnN0IG9wdGlvbnM6IEVsZWN0cm9uLk9wZW5EaWFsb2dPcHRpb25zID0ge1xyXG4gICAgdGl0bGU6ICdTZWxlY3QgYSBmb2xkZXInLFxyXG4gICAgZGVmYXVsdFBhdGg6IHByb2Nlc3MuZW52LlBPUlRBQkxFX0VYRUNVVEFCTEVfRElSID8/IGFwcC5nZXRBcHBQYXRoKCksXHJcbiAgICBwcm9wZXJ0aWVzOiBbJ29wZW5EaXJlY3RvcnknLCAnbXVsdGlTZWxlY3Rpb25zJ10sXHJcbiAgfTtcclxuXHJcbiAgZGlhbG9nXHJcbiAgICAuc2hvd09wZW5EaWFsb2coX19tYWluV2luZG93IGFzIEJyb3dzZXJXaW5kb3csIG9wdGlvbnMpXHJcbiAgICAudGhlbigoZGlyczogRWxlY3Ryb24uT3BlbkRpYWxvZ1JldHVyblZhbHVlKSA9PiB7XHJcbiAgICAgIGlmICghZGlycy5jYW5jZWxlZCkge1xyXG4gICAgICAgIF9ldmVudC5zZW5kZXIuc2VuZCgnc2VsZWN0RmlsZXNEaXJzLWZpbmlzaGVkJywgZGlycy5maWxlUGF0aHMpO1xyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKChlcnI6IHN0cmluZykgPT4ge1xyXG4gICAgICBfZXJyb3IoZXJyKTtcclxuICAgIH0pO1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBgX19zZWxlY3RGaWxlc19fYCBpcyBhIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBjaGFubmVsIGZvciBvcGVuaW5nIGEgbmF0aXZlIE9TIGZpbGUgc2VsZWN0aW9uIGRpYWxvZy5cclxuICogQHBhcmFtIF9ldmVudCAgVGhlIGludGVyLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBzZW5kZXIgb2YgYF9fc2VsZWN0RmlsZXNfX2AuXHJcbiAqIEByZXR1cm5zICAgICAgVGhlIGBfX3NlbGVjdEZpbGVzX19gIGNoYW5uZWwgd2lsbCBzZW5kIHRoZSByZXN1bHRzIG9mIHRoZSBkaWFsb2cgYmFjayB0byB0aGUgZXZlbnQgc2VuZGVyLlxyXG4gKi9cclxuaXBjTWFpbi5vbignX19zZWxlY3RGaWxlc19fJywgX2V2ZW50ID0+IHtcclxuICBjb25zdCBvcHRpb25zOiBFbGVjdHJvbi5PcGVuRGlhbG9nT3B0aW9ucyA9IHtcclxuICAgIHRpdGxlOiAnU2VsZWN0IGFuIGF1ZGlvIGZpbGUnLFxyXG4gICAgZGVmYXVsdFBhdGg6IHByb2Nlc3MuZW52LlBPUlRBQkxFX0VYRUNVVEFCTEVfRElSID8/IGFwcC5nZXRBcHBQYXRoKCksXHJcbiAgICBmaWx0ZXJzOiBbXHJcbiAgICAgIHtcclxuICAgICAgICBuYW1lOiAnQXVkaW8gZmlsZXMnLFxyXG4gICAgICAgIGV4dGVuc2lvbnM6IFsnbXAzJywgJ3dhdicsICdmbHYnLCAncmF3JywgJ29nZycsICdlZ2cnXSxcclxuICAgICAgfSxcclxuICAgIF0sXHJcbiAgICBwcm9wZXJ0aWVzOiBbJ29wZW5GaWxlJywgJ211bHRpU2VsZWN0aW9ucyddLFxyXG4gIH07XHJcblxyXG4gIGRpYWxvZ1xyXG4gICAgLnNob3dPcGVuRGlhbG9nKF9fbWFpbldpbmRvdyBhcyBCcm93c2VyV2luZG93LCBvcHRpb25zKVxyXG4gICAgLnRoZW4oKGRpcnM6IEVsZWN0cm9uLk9wZW5EaWFsb2dSZXR1cm5WYWx1ZSkgPT4ge1xyXG4gICAgICBpZiAoIWRpcnMuY2FuY2VsZWQpIHtcclxuICAgICAgICBfZXZlbnQuc2VuZGVyLnNlbmQoJ3NlbGVjdEZpbGVzRGlycy1maW5pc2hlZCcsIGRpcnMuZmlsZVBhdGhzKTtcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIC5jYXRjaCgoZXJyOiBzdHJpbmcpID0+IHtcclxuICAgICAgX2Vycm9yKGVycik7XHJcbiAgICB9KTtcclxufSk7XHJcblxyXG4vKipcclxuICogYF9fc2VsZWN0RGlyZWN0b3J5X19gIGlzIGEgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIGNoYW5uZWwgZm9yIG9wZW5pbmcgYSBuYXRpdmUgT1MgZGlyZWN0b3J5IHNlbGVjdGlvbiBkaWFsb2cuXHJcbiAqIEBwYXJhbSBfZXZlbnQgIFRoZSBpbnRlci1wcm9jZXNzIGNvbW11bmljYXRpb24gc2VuZGVyIG9mIGBfX3NlbGVjdERpcmVjdG9yeV9fYC5cclxuICogQHJldHVybnMgICAgICBUaGUgYF9fc2VsZWN0RGlyZWN0b3J5X19gIGNoYW5uZWwgd2lsbCBzZW5kIHRoZSByZXN1bHRzIG9mIHRoZSBkaWFsb2cgYmFjayB0byB0aGUgZXZlbnQgc2VuZGVyLlxyXG4gKi9cclxuaXBjTWFpbi5vbignX19zZWxlY3RPdXREaXJlY3RvcnlfXycsIF9ldmVudCA9PiB7XHJcbiAgY29uc3Qgb3B0aW9uczogRWxlY3Ryb24uT3BlbkRpYWxvZ09wdGlvbnMgPSB7XHJcbiAgICB0aXRsZTogJ1NlbGVjdCBhIGZvbGRlcicsXHJcbiAgICBkZWZhdWx0UGF0aDogcHJvY2Vzcy5lbnYuUE9SVEFCTEVfRVhFQ1VUQUJMRV9ESVIgPz8gYXBwLmdldEFwcFBhdGgoKSxcclxuICAgIHByb3BlcnRpZXM6IFsnb3BlbkRpcmVjdG9yeSddLFxyXG4gIH07XHJcblxyXG4gIGRpYWxvZ1xyXG4gICAgLnNob3dPcGVuRGlhbG9nKF9fbWFpbldpbmRvdyBhcyBCcm93c2VyV2luZG93LCBvcHRpb25zKVxyXG4gICAgLnRoZW4oKGRpcnM6IEVsZWN0cm9uLk9wZW5EaWFsb2dSZXR1cm5WYWx1ZSkgPT4ge1xyXG4gICAgICBpZiAoIWRpcnMuY2FuY2VsZWQpIHtcclxuICAgICAgICBfZXZlbnQuc2VuZGVyLnNlbmQoJ3NlbGVjdE91dERpcmVjdG9yeS1maW5pc2hlZCcsIGRpcnMuZmlsZVBhdGhzWzBdKTtcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIC5jYXRjaCgoZXJyOiBzdHJpbmcpID0+IHtcclxuICAgICAgX2Vycm9yKGVycik7XHJcbiAgICB9KTtcclxufSk7XHJcblxyXG4vKipcclxuICogYF9nZW5lcmF0ZUJlYXRNYXBzYCBpcyBhIGZ1bmN0aW9uIGZvciBzdGFydGluZyB0aGUgYmVhdCBtYXAgZ2VuZXJhdGlvbi5cclxuICogQHBhcmFtIG9wVHlwZSBBIG51bWVyaWNhbCB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aGV0aGVyIHRoZSAnZGlyJyBpcyBhbiBhcnJheSBvZiBmaWxlIHBhdGhzIG9yIGZvbGRlciBwYXRoc1xyXG4gKiBAcGFyYW0gZGlyICBUaGUgcGF0aCBvZiB0aGUgZGlyZWN0b3J5L2ZpbGUgdG8gZ2VuZXJhdGUgdGhlIGJlYXQgbWFwIGZyb20uXHJcbiAqIEBwYXJhbSBhcmdzICBBIG1hcCBvZiBhcmd1bWVudHMgdG8gdXNlIGZvciBnZW5lcmF0aW5nIHRoZSBiZWF0IG1hcHNcclxuICovXHJcbmZ1bmN0aW9uIF9nZW5lcmF0ZUJlYXRNYXBzKG9wVHlwZTogbnVtYmVyLCBkaXI6IHN0cmluZ1tdLCBhcmdzOiBfX2JlYXRNYXBBcmdzKSB7XHJcbiAgbGV0IHRvdGFsQ291bnQgPSAwO1xyXG4gIGxldCBjdXJyZW50Q291bnQgPSAwO1xyXG5cclxuICBpZiAob3BUeXBlID09PSAwKSB7XHJcbiAgICAvLyBGb2xkZXJzXHJcbiAgICBsZXQgbmV3RGlyOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIGRpci5mb3JFYWNoKChmb2xkZXI6IHN0cmluZykgPT4ge1xyXG4gICAgICBfZmluZEZpbGVzSW5EaXIoZm9sZGVyLCAvbXAzfHdhdnxmbHZ8cmF3fG9nZ3xlZ2cvLCAoZmlsZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgbmV3RGlyLnB1c2goZmlsZSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgICB0b3RhbENvdW50ID0gbmV3RGlyLmxlbmd0aDtcclxuICAgIGRpciA9IG5ld0RpcjtcclxuICB9IGVsc2Uge1xyXG4gICAgLy8gRmlsZXNcclxuICAgIHRvdGFsQ291bnQgPSBkaXIubGVuZ3RoO1xyXG4gIH1cclxuXHJcbiAgX3VwZGF0ZVRhc2tQcm9ncmVzcyhjdXJyZW50Q291bnQsIHRvdGFsQ291bnQsIHsgbW9kZTogJ2luZGV0ZXJtaW5hdGUnIH0pO1xyXG4gIF9hcHBlbmRNZXNzYWdlVGFza0xvZygnQmVhdCBNYXAgU3ludGhlc2l6ZXIgU3RhcnRlZCEnKTtcclxuXHJcbiAgdG90YWxDb3VudCA9IGRpci5sZW5ndGg7XHJcbiAgX3VwZGF0ZVRhc2tQcm9ncmVzcyhjdXJyZW50Q291bnQsIHRvdGFsQ291bnQpO1xyXG5cclxuICBjb25zdCBnZW5lcmF0ZSA9IGFzeW5jIChmaWxlOiBzdHJpbmcsIGdlbmVyYXRlX2FyZ3M6IF9fYmVhdE1hcEFyZ3MpID0+IHtcclxuICAgIGNvbnN0IHdvcmtlciA9IG5ldyBXb3JrZXIoX2FwcGVuZE1lc3NhZ2VUYXNrTG9nLCBfbG9nLCBfZXJyb3IpO1xyXG4gICAgX19hY3RpdmVXb3JrZXJzLnB1c2god29ya2VyKTtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHdvcmtlci5nZW5lcmF0ZUJlYXRNYXBzKGZpbGUsIGdlbmVyYXRlX2FyZ3MpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBfZXJyb3IoZSk7XHJcbiAgICB9XHJcbiAgICB3b3JrZXIua2lsbFNoZWxsKCk7XHJcbiAgfTtcclxuICBjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gZGlyLm1hcCgoZmlsZTogc3RyaW5nKSA9PlxyXG4gICAgdGltZW91dEZ1bmN0aW9uV2l0aENhbGxiYWNrKFxyXG4gICAgICBmaWxlLFxyXG4gICAgICBnZW5lcmF0ZSxcclxuICAgICAgKCkgPT4ge1xyXG4gICAgICAgIGN1cnJlbnRDb3VudCArPSAxO1xyXG4gICAgICAgIF91cGRhdGVUYXNrUHJvZ3Jlc3MoY3VycmVudENvdW50LCB0b3RhbENvdW50KTtcclxuICAgICAgfSxcclxuICAgICAgYXJnc1xyXG4gICAgKVxyXG4gICk7XHJcblxyXG4gIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcclxuICAgIF9fYWN0aXZlV29ya2Vycy5mb3JFYWNoKHdvcmtlciA9PiB3b3JrZXIua2lsbFNoZWxsKCkpO1xyXG4gICAgX19hY3RpdmVXb3JrZXJzID0gW107XHJcbiAgICBfYXBwZW5kTWVzc2FnZVRhc2tMb2coJ0JlYXQgTWFwIFN5bnRoZXNpemVyIEZpbmlzaGVkIScpO1xyXG4gIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogYF9fZ2VuZXJhdGVCZWF0TWFwX19gIGlzIGEgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIGNoYW5uZWwgZm9yIHN0YXJ0aW5nIHRoZSBiZWF0IG1hcCBnZW5lcmF0aW9uLlxyXG4gKiBAcGFyYW0gX2V2ZW50ICBUaGUgaW50ZXItcHJvY2VzcyBjb21tdW5pY2F0aW9uIHNlbmRlciBvZiBgX19nZW5lcmF0ZUJlYXRNYXBfX2AuXHJcbiAqIEBwYXJhbSBvcFR5cGUgQSBudW1lcmljYWwgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2hldGhlciB0aGUgJ2RpcicgaXMgYW4gYXJyYXkgb2YgZmlsZSBwYXRocyBvciBmb2xkZXIgcGF0aHNcclxuICogQHBhcmFtIGRpciAgVGhlIHBhdGggb2YgdGhlIGRpcmVjdG9yeS9maWxlIHRvIGdlbmVyYXRlIHRoZSBiZWF0IG1hcCBmcm9tLlxyXG4gKiBAcGFyYW0gYXJncyAgQSBtYXAgb2YgYXJndW1lbnRzIHRvIHVzZSBmb3IgZ2VuZXJhdGluZyB0aGUgYmVhdCBtYXBzXHJcbiAqL1xyXG5pcGNNYWluLm9uKCdfX2dlbmVyYXRlQmVhdE1hcF9fJywgKF9ldmVudCwgb3BUeXBlOiBudW1iZXIsIGRpcjogc3RyaW5nW10sIGFyZ3M6IF9fYmVhdE1hcEFyZ3MpID0+IHtcclxuICBfZ2VuZXJhdGVCZWF0TWFwcyhvcFR5cGUsIGRpciwgYXJncyk7XHJcbn0pO1xyXG4iXX0=