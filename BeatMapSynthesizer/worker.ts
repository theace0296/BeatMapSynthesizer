// This file is required by the worker.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
import { ipcRenderer, remote } from "electron";
import promiseIpc from 'electron-promise-ipc';
import * as path from "path";
import { PythonShell, Options, PythonShellError } from 'python-shell';
import * as mm from 'music-metadata';
import * as fsx from 'fs-extra';
import * as compareVersions from 'compare-versions';
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
        return this;
    }
}

let pythonInternalPath = path.join(remote.app.getAppPath().toString(), "build/python");
let scriptsInternalPath = path.join(remote.app.getAppPath().toString(), "build/scripts");
let tempDir = path.join(process.env.APPDATA, 'temp', 'beatmapsynthesizer');
let options: Options = {
    mode: 'text',
    pythonPath: path.join(tempDir, "python/python.exe"),
    pythonOptions: ['-u']
};

promiseIpc.on('worker-copy-files', async (event) => {
    await fsx.copy(scriptsInternalPath, path.join(tempDir, 'scripts'));
    // Quick check to see if Python.exe was modified in the last day, this prevents unnecessarily copying the Python files
    let updateFiles = false;
    if (!fsx.existsSync(path.join(tempDir, 'version.txt'))) {
        updateFiles = true;
    }
    else if (compareVersions.compare(fsx.readFileSync(path.join(tempDir, 'version.txt')).toString(), remote.app.getVersion().toString(), '<')) {
        updateFiles = true;
    }

    if (updateFiles) {
        await fsx.writeFile(path.join(tempDir, 'version.txt'), remote.app.getVersion().toString());
        await fsx.copy(pythonInternalPath, path.join(tempDir, 'python'));
    }

    return true;
});

promiseIpc.on('worker-update-python', async (event) => {
    await PythonShell.runString(`import subprocess;import sys;import os;subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip']);subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '${path.join(tempDir, '/scripts/py_requirements.txt').normalize().replace(/\\/gi, "/")}'])`, options, function () { /* Callback not used */ })
        .on('message', function (message: string) {
            event.sender.send('__appendMessageTaskLog__', message);
        })
        .on('stderr', function (err: PythonShellError) {
            event.sender.send('__log__', err);
        });

    return true;
});

promiseIpc.on('worker-generate-beatmaps', async (args: beatMapArgs, event) => {
    let metadata = await mm.parseFile(args.dir);
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

    await PythonShell.run(path.join(tempDir, '/scripts/beatmapsynth.py'), options, function (err, out) { /* Callback not used */ })
        .on('message', function (message: string) {
            event.sender.send('__appendMessageTaskLog__', message);
        })
        .on('stderr', function (err: PythonShellError) {
            event.sender.send('__log__', err);
        });

    return true;
});