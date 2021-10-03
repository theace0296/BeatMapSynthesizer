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
    try {
        return !!(await exports.pythonRequest('ping'));
    }
    catch (error) {
        return false;
    }
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
const getEventsList = (args, error) => {
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
        catch (err) {
            error(`Lights event writing error: ${JSON.stringify(note, null, 2)}`);
            error(err);
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
        catch (err) {
            error(`Rings event writing error: ${JSON.stringify(note, null, 2)}`);
            error(err);
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
        catch (err) {
            error(`Lasers event writing error: ${JSON.stringify(note, null, 2)}`);
            error(err);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHl0aG9uQXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3B5dGhvbkFwaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSw0REFBK0I7QUFJeEIsTUFBTSxhQUFhLEdBQUcsS0FBSyxFQUFFLE1BQWMsRUFBRSxFQUFFLElBQThCLEVBQUUsRUFBRTtJQUN0RixNQUFNLE9BQU8sR0FBMEI7UUFDckMsT0FBTyxFQUFFO1lBQ1AsY0FBYyxFQUFFLGtCQUFrQjtTQUNuQztRQUNELE1BQU0sRUFBRSxLQUFLO0tBQ2QsQ0FBQztJQUNGLElBQUksSUFBSSxFQUFFO1FBQ1IsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0tBQ3pCO0lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxvQkFBSyxDQUFDLHlCQUF5QixHQUFHLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN0RSxJQUFJLFFBQVEsQ0FBQyxFQUFFLEVBQUU7UUFDZixPQUFPLE9BQU8sQ0FBQyxNQUFNLEtBQUssS0FBSyxJQUFJLEdBQUcsS0FBSyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO0tBQ2pIO0lBQ0QsT0FBTyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDeEMsQ0FBQyxDQUFDO0FBaEJXLFFBQUEsYUFBYSxpQkFnQnhCO0FBRUssTUFBTSxxQkFBcUIsR0FBRyxLQUFLLElBQUksRUFBRTtJQUM5QyxJQUFJO1FBQ0YsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLHFCQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztLQUN4QztJQUFDLE9BQU8sS0FBSyxFQUFFO1FBQ2QsT0FBTyxLQUFL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LFVBQVUsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7SUFDakMsSUFBSSxjQUFjLEdBQUcsRUFBRSxDQUFDO0lBQ3hCLE9BQU8sY0FBYyxDQUFDO0FBQ3hCLENBQUMsQ0FBQztBQUpXLFFBQUEsZ0JBQWdCLG9CQUkzQjtBQUVLLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxFQUFFLFNBQWlCLEVBQUUsVUFBa0IsRUFBRSxFQUFFO0lBQzlFLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxxQkFBYSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNsRixDQUFDLENBQUM7QUFGVyxRQUFBLGdCQUFnQixvQkFFM0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZmV0Y2ggZnJvbSAnbm9kZS1mZXRjaCc7XHJcbmltcG9ydCAqIGFzIG5vZGVGZXRjaCBmcm9tICdub2RlLWZldGNoJztcclxuaW1wb3J0IHsgRXZlbnRzLCBOb3RlcywgT2JzdGFjbGVzLCBTb25nQXJncywgVHJhY2tzIH0gZnJvbSAnLi93b3JrZXInO1xyXG5cclxuZXhwb3J0IGNvbnN0IHB5dGhvblJlcXVlc3QgPSBhc3luYyAodXJsOiBzdHJpbmcgPSAnJywgZGF0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XHJcbiAgY29uc3Qgb3B0aW9uczogbm9kZUZldGNoLlJlcXVlc3RJbml0ID0ge1xyXG4gICAgaGVhZGVyczoge1xyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgfSxcclxuICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgfTtcclxuICBpZiAoZGF0YSkge1xyXG4gICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkoZGF0YSk7XHJcbiAgICBvcHRpb25zLm1ldGhvZCA9ICdQT1NUJztcclxuICB9XHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgaHR0cDovLzEyNy4wLjAuMTo1MDAwLyR7dXJsfWAsIG9wdGlvbnMpO1xyXG4gIGlmIChyZXNwb25zZS5vaykge1xyXG4gICAgcmV0dXJuIG9wdGlvbnMubWV0aG9kID09PSAnR0VUJyB8fCB1cmwgPT09ICdjb252ZXJ0X211c2ljX2ZpbGUnID8gYXdhaXQgcmVzcG9uc2UudGV4dCgpIDogYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gIH1cclxuICByZXR1cm4gbmV3IEVycm9yKHJlc3BvbnNlLnN0YXR1c1RleHQpO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGlzUHl0aG9uU2VydmVyUnVubmluZyA9IGFzeW5jICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuICEhKGF3YWl0IHB5dGhvblJlcXVlc3QoJ3BpbmcnKSk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgY2xvc2VQeXRob25TZXJ2ZXIgPSBhc3luYyAoKSA9PiB7XHJcbiAgcmV0dXJuICEhKGF3YWl0IHB5dGhvblJlcXVlc3QoJ2Nsb3NlJykpO1xyXG59O1xyXG5cclxuaW50ZXJmYWNlIFB5dGhvblJlc3BvbnNlRGF0YTxUPiB7XHJcbiAgZGF0YTogVDtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBCZWF0RmVhdHVyZXMge1xyXG4gIGJwbTogbnVtYmVyO1xyXG4gIGJlYXRfdGltZXM6IG51bWJlcltdO1xyXG4gIHk6IG51bWJlcltdO1xyXG4gIHNyOiBudW1iZXI7XHJcbn1cclxuZXhwb3J0IGNvbnN0IGdldEJlYXRGZWF0dXJlcyA9IChzb25nX3BhdGg6IHN0cmluZyk6IFByb21pc2U8UHl0aG9uUmVzcG9uc2VEYXRhPEJlYXRGZWF0dXJlcz4+ID0+XHJcbiAgcHl0aG9uUmVxdWVzdCgnZ2V0X2JlYXRfZmVhdHVyZXMnLCB7IHNvbmdfcGF0aCB9KTtcclxuZXhwb3J0IGNvbnN0IGdldE5vdGVzTGlzdCA9IChhcmdzOiB7XHJcbiAgbW9kZWw6IHN0cmluZztcclxuICBkaWZmaWN1bHR5OiBzdHJpbmc7XHJcbiAgYmVhdF90aW1lczogbnVtYmVyW107XHJcbiAgYnBtOiBudW1iZXI7XHJcbiAgdmVyc2lvbjogbnVtYmVyO1xyXG4gIHk6IG51bWJlcltdO1xyXG4gIHNyOiBudW1iZXI7XHJcbiAgdGVtcERpcjogc3RyaW5nO1xyXG59KTogUHJvbWlzZTxQeXRob25SZXNwb25zZURhdGE8Tm90ZXNbXT4+ID0+IHB5dGhvblJlcXVlc3QoJ3J1bl9tb2RlbCcsIGFyZ3MpO1xyXG5cclxuLyoqXHJcbiAqIEZ1bmN0aW9uIGZvciB3cml0aW5nIGEgbGlzdCBvZiBldmVudHMuXHJcbiAqIEBwYXJhbSBhcmdzXHJcbiAqIEByZXR1cm5zIGV2ZW50X2xpc3RcclxuICovXHJcbmV4cG9ydCBjb25zdCBnZXRFdmVudHNMaXN0ID0gKFxyXG4gIGFyZ3M6IHsgZXZlbnRDb2xvclN3YXBPZmZzZXQ6IG51bWJlcjsgbm90ZXNfbGlzdDogTm90ZXNbXTsgYnBtOiBudW1iZXIgfSxcclxuICBlcnJvclxyXG4pOiBFdmVudHNbXSA9PiB7XHJcbiAgY29uc3QgeyBldmVudENvbG9yU3dhcE9mZnNldCwgbm90ZXNfbGlzdCwgYnBtIH0gPSBhcmdzO1xyXG4gIC8vIFNldCBhbiBldmVudCB0byBiZSBhdCB0aW1lIDBcclxuICBsZXQgZXZlbnRzX2xpc3Q6IEV2ZW50c1tdID0gW3sgX3RpbWU6IDAsIF90eXBlOiA0LCBfdmFsdWU6IDAgfV07XHJcblxyXG4gIC8qKlxyXG4gICAqIF90eXBlXHJcbiAgICogIDAgOiBCYWNrIExhc2VyXHJcbiAgICogIDEgOiBUcmFjayBOZW9uc1xyXG4gICAqICAyIDogTGVmdCBMYXNlclxyXG4gICAqICAzIDogUmlnaHQgTGFzZXJcclxuICAgKiAgNCA6IFByaW1hcnkgTGlnaHRcclxuICAgKiAgNSA6XHJcbiAgICogIDYgOlxyXG4gICAqICA3IDpcclxuICAgKiAgOCA6IFJpbmcgUm90YXRpb24gKHVzZXMgdmFsdWUgb2YgMCwgc3dhcHMgcm90YXRpb24gZWFjaCB0aW1lKVxyXG4gICAqICA5IDogU21hbGwgUmluZyBab29tICh1c2VzIHZhbHVlIG9mIDAsIHpvb21zIGluL291dCBpZiBpdCBpcyB6b29tZWQgb3V0L2luKVxyXG4gICAqIDEwIDpcclxuICAgKiAxMSA6XHJcbiAgICogMTIgOiBMZWZ0IExhc2VyIFNwZWVkICh2YWx1ZSBpcyAwLTEyLCBoaWdoZXIgdmFsdWUgPSBoaWdoZXIgc3BlZWQpXHJcbiAgICogMTMgOiBSaWdodCBMYXNlciBTcGVlZCAodmFsdWUgaXMgMC0xMiwgaGlnaGVyIHZhbHVlID0gaGlnaGVyIHNwZWVkKVxyXG4gICAqL1xyXG4gIGNvbnN0IGV2ZW50VHlwZXMgPSB7XHJcbiAgICBMaWdodHM6IDQsXHJcbiAgICBMYXNlcnM6IFswLCAxLCAyLCAzXSxcclxuICAgIFJpbmdzOiBbOCwgOV0sXHJcbiAgICBTcGVlZHM6IFsxMiwgMTNdLFxyXG4gIH07XHJcblxyXG4gIC8qKlxyXG4gICAqIF92YWx1ZVxyXG4gICAqIDAgOiBPZmZcclxuICAgKiAxIDogQmx1ZSBOb3JtYWxcclxuICAgKiAyIDogQmx1ZSBGYWRlIEluXHJcbiAgICogMyA6IEJsdWUgRmFkZSBPdXRcclxuICAgKiA0IDpcclxuICAgKiA1IDogUmVkIE5vcm1hbFxyXG4gICAqIDYgOiBSZWQgRmFkZSBJblxyXG4gICAqIDcgOiBSZWQgRmFkZSBPdXRcclxuICAgKi9cclxuICBjb25zdCBldmVudFZhbHVlcyA9IHtcclxuICAgIE9mZjogMCxcclxuICAgIE5vcm1hbDogWzUsIDFdLFxyXG4gICAgRmFkZUluOiBbNiwgMl0sXHJcbiAgICBGYWRlT3V0OiBbNywgM10sXHJcbiAgfTtcclxuXHJcbiAgbGV0IGxhc3RFdmVudFRpbWUgPSAwO1xyXG4gIGxldCBsYXN0RXZlbnRDb2xvciA9IDA7XHJcbiAgbGV0IGxhc3RFdmVudEludGVuc2l0eSA9ICdPZmYnO1xyXG4gIGxldCBsYXN0RXZlbnRSaW5nID0gMDtcclxuICAvLyBPZmZzZXQgaXMgYXBwbGllZCB0byBjaGFuZ2UgdGhlIGxpZ2h0aW5nIGV2ZXJ5IG4ndGggc2Vjb25kXHJcbiAgY29uc3QgZXZlbnRDb2xvclN3YXBJbnRlcnZhbCA9IE1hdGgucm91bmQoYnBtIC8gNjApICogZXZlbnRDb2xvclN3YXBPZmZzZXQ7XHJcblxyXG4gIGlmICghbm90ZXNfbGlzdCB8fCBub3Rlc19saXN0Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdOb3RlcyBsaXN0IGlzIGVtcHR5IScpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZmlyc3ROb3RlID0gbm90ZXNfbGlzdFswXTtcclxuICBjb25zdCBsYXN0Tm90ZSA9IG5vdGVzX2xpc3Rbbm90ZXNfbGlzdC5sZW5ndGggLSAxXTtcclxuXHJcbiAgZm9yIChjb25zdCBub3RlIG9mIG5vdGVzX2xpc3QpIHtcclxuICAgIC8vIExpZ2h0c1xyXG4gICAgdHJ5IHtcclxuICAgICAgaWYgKG5vdGUgPT09IGxhc3ROb3RlIHx8IG5vdGUgPT09IGZpcnN0Tm90ZSkge1xyXG4gICAgICAgIGV2ZW50c19saXN0LnB1c2goe1xyXG4gICAgICAgICAgX3RpbWU6IG5vdGUuX3RpbWUsXHJcbiAgICAgICAgICBfdHlwZTogZXZlbnRUeXBlcy5MaWdodHMsXHJcbiAgICAgICAgICBfdmFsdWU6IGV2ZW50VmFsdWVzLk9mZixcclxuICAgICAgICB9KTtcclxuICAgICAgfSBlbHNlIGlmIChub3RlLl90aW1lIC0gbGFzdEV2ZW50VGltZSA+IGV2ZW50Q29sb3JTd2FwSW50ZXJ2YWwpIHtcclxuICAgICAgICBsZXQgY29sb3IgPSAwO1xyXG4gICAgICAgIGxldCBpbnRlbnNpdHkgPSAnTm9ybWFsJztcclxuICAgICAgICBpZiAobGFzdEV2ZW50SW50ZW5zaXR5ID09PSAnT2ZmJyB8fCBsYXN0RXZlbnRJbnRlbnNpdHkgPT09ICdGYWRlT3V0Jykge1xyXG4gICAgICAgICAgaW50ZW5zaXR5ID0gJ0ZhZGVJbic7XHJcbiAgICAgICAgICBjb2xvciA9IGxhc3RFdmVudENvbG9yID09PSAxID8gMCA6IDE7XHJcbiAgICAgICAgfSBlbHNlIGlmIChsYXN0RXZlbnRJbnRlbnNpdHkgPT09ICdGYWRlSW4nKSB7XHJcbiAgICAgICAgICBpbnRlbnNpdHkgPSAnTm9ybWFsJztcclxuICAgICAgICAgIGNvbG9yID0gbGFzdEV2ZW50Q29sb3I7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGludGVuc2l0eSA9ICdGYWRlT3V0JztcclxuICAgICAgICAgIGNvbG9yID0gbGFzdEV2ZW50Q29sb3I7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGV2ZW50c19saXN0LnB1c2goe1xyXG4gICAgICAgICAgX3RpbWU6IG5vdGUuX3RpbWUsXHJcbiAgICAgICAgICBfdHlwZTogZXZlbnRUeXBlcy5MaWdodHMsXHJcbiAgICAgICAgICBfdmFsdWU6IGV2ZW50VmFsdWVzW2ludGVuc2l0eV1bY29sb3JdLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxhc3RFdmVudFRpbWUgPSBub3RlLl90aW1lO1xyXG4gICAgICAgIGxhc3RFdmVudENvbG9yID0gY29sb3I7XHJcbiAgICAgICAgbGFzdEV2ZW50SW50ZW5zaXR5ID0gaW50ZW5zaXR5O1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgZXJyb3IoYExpZ2h0cyBldmVudCB3cml0aW5nIGVycm9yOiAke0pTT04uc3RyaW5naWZ5KG5vdGUsIG51bGwsIDIpfWApO1xyXG4gICAgICBlcnJvcihlcnIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJpbmdzXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAobGFzdEV2ZW50UmluZyA+IDIpIHtcclxuICAgICAgICBsYXN0RXZlbnRSaW5nID0gMDtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCByaW5nID0gbGFzdEV2ZW50UmluZyA+IDAgPyAxIDogMDtcclxuICAgICAgZXZlbnRzX2xpc3QucHVzaCh7XHJcbiAgICAgICAgX3RpbWU6IG5vdGUuX3RpbWUsXHJcbiAgICAgICAgX3R5cGU6IGV2ZW50VHlwZXMuUmluZ3NbcmluZ10sXHJcbiAgICAgICAgX3ZhbHVlOiBldmVudFZhbHVlcy5PZmYsXHJcbiAgICAgIH0pO1xyXG4gICAgICBsYXN0RXZlbnRSaW5nKys7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgZXJyb3IoYFJpbmdzIGV2ZW50IHdyaXRpbmcgZXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkobm90ZSwgbnVsbCwgMil9YCk7XHJcbiAgICAgIGVycm9yKGVycik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTGFzZXJzXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAobm90ZS5fdHlwZSAhPT0gMykge1xyXG4gICAgICAgIGV2ZW50c19saXN0LnB1c2goe1xyXG4gICAgICAgICAgX3RpbWU6IG5vdGUuX3RpbWUsXHJcbiAgICAgICAgICBfdHlwZTogZXZlbnRUeXBlcy5MYXNlcnNbMV0sXHJcbiAgICAgICAgICBfdmFsdWU6IGV2ZW50VmFsdWVzLk5vcm1hbFtub3RlLl90eXBlXSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIGVycm9yKGBMYXNlcnMgZXZlbnQgd3JpdGluZyBlcnJvcjogJHtKU09OLnN0cmluZ2lmeShub3RlLCBudWxsLCAyKX1gKTtcclxuICAgICAgZXJyb3IoZXJyKTtcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIGV2ZW50c19saXN0O1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldE9ic3RhY2xlc0xpc3QgPSAoYXJnczogeyBub3Rlc19saXN0OiBOb3Rlc1tdOyBicG06IG51bWJlciB9KTogT2JzdGFjbGVzW10gPT4ge1xyXG4gIGNvbnN0IHsgbm90ZXNfbGlzdCwgYnBtIH0gPSBhcmdzO1xyXG4gIGxldCBvYnN0YWNsZXNfbGlzdCA9IFtdO1xyXG4gIHJldHVybiBvYnN0YWNsZXNfbGlzdDtcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBjb252ZXJ0TXVzaWNGaWxlID0gYXN5bmMgKHNvbmdfcGF0aDogc3RyaW5nLCB3b3JraW5nRGlyOiBzdHJpbmcpID0+IHtcclxuICByZXR1cm4gISEoYXdhaXQgcHl0aG9uUmVxdWVzdCgnY29udmVydF9tdXNpY19maWxlJywgeyBzb25nX3BhdGgsIHdvcmtpbmdEaXIgfSkpO1xyXG59O1xyXG4iXX0=