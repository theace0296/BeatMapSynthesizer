"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const electron_1 = require("electron");
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
let args = new beatMapArgs();
let selectedDirs = [];
args.difficulty = 'all';
args.model = 'random';
args.outDir = process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH;
let operationType = /** @class */ (() => {
    class operationType {
    }
    operationType.directory = 0;
    operationType.files = 1;
    return operationType;
})();
var currentOperationType = operationType.files;
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('selectFilesButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        currentOperationType = operationType.files;
        electron_1.ipcRenderer.send('__selectFiles__');
    });
    document.getElementById('selectDirectoryButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        currentOperationType = operationType.directory;
        electron_1.ipcRenderer.send('__selectDirectory__');
    });
    document.getElementById('chooseOutputDirButton').addEventListener('click', () => {
        if (document.getElementById('outputDirList').innerHTML !== "") {
            document.getElementById('outputDirList').innerHTML = "";
        }
        electron_1.ipcRenderer.send('__selectOutDirectory__');
    });
    document.getElementById('difficultylist').addEventListener('change', () => {
        args.difficulty = document.getElementById('difficultylist').value.toString();
    });
    document.getElementById('modellist').addEventListener('change', () => {
        args.model = document.getElementById('modellist').value.toString();
    });
    document.getElementById('generateBeatMapButton').addEventListener('click', () => {
        if (document.getElementById('taskLog').innerHTML !== "") {
            document.getElementById('taskLog').innerHTML = "";
        }
        args.zipFiles = document.getElementById('zipFilesLabel').classList.contains('checked') ? 1 : 0;
        electron_1.ipcRenderer.send('__generateBeatMap__', currentOperationType, selectedDirs, args);
    });
    document.getElementById('cancelButton').addEventListener('click', () => {
        electron_1.ipcRenderer.send('__cancelOperation__');
    });
    document.getElementById('outputDirList').appendChild(document.createElement('li').appendChild(document.createTextNode(args.outDir)));
});
electron_1.ipcRenderer.on('console-log', (event, message) => console.log(message));
electron_1.ipcRenderer.on('console-error', (event, message) => console.error(message));
electron_1.ipcRenderer.on('task-progress', (event, value, maxValue) => {
    if (value === 0) {
        document.getElementById('taskProgressBar').innerHTML = `0%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 0%;`);
    }
    else if (value === -1) {
        document.getElementById('taskProgressBar').innerHTML = `100%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 100%;`);
    }
    else if ((value / maxValue) <= .10) {
        document.getElementById('taskProgressBar').innerHTML = `${((value / maxValue) * 100).toFixed(0)}%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 10%;`);
    }
    else {
        document.getElementById('taskProgressBar').innerHTML = `${((value / maxValue) * 100).toFixed(0)}%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: ${(value / maxValue) * 100}%;`);
    }
});
electron_1.ipcRenderer.on('task-log-append-message', (event, message) => document.getElementById('taskLog').appendChild(document.createTextNode(message + '\n')));
electron_1.ipcRenderer.on('selectFilesDirs-finished', (event, param) => {
    selectedDirs.length = 0;
    for (let value of param) {
        // Append filename to varaible
        selectedDirs.push(value);
        // Create the list item and set its contents
        let item = document.createElement('li').appendChild(document.createTextNode(value));
        // Add it to the list:
        document.getElementById('dirsfilesList').appendChild(item);
    }
});
electron_1.ipcRenderer.on('selectOutDirectory-finished', (event, param) => {
    // Append filename to varaible
    args.outDir = param;
    // Create the list item and set its contents
    let item = document.createElement('li').appendChild(document.createTextNode(param));
    // Add it to the list:
    document.getElementById('outputDirList').appendChild(item);
});
//# sourceMappingURL=preload.js.map