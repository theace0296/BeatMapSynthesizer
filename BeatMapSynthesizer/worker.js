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
const electron_promise_ipc_1 = require("electron-promise-ipc");
const path = require("path");
const python_shell_1 = require("python-shell");
const mm = require("music-metadata");
const fsx = require("fs-extra");
const compareVersions = require("compare-versions");
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
        return this;
    }
}
let pythonInternalPath = path.join(electron_1.remote.app.getAppPath().toString(), "build/python");
let scriptsInternalPath = path.join(electron_1.remote.app.getAppPath().toString(), "build/scripts");
let tempDir = path.join(process.env.APPDATA, 'temp', 'beatmapsynthesizer');
let options = {
    mode: 'text',
    pythonPath: path.join(tempDir, "python/python.exe"),
    pythonOptions: ['-u']
};
electron_promise_ipc_1.default.on('worker-copy-files', (event) => __awaiter(void 0, void 0, void 0, function* () {
    yield fsx.copy(scriptsInternalPath, path.join(tempDir, 'scripts'));
    // Quick check to see if Python.exe was modified in the last day, this prevents unnecessarily copying the Python files
    let updateFiles = false;
    if (!fsx.existsSync(path.join(tempDir, 'version.txt'))) {
        updateFiles = true;
    }
    else if (compareVersions.compare(fsx.readFileSync(path.join(tempDir, 'version.txt')).toString(), electron_1.remote.app.getVersion().toString(), '<')) {
        updateFiles = true;
    }
    if (updateFiles) {
        yield fsx.writeFile(path.join(tempDir, 'version.txt'), electron_1.remote.app.getVersion().toString());
        yield fsx.copy(pythonInternalPath, path.join(tempDir, 'python'));
    }
    return true;
}));
electron_promise_ipc_1.default.on('worker-update-python', (event) => __awaiter(void 0, void 0, void 0, function* () {
    yield python_shell_1.PythonShell.runString(`import subprocess;import sys;import os;subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip']);subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '${path.join(tempDir, '/scripts/py_requirements.txt').normalize().replace(/\\/gi, "/")}'])`, options, function () { })
        .on('message', function (message) {
        event.sender.send('__appendMessageTaskLog__', message);
    })
        .on('stderr', function (err) {
        event.sender.send('__log__', err);
    });
    return true;
}));
electron_promise_ipc_1.default.on('worker-generate-beatmaps', (args, event) => __awaiter(void 0, void 0, void 0, function* () {
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
    return true;
}));
//# sourceMappingURL=worker.js.map