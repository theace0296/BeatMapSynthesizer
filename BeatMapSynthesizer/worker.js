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
// This file is required by the worker.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const electron_1 = require("electron");
const promise_tron_1 = require("promise-tron");
const path = require("path");
const python_shell_1 = require("python-shell");
const mm = require("music-metadata");
const fsx = require("fs-extra");
const compareVersions = require("compare-versions");
const promiseTronRenderer = new promise_tron_1.PromiseTron(electron_1.ipcRenderer);
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
let appPath;
let appVersion;
let pythonInternalPath;
let scriptsInternalPath;
let tempDir;
let options;
electron_1.ipcRenderer.once('worker-init', (event, app_path, app_ver) => {
    appPath = app_path;
    appVersion = app_ver;
    pythonInternalPath = path.join(appPath, "build/python");
    scriptsInternalPath = path.join(appPath, "build/scripts");
    tempDir = path.join(process.env.APPDATA, 'temp', 'beatmapsynthesizer');
    options = {
        mode: 'text',
        pythonPath: path.join(tempDir, "python/python.exe"),
        pythonOptions: ['-u']
    };
});
promiseTronRenderer.on((request, replyWith) => __awaiter(void 0, void 0, void 0, function* () {
    if (request.data === 'worker-copy-files') {
        console.log('worker copy files - start');
        yield fsx.copy(scriptsInternalPath, path.join(tempDir, 'scripts'));
        console.log('worker copy files - copy scripts folder complete');
        // Quick check to see if Python.exe was modified in the last day, this prevents unnecessarily copying the Python files
        let updateFiles = false;
        if (!fsx.existsSync(path.join(tempDir, 'version.txt'))) {
            updateFiles = true;
            console.log('worker copy files - version.txt does not exist');
        }
        else if (compareVersions.compare(fsx.readFileSync(path.join(tempDir, 'version.txt')).toString(), appVersion, '<')) {
            updateFiles = true;
            console.log('worker copy files - app version greater than file version');
        }
        if (updateFiles) {
            console.log('worker copy files - updating files');
            yield fsx.writeFile(path.join(tempDir, 'version.txt'), appVersion);
            console.log('worker copy files - version.txt written');
            yield fsx.copy(pythonInternalPath, path.join(tempDir, 'python'));
            console.log('worker copy files - copy python files complete');
        }
    }
    replyWith({
        success: 'success',
        error: 'failure'
    });
}));
electron_1.ipcRenderer.on('worker-update-python', (event) => __awaiter(void 0, void 0, void 0, function* () {
    yield python_shell_1.PythonShell.runString(`import subprocess;import sys;import os;subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip']);subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '${path.join(tempDir, '/scripts/py_requirements.txt').normalize().replace(/\\/gi, "/")}'])`, options, function () { })
        .on('message', function (message) {
        event.sender.send('__appendMessageTaskLog__', message);
    })
        .on('stderr', function (err) {
        event.sender.send('__log__', err);
    });
    event.sender.send('update-python-reply', 1);
}));
electron_1.ipcRenderer.on('worker-generate-beatmaps', (event, args) => __awaiter(void 0, void 0, void 0, function* () {
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
    options.args = [
        `${args.dir.normalize().replace(/\\/gi, "/")}`,
        `${trackname} - ${artistname}`,
        `${args.difficulty}`,
        `${args.model}`,
        '-k', args.k.toString(),
        '--version', args.version.toString(),
        '--workingDir', tempDir.normalize().replace(/\\/gi, "/"),
        '--outDir', args.outDir.normalize().replace(/\\/gi, "/"),
        '--zipFiles', args.zipFiles.toString()
    ];
    yield python_shell_1.PythonShell.run(path.join(tempDir, '/scripts/beatmapsynth.py'), options, function (err, out) { })
        .on('message', function (message) {
        event.sender.send('__appendMessageTaskLog__', message);
    })
        .on('stderr', function (err) {
        event.sender.send('__log__', err);
    });
    event.sender.send('generate-beatmaps-reply', 1);
}));
//# sourceMappingURL=worker.js.map