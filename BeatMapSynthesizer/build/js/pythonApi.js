"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertMusicFile = exports.getObstaclesList = exports.getEventsList = exports.getNotesList = exports.getBeatFeatures = exports.closePythonServer = exports.isPythonServerRunning = exports.pythonRequest = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const pythonRequest = async (url = '', data) => {
    const options = {
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'GET',
    };
    if (data) {
        options.body = JSON.stringify(data);
        options.method = 'POST';
    }
    const response = await node_fetch_1.default(`http://127.0.0.1:5000/${url}`, options);
    if (response.ok) {
        return options.method === 'GET' || url === 'convert_music_file' ? await response.text() : await response.json();
    }
    return new Error(response.statusText);
};
exports.pythonRequest = pythonRequest;
const isPythonServerRunning = async () => {
    return !!(await exports.pythonRequest('ping'));
};
exports.isPythonServerRunning = isPythonServerRunning;
const closePythonServer = async () => {
    return !!(await exports.pythonRequest('close'));
};
exports.closePythonServer = closePythonServer;
const getBeatFeatures = (song_path) => exports.pythonRequest('get_beat_features', { song_path });
exports.getBeatFeatures = getBeatFeatures;
const getNotesList = (args) => exports.pythonRequest('run_model', args);
exports.getNotesList = getNotesList;
/**
 * Function for writing a list of events.
 * @param args
 * @returns event_list
 */
