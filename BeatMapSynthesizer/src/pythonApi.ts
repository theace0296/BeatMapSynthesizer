import fetch from 'node-fetch';
import * as nodeFetch from 'node-fetch';
import { Events, Notes, Obstacles, SongArgs, Tracks } from './worker';

export const pythonRequest = async (url: string = '', data?: Record<string, unknown>) => {
  const options: nodeFetch.RequestInit = {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'GET',
  };
  if (data) {
    options.body = JSON.stringify(data);
    options.method = 'POST';
  }
  const response = await fetch(`http://127.0.0.1:5000/${url}`, options);
  if (response.ok) {
    return options.method === 'GET' || url === 'convert_music_file' ? await response.text() : await response.json();
  }
  return new Error(response.statusText);
};

export const isPythonServerRunning = async () => {
  return !!(await pythonRequest('ping'));
};

export const closePythonServer = async () => {
  return !!(await pythonRequest('close'));
};

interface PythonResponseData<T> {
  data: T;
}

export interface BeatFeatures {
  bpm: number;
  beat_times: number[];
  y: number[];
  sr: number;
}
export const getBeatFeatures = (song_path: string): Promise<PythonResponseData<BeatFeatures>> =>
  pythonRequest('get_beat_features', { song_path });
export const getNotesList = (args: {
  model: string;
  difficulty: string;
  beat_times: number[];
  bpm: number;
  version: number;
  y: number[];
  sr: number;
  tempDir: string;
}): Promise<PythonResponseData<Notes[]>> => pythonRequest('run_model', args);

/**
 * Function for writing a list of events.
 * @param args
 * @returns event_list
 */
export const getEventsList = (args: { eventColorSwapOffset: number; notes_list: Notes[]; bpm: number }): Events[] => {
  const { eventColorSwapOffset, notes_list, bpm } = args;
  // Set an event to be at time 0
  let events_list: Events[] = [{ _time: 0, _type: 4, _value: 0 }];

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
      } else if (note._time - lastEventTime > eventColorSwapInterval) {
        let color = 0;
        let intensity = 'Normal';
        if (lastEventIntensity === 'Off' || lastEventIntensity === 'FadeOut') {
          intensity = 'FadeIn';
          color = lastEventColor === 1 ? 0 : 1;
        } else if (lastEventIntensity === 'FadeIn') {
          intensity = 'Normal';
          color = lastEventColor;
        } else {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error(`Lasers event writing error: ${JSON.stringify(note, null, 2)}`);
      console.error(error);
    }
  }
  return events_list;
};

export const getObstaclesList = (args: { notes_list: Notes[]; bpm: number }): Obstacles[] => {
  const { notes_list, bpm } = args;
  let obstacles_list = [];
  return obstacles_list;
};

export const convertMusicFile = async (song_path: string, workingDir: string) => {
  return !!(await pythonRequest('convert_music_file', { song_path, workingDir }));
};
