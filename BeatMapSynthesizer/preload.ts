// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
import { ipcRenderer } from "electron";

let selectedDirs: string[] = [];
let selectedDiff: string = 'hard';
let selectedModel: string = 'rate_modulated_segmented_HMM';
let selectedOutDir: string = process.env.PORTABLE_EXECUTABLE_DIR;

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('selectFilesButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        ipcRenderer.send('__selectFiles__');
    });

    document.getElementById('selectDirectoryButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        ipcRenderer.send('__selectDirectory__');
    });

    document.getElementById('chooseOutputDirButton').addEventListener('click', () => {
        if (document.getElementById('outputDirList').innerHTML !== "") {
            document.getElementById('outputDirList').innerHTML = "";
        }
        ipcRenderer.send('__selectOutDirectory__');
    });

    document.getElementById('difficultylist').addEventListener('change', () => {
        selectedDiff = (document.getElementById('difficultylist') as HTMLSelectElement).value.toString();
    });

    document.getElementById('modellist').addEventListener('change', () => {
        selectedModel = (document.getElementById('modellist') as HTMLSelectElement).value.toString();
    });

    document.getElementById('generateBeatMapButton').addEventListener('click', () => {
        if (document.getElementById('taskLog').innerHTML !== "") {
            document.getElementById('taskLog').innerHTML = "";
        }
        for (var selectedDir of selectedDirs) {
            ipcRenderer.send('__generateBeatMap__', selectedDir, selectedDiff, selectedModel, 5, 2, selectedOutDir);
        }
    });

    document.getElementById('cancelButton').addEventListener('click', () => {
        ipcRenderer.send('__cancelOperation__');
    });

    document.getElementById('outputDirList').appendChild(document.createElement('li').appendChild(document.createTextNode(selectedOutDir)));
})

ipcRenderer.on('console-log', (event, message: string) => {
    console.log(message);
});

ipcRenderer.on('console-error', (event, message: string) => {
    console.error(message);
});


ipcRenderer.on('task-progress', (event, value: number, maxValue: number) => {
    if (value === 0) {
        document.getElementById('taskProgressBar').innerHTML = `${(value / maxValue) * 100}%`;
        document.getElementById('taskProgressBar').setAttribute('style', `width: 0%;`);
    }
    else if (value === -1) {
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

ipcRenderer.on('task-log-append-message', (event, message: string) => {
    document.getElementById('taskLog').appendChild(document.createTextNode(message + '\n'));
});

ipcRenderer.on('selectFilesDirs-finished', (event, param: string[]) => {
    selectedDirs.length = 0;
    for (var i = 0; i < param.length; i++) {
        // Append filename to varaible
        selectedDirs.push(param[i]);
        // Create the list item:
        var item = document.createElement('li');
        // Set its contents:
        item.appendChild(document.createTextNode(param[i]));
        // Add it to the list:
        document.getElementById('dirsfilesList').appendChild(item);
    }
});

ipcRenderer.on('selectOutDirectory-finished', (event, param: string[]) => {
    // Append filename to varaible
    selectedOutDir = param[0];
    // Create the list item:
    var item = document.createElement('li');
    // Set its contents:
    item.appendChild(document.createTextNode(param[0]));
    // Add it to the list:
    document.getElementById('outputDirList').appendChild(item);
});