const getEventsList = (args) => {
    const { eventColorSwapOffset, notes_list, bpm } = args;
    // Set an event to be at time 0
    let events_list = [{ _time: 0, _type: 4, _value: 0 }];
    /**
     * _type
     *  0 : Back Laser
     *  1 : Track Neons
     *  2 : Left Laser
     *  3 : Right Laser
     *  4 : Primary Light
     *  5 :
     *  6 :
     *  7 :
     *  8 : Ring Rotation (uses value of 0, swaps rotation each time)
     *  9 : Small Ring Zoom (uses value of 0, zooms in/out if it is zoomed out/in)
     * 10 :
     * 11 :
     * 12 : Left Laser Speed (value is 0-12, higher value = higher speed)
     * 13 : Right Laser Speed (value is 0-12, higher value = higher speed)
     */
    const eventTypes = {
        Lights: 4,
        Lasers: [0, 1, 2, 3],
        Rings: [8, 9],
        Speeds: [12, 13],
    };
    /**
     * _value
     * 0 : Off
     * 1 : Blue Normal
     * 2 : Blue Fade In
     * 3 : Blue Fade Out
     * 4 :
     * 5 : Red Normal
     * 6 : Red Fade In
     * 7 : Red Fade Out
     */
    const eventValues = {
        Off: 0,
        Normal: [5, 1],
        FadeIn: [6, 2],
        FadeOut: [7, 3],
    };
    let lastEventTime = 0;
    let lastEventColor = 0;
    let lastEventIntensity = 'Off';
    let lastEventRing = 0;
    // Offset is applied to change the lighting every n'th second
    const eventColorSwapInterval = Math.round(bpm / 60) * eventColorSwapOffset;
    if (!notes_list || notes_list.length === 0) {
        throw new Error('Notes list is empty!');
    }
    const firstNote = notes_list[0];
    const lastNote = notes_list[notes_list.length - 1];
    for (const note of notes_list) {
        // Lights
        try {
            if (note === lastNote || note === firstNote) {
                events_list.push({
                    _time: note._time,
                    _type: eventTypes.Lights,
                    _value: eventValues.Off,
                });
            }
            else if (note._time - lastEventTime > eventColorSwapInterval) {
                let color = 0;
                let intensity = 'Normal';
                if (lastEventIntensity === 'Off' || lastEventIntensity === 'FadeOut') {
                    intensity = 'FadeIn';
                    color = lastEventColor === 1 ? 0 : 1;
                }
                else if (lastEventIntensity === 'FadeIn') {
                    intensity = 'Normal';
                    color = lastEventColor;
                }
                else {
                    intensity = 'FadeOut';
                    color = lastEventColor;
                }
                events_list.push({
                    _time: note._time,
                    _type: eventTypes.Lights,
                    _value: eventValues[intensity][color],
                });
                lastEventTime = note._time;
                lastEventColor = color;
                lastEventIntensity = intensity;
            }
        }
        catch (error) {
            console.error(`Lights event writing error: ${JSON.stringify(note, null, 2)}`);
            console.error(error);
        }
        // Rings
        try {
            if (lastEventRing > 2) {
                lastEventRing = 0;
            }
            const ring = lastEventRing > 0 ? 1 : 0;
            events_list.push({
                _time: note._time,
                _type: eventTypes.Rings[ring],
                _value: eventValues.Off,
            });
            lastEventRing++;
        }
        catch (error) {
            console.error(`Rings event writing error: ${JSON.stringify(note, null, 2)}`);
            console.error(error);
        }
        // Lasers
        try {
            if (note._type !== 3) {
                events_list.push({
                    _time: note._time,
                    _type: eventTypes.Lasers[1],
                    _value: eventValues.Normal[note._type],
                });
            }
        }
        catch (error) {
            console.error(`Lasers event writing error: ${JSON.stringify(note, null, 2)}`);
            console.error(error);
        }
    }
    return events_list;
};
exports.getEventsList = getEventsList;
const getObstaclesList = (args) => {
    const { notes_list, bpm } = args;
    let obstacles_list = [];
    return obstacles_list;
};
exports.getObstaclesList = getObstaclesList;
const convertMusicFile = async (song_path, workingDir) => {
    return !!(await exports.pythonRequest('convert_music_file', { song_path, workingDir }));
};
exports.convertMusicFile = convertMusicFile;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHl0aG9uQXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3B5dGhvbkFwaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSw0REFBK0I7QUFJeEIsTUFBTSxhQUFhLEdBQUcsS0FBSyxFQUFFLE1BQWMsRUFBRSxFQUFFLElBQThCLEVBQUUsRUFBRTtJQUN0RixNQUFNLE9BQU8sR0FBMEI7UUFDckMsT0FBTyxFQUFFO1lBQ1AsY0FBYyxFQUFFLGtCQUFrQjtTQUNuQztRQUNELE1BQU0sRUFBRSxLQUFLO0tBQ2QsQ0FBQztJQUNGLElBQUksSUFBSSxFQUFFO1FBQ1IsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0tBQ3pCO0lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxvQkFBSyxDQUFDLHlCQUF5QixHQUFHLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN0RSxJQUFJLFFBQVEsQ0FBQyxFQUFFLEVBQUU7UUFDZixPQUFPLE9BQU8sQ0FBQyxNQUFNLEtBQUssS0FBSyxJQUFJLEdBQUcsS0FBSyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0tBQ2pIO0lBQ0QsT0FBTyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDeEMsQ0FBQyxDQUFDO0FBaEJXLFFBQUEsYUFBYSxpQkFnQnhCO0FBRUssTUFBTSxxQkFBcUIsR0FBRyxLQUFLLElBQUksRUFBRTtJQUM5QyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0scUJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQztBQUZXLFFBQUEscUJBQXFCLHlCQUVoQztBQUVLLE1BQU0s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QUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2pDLElBQUksY0FBYyxHQUFHLEVBQUUsQ0FBQztJQUN4QixPQUFPLGNBQWMsQ0FBQztBQUN4QixDQUFDLENBQUM7QUFKVyxRQUFBLGdCQUFnQixvQkFJM0I7QUFFSyxNQUFNLGdCQUFnQixHQUFHLEtBQUssRUFBRSxTQUFpQixFQUFFLFVBQWtCLEVBQUUsRUFBRTtJQUM5RSxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0scUJBQWEsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDbEYsQ0FBQyxDQUFDO0FBRlcsUUFBQSxnQkFBZ0Isb0JBRTNCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGZldGNoIGZyb20gJ25vZGUtZmV0Y2gnO1xyXG5pbXBvcnQgKiBhcyBub2RlRmV0Y2ggZnJvbSAnbm9kZS1mZXRjaCc7XHJcbmltcG9ydCB7IEV2ZW50cywgTm90ZXMsIE9ic3RhY2xlcywgU29uZ0FyZ3MsIFRyYWNrcyB9IGZyb20gJy4vd29ya2VyJztcclxuXHJcbmV4cG9ydCBjb25zdCBweXRob25SZXF1ZXN0ID0gYXN5bmMgKHVybDogc3RyaW5nID0gJycsIGRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xyXG4gIGNvbnN0IG9wdGlvbnM6IG5vZGVGZXRjaC5SZXF1ZXN0SW5pdCA9IHtcclxuICAgIGhlYWRlcnM6IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgIH0sXHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gIH07XHJcbiAgaWYgKGRhdGEpIHtcclxuICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KGRhdGEpO1xyXG4gICAgb3B0aW9ucy5tZXRob2QgPSAnUE9TVCc7XHJcbiAgfVxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYGh0dHA6Ly8xMjcuMC4wLjE6NTAwMC8ke3VybH1gLCBvcHRpb25zKTtcclxuICBpZiAocmVzcG9uc2Uub2spIHtcclxuICAgIHJldHVybiBvcHRpb25zLm1ldGhvZCA9PT0gJ0dFVCcgfHwgdXJsID09PSAnY29udmVydF9tdXNpY19maWxlJyA/IGF3YWl0IHJlc3BvbnNlLnRleHQoKSA6IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICB9XHJcbiAgcmV0dXJuIG5ldyBFcnJvcihyZXNwb25zZS5zdGF0dXNUZXh0KTtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBpc1B5dGhvblNlcnZlclJ1bm5pbmcgPSBhc3luYyAoKSA9PiB7XHJcbiAgcmV0dXJuICEhKGF3YWl0IHB5dGhvblJlcXVlc3QoJ3BpbmcnKSk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgY2xvc2VQeXRob25TZXJ2ZXIgPSBhc3luYyAoKSA9PiB7XHJcbiAgcmV0dXJuICEhKGF3YWl0IHB5dGhvblJlcXVlc3QoJ2Nsb3NlJykpO1xyXG59O1xyXG5cclxuaW50ZXJmYWNlIFB5dGhvblJlc3BvbnNlRGF0YTxUPiB7XHJcbiAgZGF0YTogVDtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBCZWF0RmVhdHVyZXMge1xyXG4gIGJwbTogbnVtYmVyO1xyXG4gIGJlYXRfdGltZXM6IG51bWJlcltdO1xyXG4gIHk6IG51bWJlcltdO1xyXG4gIHNyOiBudW1iZXI7XHJcbn1cclxuZXhwb3J0IGNvbnN0IGdldEJlYXRGZWF0dXJlcyA9IChzb25nX3BhdGg6IHN0cmluZyk6IFByb21pc2U8UHl0aG9uUmVzcG9uc2VEYXRhPEJlYXRGZWF0dXJlcz4+ID0+XHJcbiAgcHl0aG9uUmVxdWVzdCgnZ2V0X2JlYXRfZmVhdHVyZXMnLCB7IHNvbmdfcGF0aCB9KTtcclxuZXhwb3J0IGNvbnN0IGdldE5vdGVzTGlzdCA9IChhcmdzOiB7XHJcbiAgbW9kZWw6IHN0cmluZztcclxuICBkaWZmaWN1bHR5OiBzdHJpbmc7XHJcbiAgYmVhdF90aW1lczogbnVtYmVyW107XHJcbiAgYnBtOiBudW1iZXI7XHJcbiAgdmVyc2lvbjogbnVtYmVyO1xyXG4gIHk6IG51bWJlcltdO1xyXG4gIHNyOiBudW1iZXI7XHJcbiAgdGVtcERpcjogc3RyaW5nO1xyXG59KTogUHJvbWlzZTxQeXRob25SZXNwb25zZURhdGE8Tm90ZXNbXT4+ID0+IHB5dGhvblJlcXVlc3QoJ3J1bl9tb2RlbCcsIGFyZ3MpO1xyXG5cclxuLyoqXHJcbiAqIEZ1bmN0aW9uIGZvciB3cml0aW5nIGEgbGlzdCBvZiBldmVudHMuXHJcbiAqIEBwYXJhbSBhcmdzXHJcbiAqIEByZXR1cm5zIGV2ZW50X2xpc3RcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRFdmVudHNMaXN0ID0gKGFyZ3M6IHsgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IG51bWJlcjsgbm90ZXNfbGlzdDogTm90ZXNbXTsgYnBtOiBudW1iZXIgfSk6IEV2ZW50c1tdID0+IHtcclxuICBjb25zdCB7IGV2ZW50Q29sb3JTd2FwT2Zmc2V0LCBub3Rlc19saXN0LCBicG0gfSA9IGFyZ3M7XHJcbiAgLy8gU2V0IGFuIGV2ZW50IHRvIGJlIGF0IHRpbWUgMFxyXG4gIGxldCBldmVudHNfbGlzdDogRXZlbnRzW10gPSBbeyBfdGltZTogMCwgX3R5cGU6IDQsIF92YWx1ZTogMCB9XTtcclxuXHJcbiAgLyoqXHJcbiAgICogX3R5cGVcclxuICAgKiAgMCA6IEJhY2sgTGFzZXJcclxuICAgKiAgMSA6IFRyYWNrIE5lb25zXHJcbiAgICogIDIgOiBMZWZ0IExhc2VyXHJcbiAgICogIDMgOiBSaWdodCBMYXNlclxyXG4gICAqICA0IDogUHJpbWFyeSBMaWdodFxyXG4gICAqICA1IDpcclxuICAgKiAgNiA6XHJcbiAgICogIDcgOlxyXG4gICAqICA4IDogUmluZyBSb3RhdGlvbiAodXNlcyB2YWx1ZSBvZiAwLCBzd2FwcyByb3RhdGlvbiBlYWNoIHRpbWUpXHJcbiAgICogIDkgOiBTbWFsbCBSaW5nIFpvb20gKHVzZXMgdmFsdWUgb2YgMCwgem9vbXMgaW4vb3V0IGlmIGl0IGlzIHpvb21lZCBvdXQvaW4pXHJcbiAgICogMTAgOlxyXG4gICAqIDExIDpcclxuICAgKiAxMiA6IExlZnQgTGFzZXIgU3BlZWQgKHZhbHVlIGlzIDAtMTIsIGhpZ2hlciB2YWx1ZSA9IGhpZ2hlciBzcGVlZClcclxuICAgKiAxMyA6IFJpZ2h0IExhc2VyIFNwZWVkICh2YWx1ZSBpcyAwLTEyLCBoaWdoZXIgdmFsdWUgPSBoaWdoZXIgc3BlZWQpXHJcbiAgICovXHJcbiAgY29uc3QgZXZlbnRUeXBlcyA9IHtcclxuICAgIExpZ2h0czogNCxcclxuICAgIExhc2VyczogWzAsIDEsIDIsIDNdLFxyXG4gICAgUmluZ3M6IFs4LCA5XSxcclxuICAgIFNwZWVkczogWzEyLCAxM10sXHJcbiAgfTtcclxuXHJcbiAgLyoqXHJcbiAgICogX3ZhbHVlXHJcbiAgICogMCA6IE9mZlxyXG4gICAqIDEgOiBCbHVlIE5vcm1hbFxyXG4gICAqIDIgOiBCbHVlIEZhZGUgSW5cclxuICAgKiAzIDogQmx1ZSBGYWRlIE91dFxyXG4gICAqIDQgOlxyXG4gICAqIDUgOiBSZWQgTm9ybWFsXHJcbiAgICogNiA6IFJlZCBGYWRlIEluXHJcbiAgICogNyA6IFJlZCBGYWRlIE91dFxyXG4gICAqL1xyXG4gIGNvbnN0IGV2ZW50VmFsdWVzID0ge1xyXG4gICAgT2ZmOiAwLFxyXG4gICAgTm9ybWFsOiBbNSwgMV0sXHJcbiAgICBGYWRlSW46IFs2LCAyXSxcclxuICAgIEZhZGVPdXQ6IFs3LCAzXSxcclxuICB9O1xyXG5cclxuICBsZXQgbGFzdEV2ZW50VGltZSA9IDA7XHJcbiAgbGV0IGxhc3RFdmVudENvbG9yID0gMDtcclxuICBsZXQgbGFzdEV2ZW50SW50ZW5zaXR5ID0gJ09mZic7XHJcbiAgbGV0IGxhc3RFdmVudFJpbmcgPSAwO1xyXG4gIC8vIE9mZnNldCBpcyBhcHBsaWVkIHRvIGNoYW5nZSB0aGUgbGlnaHRpbmcgZXZlcnkgbid0aCBzZWNvbmRcclxuICBjb25zdCBldmVudENvbG9yU3dhcEludGVydmFsID0gTWF0aC5yb3VuZChicG0gLyA2MCkgKiBldmVudENvbG9yU3dhcE9mZnNldDtcclxuXHJcbiAgaWYgKCFub3Rlc19saXN0IHx8IG5vdGVzX2xpc3QubGVuZ3RoID09PSAwKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vdGVzIGxpc3QgaXMgZW1wdHkhJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBmaXJzdE5vdGUgPSBub3Rlc19saXN0WzBdO1xyXG4gIGNvbnN0IGxhc3ROb3RlID0gbm90ZXNfbGlzdFtub3Rlc19saXN0Lmxlbmd0aCAtIDFdO1xyXG5cclxuICBmb3IgKGNvbnN0IG5vdGUgb2Ygbm90ZXNfbGlzdCkge1xyXG4gICAgLy8gTGlnaHRzXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAobm90ZSA9PT0gbGFzdE5vdGUgfHwgbm90ZSA9PT0gZmlyc3ROb3RlKSB7XHJcbiAgICAgICAgZXZlbnRzX2xpc3QucHVzaCh7XHJcbiAgICAgICAgICBfdGltZTogbm90ZS5fdGltZSxcclxuICAgICAgICAgIF90eXBlOiBldmVudFR5cGVzLkxpZ2h0cyxcclxuICAgICAgICAgIF92YWx1ZTogZXZlbnRWYWx1ZXMuT2ZmLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2UgaWYgKG5vdGUuX3RpbWUgLSBsYXN0RXZlbnRUaW1lID4gZXZlbnRDb2xvclN3YXBJbnRlcnZhbCkge1xyXG4gICAgICAgIGxldCBjb2xvciA9IDA7XHJcbiAgICAgICAgbGV0IGludGVuc2l0eSA9ICdOb3JtYWwnO1xyXG4gICAgICAgIGlmIChsYXN0RXZlbnRJbnRlbnNpdHkgPT09ICdPZmYnIHx8IGxhc3RFdmVudEludGVuc2l0eSA9PT0gJ0ZhZGVPdXQnKSB7XHJcbiAgICAgICAgICBpbnRlbnNpdHkgPSAnRmFkZUluJztcclxuICAgICAgICAgIGNvbG9yID0gbGFzdEV2ZW50Q29sb3IgPT09IDEgPyAwIDogMTtcclxuICAgICAgICB9IGVsc2UgaWYgKGxhc3RFdmVudEludGVuc2l0eSA9PT0gJ0ZhZGVJbicpIHtcclxuICAgICAgICAgIGludGVuc2l0eSA9ICdOb3JtYWwnO1xyXG4gICAgICAgICAgY29sb3IgPSBsYXN0RXZlbnRDb2xvcjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaW50ZW5zaXR5ID0gJ0ZhZGVPdXQnO1xyXG4gICAgICAgICAgY29sb3IgPSBsYXN0RXZlbnRDb2xvcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZXZlbnRzX2xpc3QucHVzaCh7XHJcbiAgICAgICAgICBfdGltZTogbm90ZS5fdGltZSxcclxuICAgICAgICAgIF90eXBlOiBldmVudFR5cGVzLkxpZ2h0cyxcclxuICAgICAgICAgIF92YWx1ZTogZXZlbnRWYWx1ZXNbaW50ZW5zaXR5XVtjb2xvcl0sXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgbGFzdEV2ZW50VGltZSA9IG5vdGUuX3RpbWU7XHJcbiAgICAgICAgbGFzdEV2ZW50Q29sb3IgPSBjb2xvcjtcclxuICAgICAgICBsYXN0RXZlbnRJbnRlbnNpdHkgPSBpbnRlbnNpdHk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYExpZ2h0cyBldmVudCB3cml0aW5nIGVycm9yOiAke0pTT04uc3RyaW5naWZ5KG5vdGUsIG51bGwsIDIpfWApO1xyXG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSaW5nc1xyXG4gICAgdHJ5IHtcclxuICAgICAgaWYgKGxhc3RFdmVudFJpbmcgPiAyKSB7XHJcbiAgICAgICAgbGFzdEV2ZW50UmluZyA9IDA7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgcmluZyA9IGxhc3RFdmVudFJpbmcgPiAwID8gMSA6IDA7XHJcbiAgICAgIGV2ZW50c19saXN0LnB1c2goe1xyXG4gICAgICAgIF90aW1lOiBub3RlLl90aW1lLFxyXG4gICAgICAgIF90eXBlOiBldmVudFR5cGVzLlJpbmdzW3JpbmddLFxyXG4gICAgICAgIF92YWx1ZTogZXZlbnRWYWx1ZXMuT2ZmLFxyXG4gICAgICB9KTtcclxuICAgICAgbGFzdEV2ZW50UmluZysrO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihgUmluZ3MgZXZlbnQgd3JpdGluZyBlcnJvcjogJHtKU09OLnN0cmluZ2lmeShub3RlLCBudWxsLCAyKX1gKTtcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTGFzZXJzXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAobm90ZS5fdHlwZSAhPT0gMykge1xyXG4gICAgICAgIGV2ZW50c19saXN0LnB1c2goe1xyXG4gICAgICAgICAgX3RpbWU6IG5vdGUuX3RpbWUsXHJcbiAgICAgICAgICBfdHlwZTogZXZlbnRUeXBlcy5MYXNlcnNbMV0sXHJcbiAgICAgICAgICBfdmFsdWU6IGV2ZW50VmFsdWVzLk5vcm1hbFtub3RlLl90eXBlXSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihgTGFzZXJzIGV2ZW50IHdyaXRpbmcgZXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkobm90ZSwgbnVsbCwgMil9YCk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gZXZlbnRzX2xpc3Q7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgZ2V0T2JzdGFjbGVzTGlzdCA9IChhcmdzOiB7IG5vdGVzX2xpc3Q6IE5vdGVzW107IGJwbTogbnVtYmVyIH0pOiBPYnN0YWNsZXNbXSA9PiB7XHJcbiAgY29uc3QgeyBub3Rlc19saXN0LCBicG0gfSA9IGFyZ3M7XHJcbiAgbGV0IG9ic3RhY2xlc19saXN0ID0gW107XHJcbiAgcmV0dXJuIG9ic3RhY2xlc19saXN0O1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGNvbnZlcnRNdXNpY0ZpbGUgPSBhc3luYyAoc29uZ19wYXRoOiBzdHJpbmcsIHdvcmtpbmdEaXI6IHN0cmluZykgPT4ge1xyXG4gIHJldHVybiAhIShhd2FpdCBweXRob25SZXF1ZXN0KCdjb252ZXJ0X211c2ljX2ZpbGUnLCB7IHNvbmdfcGF0aCwgd29ya2luZ0RpciB9KSk7XHJcbn07XHJcbiJdfQ==