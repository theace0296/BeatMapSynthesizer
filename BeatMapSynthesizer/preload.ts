// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
import { ipcRenderer, remote } from "electron";
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

let args: beatMapArgs = new beatMapArgs();

let selectedDirs: string[] = [];
args.difficulty = 'all';
args.model = 'random';
args.outDir = process.env.PORTABLE_EXECUTABLE_DIR !== null ? process.env.PORTABLE_EXECUTABLE_DIR : process.env.PATH;

class operationType {
    static directory: number = 0;
    static files: number = 1;
}

var currentOperationType: number = operationType.files;

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('selectFilesButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        currentOperationType = operationType.files;
        ipcRenderer.send('__selectFiles__');
    });

    document.getElementById('selectDirectoryButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        currentOperationType = operationType.directory;
        ipcRenderer.send('__selectDirectory__');
    });

    document.getElementById('chooseOutputDirButton').addEventListener('click', () => {
        if (document.getElementById('outputDirList').innerHTML !== "") {
            document.getElementById('outputDirList').innerHTML = "";
        }
        ipcRenderer.send('__selectOutDirectory__');
    });

    document.getElementById('difficultylist').addEventListener('change', () => {
        args.difficulty = (document.getElementById('difficultylist') as HTMLSelectElement).value.toString();
    });

    document.getElementById('modellist').addEventListener('change', () => {
        args.model = (document.getElementById('modellist') as HTMLSelectElement).value.toString();
    });

    document.getElementById('generateBeatMapButton').addEventListener('click', () => {
        if (document.getElementById('taskLog').innerHTML !== "") {
            document.getElementById('taskLog').innerHTML = "";
        }
        args.zipFiles = document.getElementById('zipFilesLabel').classList.contains('checked') ? 1 : 0;
        ipcRenderer.send('__generateBeatMap__', currentOperationType, selectedDirs, args);
    });

    document.getElementById('cancelButton').addEventListener('click', () => {
        ipcRenderer.send('__cancelOperation__');
    });

    document.getElementById('outputDirList').appendChild(document.createElement('li').appendChild(document.createTextNode(args.outDir)));
})

ipcRenderer.on('console-log', (event, message: string) => console.log(message));

ipcRenderer.on('console-error', (event, message: string) => console.error(message));


ipcRenderer.on('task-progress', (event, value: number, maxValue: number) => {
    if (value === 0) {
        document.getElementById('taskProgressBar').innerHTML = `$0%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 0%;`);
    }
    else if (value === -1) {
        document.getElementById('taskProgressBar').innerHTML = `$100%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 100%;`);
    }
    else if ((value / maxValue) <= .10) {
        document.getElementById('taskProgressBar').innerHTML = `${(value / maxValue) * 100}%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 10%;`);
    }
    else {
        document.getElementById('taskProgressBar').innerHTML = `${(value / maxValue) * 100}%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: ${(value / maxValue) * 100}%;`);
    }
});

ipcRenderer.on('task-log-append-message', (event, message: string) => document.getElementById('taskLog').appendChild(document.createTextNode(message + '\n')));

ipcRenderer.on('selectFilesDirs-finished', (event, param: string[]) => {
    selectedDirs.length = 0;
    param.forEach((value: string) => {
        // Append filename to varaible
        selectedDirs.push(value);
        // Create the list item and set its contents
        let item = document.createElement('li').appendChild(document.createTextNode(value));
        // Add it to the list:
        document.getElementById('dirsfilesList').appendChild(item);
    });
});

ipcRenderer.on('selectOutDirectory-finished', (event, param: string) => {
    // Append filename to varaible
    args.outDir = param;
    // Create the list item and set its contents
    let item = document.createElement('li').appendChild(document.createTextNode(param));
    // Add it to the list:
    document.getElementById('outputDirList').appendChild(item);
});
