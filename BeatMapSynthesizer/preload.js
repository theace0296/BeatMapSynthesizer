"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const electron_1 = require("electron");
let selectedDirs = [];
let selectedDiff = 'hard';
let selectedModel = 'rate_modulated_segmented_HMM';
let selectedOutDir = process.env.PORTABLE_EXECUTABLE_DIR;
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('selectFilesButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        electron_1.ipcRenderer.send('__selectFiles__');
    });
    document.getElementById('selectDirectoryButton').addEventListener('click', () => {
        if (document.getElementById('dirsfilesList').innerHTML !== "") {
            document.getElementById('dirsfilesList').innerHTML = "";
        }
        electron_1.ipcRenderer.send('__selectDirectory__');
    });
    document.getElementById('chooseOutputDirButton').addEventListener('click', () => {
        if (document.getElementById('outputDirList').innerHTML !== "") {
            document.getElementById('outputDirList').innerHTML = "";
        }
        electron_1.ipcRenderer.send('__selectOutDirectory__');
    });
    document.getElementById('difficultylist').addEventListener('change', () => {
        selectedDiff = document.getElementById('difficultylist').value.toString();
    });
    document.getElementById('modellist').addEventListener('change', () => {
        selectedModel = document.getElementById('modellist').value.toString();
    });
    document.getElementById('generateBeatMapButton').addEventListener('click', () => {
        if (document.getElementById('taskLog').innerHTML !== "") {
            document.getElementById('taskLog').innerHTML = "";
        }
        for (var selectedDir of selectedDirs) {
            electron_1.ipcRenderer.send('__generateBeatMap__', selectedDir, selectedDiff, selectedModel, 5, 2, selectedOutDir);
        }
    });
    document.getElementById('cancelButton').addEventListener('click', () => {
        electron_1.ipcRenderer.send('__cancelOperation__');
    });
    document.getElementById('outputDirList').appendChild(document.createElement('li').appendChild(document.createTextNode(selectedOutDir)));
});
electron_1.ipcRenderer.on('console-log', (event, message) => {
    console.log(message);
});
electron_1.ipcRenderer.on('console-error', (event, message) => {
    console.error(message);
});
electron_1.ipcRenderer.on('task-progress', (event, value, maxValue) => {
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
electron_1.ipcRenderer.on('task-log-append-message', (event, message) => {
    document.getElementById('taskLog').appendChild(document.createTextNode(message + '\n'));
});
electron_1.ipcRenderer.on('selectFilesDirs-finished', (event, param) => {
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
electron_1.ipcRenderer.on('selectOutDirectory-finished', (event, param) => {
    // Append filename to varaible
    selectedOutDir = param[0];
    // Create the list item:
    var item = document.createElement('li');
    // Set its contents:
    item.appendChild(document.createTextNode(param[0]));
    // Add it to the list:
    document.getElementById('outputDirList').appendChild(item);
});
//# sourceMappingURL=preload.js.map