// Modules to control application life and create native browser window
import { app, BrowserWindow, ipcMain, dialog, ProgressBarOptions, screen } from 'electron';
import * as path from 'path';
import * as fsx from 'fs-extra';
import __beatMapArgs from './__beatMapArgs';
import { Worker } from './worker';

const timeoutFunctionWithCallback = (
  file: string,
  fn: (file: string, ...args: any) => any,
  cb: () => any,
  ...fn_args: any
): Promise<any> => {
  const functionPromise = new Promise<void>(async resolve => {
    const ret = await fn(file, ...fn_args);
    _log(file);
    cb();
    resolve(ret);
  });
  let timeout: number;
  const timeoutPromise = new Promise<void>((resolve, reject) => {
    timeout = setTimeout(
      (err: Error) => {
        _error(`${file} Error: \n${err}`);
        cb();
        reject(err);
      },
      450000,
      new Error('Operation timed out.')
    );
  });

  return Promise.race([functionPromise, timeoutPromise]).then(
    (value: any) => {
      clearTimeout(timeout);
      return value;
    },
    () => {
      clearTimeout(timeout);
      return null;
    }
  );
};

/**
 * `__mainWindow` is the render process window the user interacts with.
 */
let __mainWindow: Electron.BrowserWindow;

/**
 * `__activeWorkers` is an array of active workers.
 */
let __activeWorkers: Worker[] = [];

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
    if (BrowserWindow.getAllWindows().length === 0) _createMainWindow();
  });
});

/**
 * Quit when all windows are closed.
 * On OS X it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q.
 */
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  __activeWorkers.forEach(worker => worker.killShell());
  if (process.platform !== 'darwin') app.quit();
});

/**
 * `_createMainWindow()` is responsible for the initial creation of the main window.
 */
function _createMainWindow() {
  const dimensions = screen.getPrimaryDisplay().size;
  // Create the browser window.
  __mainWindow = new BrowserWindow({
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
  __mainWindow.loadFile(path.join(app.getAppPath(), 'build/index.html'));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
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
  if (value / maxValue < 1) __mainWindow.setProgressBar(value / maxValue, options);
  else __mainWindow.setProgressBar(-1);
}

/**
 * `_appendMessageTaskLog` is responsible for sending
 * log messages to the task log element the user sees.
 * @param message  The message to be sent to the task log.
 */
function _appendMessageTaskLog(message: string, group?: string) {
  __mainWindow.webContents.send('task-log-append-message', message, group);
}

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
ipcMain.on('__cancelOperation__', _event => {
  __activeWorkers.forEach(worker => worker.killShell());
  _appendMessageTaskLog('Beat Map Generation Canceled!');
});

/**
 * `__ready__` is a inter-process communication channel for altering the main process that the renderer is ready.
 * @param _event  The inter-process communication sender of `__ready__`.
 */
ipcMain.on('__ready__', async _event => {
  new Worker(_appendMessageTaskLog, _log, _error); // Init a worker to run python startup procedures.
  _log('Application Ready!');
});

/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectDirectory__', _event => {
  const options: Electron.OpenDialogOptions = {
    title: 'Select a folder',
    defaultPath: process.env.PORTABLE_EXECUTABLE_DIR ?? app.getAppPath(),
    properties: ['openDirectory', 'multiSelections'],
  };

  dialog
    .showOpenDialog(__mainWindow as BrowserWindow, options)
    .then((dirs: Electron.OpenDialogReturnValue) => {
      if (!dirs.canceled) {
        _event.sender.send('selectFilesDirs-finished', dirs.filePaths);
      }
    })
    .catch((err: string) => {
      _error(err);
    });
});

/**
 * `__selectFiles__` is a inter-process communication channel for opening a native OS file selection dialog.
 * @param _event  The inter-process communication sender of `__selectFiles__`.
 * @returns      The `__selectFiles__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectFiles__', _event => {
  const options: Electron.OpenDialogOptions = {
    title: 'Select an audio file',
    defaultPath: process.env.PORTABLE_EXECUTABLE_DIR ?? app.getAppPath(),
    filters: [
      {
        name: 'Audio files',
        extensions: ['mp3', 'wav', 'flv', 'raw', 'ogg', 'egg'],
      },
    ],
    properties: ['openFile', 'multiSelections'],
  };

  dialog
    .showOpenDialog(__mainWindow as BrowserWindow, options)
    .then((dirs: Electron.OpenDialogReturnValue) => {
      if (!dirs.canceled) {
        _event.sender.send('selectFilesDirs-finished', dirs.filePaths);
      }
    })
    .catch((err: string) => {
      _error(err);
    });
});

/**
 * `__selectDirectory__` is a inter-process communication channel for opening a native OS directory selection dialog.
 * @param _event  The inter-process communication sender of `__selectDirectory__`.
 * @returns      The `__selectDirectory__` channel will send the results of the dialog back to the event sender.
 */
ipcMain.on('__selectOutDirectory__', _event => {
  const options: Electron.OpenDialogOptions = {
    title: 'Select a folder',
    defaultPath: process.env.PORTABLE_EXECUTABLE_DIR ?? app.getAppPath(),
    properties: ['openDirectory'],
  };

  dialog
    .showOpenDialog(__mainWindow as BrowserWindow, options)
    .then((dirs: Electron.OpenDialogReturnValue) => {
      if (!dirs.canceled) {
        _event.sender.send('selectOutDirectory-finished', dirs.filePaths[0]);
      }
    })
    .catch((err: string) => {
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
      _findFilesInDir(folder, /mp3|wav|flv|raw|ogg|egg/, (file: string) => {
        newDir.push(file);
      });
    });
    totalCount = newDir.length;
    dir = newDir;
  } else {
    // Files
    totalCount = dir.length;
  }

  _updateTaskProgress(currentCount, totalCount, { mode: 'indeterminate' });
  _appendMessageTaskLog('Beat Map Synthesizer Started!');

  totalCount = dir.length;
  _updateTaskProgress(currentCount, totalCount);

  const generate = async (file: string, generate_args: __beatMapArgs) => {
    const worker = new Worker(_appendMessageTaskLog, _log, _error);
    __activeWorkers.push(worker);
    try {
      await worker.generateBeatMaps(file, generate_args);
    } catch (e) {
      _error(e);
    }
    worker.killShell();
  };
  const promises: Promise<void>[] = dir.map((file: string) =>
    timeoutFunctionWithCallback(
      file,
      generate,
      () => {
        currentCount += 1;
        _updateTaskProgress(currentCount, totalCount);
      },
      args
    )
  );

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
ipcMain.on('__generateBeatMap__', (_event, opType: number, dir: string[], args: __beatMapArgs) => {
  _generateBeatMaps(opType, dir, args);
});
