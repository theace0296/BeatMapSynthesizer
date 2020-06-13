from __future__ import print_function

import argparse
import json
import os
import pickle
import shutil
import sys
import traceback
import warnings
from io import BytesIO, StringIO, TextIOWrapper
from zipfile import ZipFile

import audioread
import librosa
import markovify
import numpy as np
import pandas as pd
import scipy
import sklearn.cluster
import sklearn.utils
import soundfile as sf
from pydub import AudioSegment

warnings.filterwarnings(
    'ignore',
    "PySoundFile failed. Trying audioread instead.")


def _print(message):
    if message:
        sys.stdout.write(f"{message}\n")
        sys.stdout.flush()
    else:
        sys.stdout.write('_________________________________________________________\n')
        sys.stdout.flush()


def parseArgs():
    parser = argparse.ArgumentParser()
    parser.add_argument('song_path',
                        metavar='path',
                        type=str,
                        help='File Path to song file')
    parser.add_argument('song_name',
                        type=str,
                        help='Name of song to be displayed in Beat Saber')
    parser.add_argument('difficulty',
                        type=str,
                        help="""
                        Desired difficulty level:
                        'easy', 'normal', 'hard', 'expert', 'expertplus', or 'all'
                        """)
    parser.add_argument('model',
                        type=str,
                        help="""
                        Desired model for mapping:
                        'random', 'HMM', 'segmented_HMM', 'rate_modulated_segmented_HMM'
                        """)
    parser.add_argument('-k',
                        type=int,
                        help="Number of expected segments for segmented model. Default 5",
                        default=5,
                        required=False)
    parser.add_argument('--version',
                        type=int,
                        help="Version of HMM model to use. Default: 2",
                        default=2,
                        required=False)
    parser.add_argument('--environment',
                        type=str,
                        help="Environment to use in Beat Saber",
                        default='DefaultEnvironment',
                        required=False)
    parser.add_argument('--lightsIntensity',
                        type=int,
                        help="Intensity of lighting effects",
                        default=9,
                        required=False)
    parser.add_argument('--albumDir',
                        type=str,
                        help="Path to album cover art to use",
                        default='NONE',
                        required=False)
    parser.add_argument('--workingDir',
                        type=str,
                        help="Working directory, this is automatically set, do not use this!",
                        default=os.getcwd(),
                        required=True)
    parser.add_argument('--outDir',
                        type=str,
                        help="Directory to save outputed files to. Default: Current directory.",
                        default=os.getcwd(),
                        required=False)
    parser.add_argument('--zipFiles',
                        type=int,
                        help="Boolean to zip output files.",
                        default=0,
                        required=False)
    return parser.parse_args()


class Notes:
    class CutDirs:
        Up = 0
        UpRight = 5
        Right = 3
        DownRight = 7
        Down = 1
        DownLeft = 6
        Left = 2
        UpLeft = 4
        Dot = 8
    cut_dirs = CutDirs()

    class Columns:
        Col1 = 0
        Col2 = 1
        Col3 = 2
        Col4 = 3
    line_indices = Columns()

    class Rows:
        Bottom = 0
        Middle = 1
        Top = 2
    line_layers = Rows()


class Main:
    def __init__(self, song_path, song_name, difficulty, model, k, version,
                 environment, lightsIntensity, albumDir, outDir, zipFiles):
        self.song_path = song_path
        if song_name is None:
            self.song_name = os.path.splitext(self.song_path)[0]
        else:
            self.song_name = song_name

        self.seed = 0
        for char in song_name:
            self.seed = int(f"{self.seed}{ord(char)}")
        while (self.seed > 2**32 - 1):
            self.seed = int(self.seed / (2**32 - 1))
        np.random.seed(self.seed)

        self.difficulty = difficulty
        self.model = model

        if k is None:
            self.k = 5
        else:
            self.k = k

        if version is None:
            self.version = 2
        else:
            self.version = version

        if environment is None:
            self.environment = 'DefaultEnvironment'
        else:
            self.environment = environment

        if lightsIntensity is None:
            self.eventColorSwapOffset = 2.5
        else:
            self.eventColorSwapOffset = (11.5 - lightsIntensity)

        if albumDir is None or albumDir == 'NONE':
            self.albumDir = 'cover.jpg'
        else:
            self.albumDir = albumDir

        self.outDir = outDir
        self.zipFiles = zipFiles
        self.workingDir = f"{self.outDir}/{self.song_name}"

        if not os.path.exists(self.workingDir):
            os.makedirs(self.workingDir)

        _lists = {'events_list': [],
                  'notes_list': [],
                  'obstacles_list': [],
                  'modulated_beat_list': []}

        self.tracks = {
                    'bpm': 0,
                    'beat_times': [],
                    'y': 0,
                    'sr': 0,
                    'easy': _lists,
                    'normal': _lists,
                    'hard': _lists,
                    'expert': _lists,
                    'expertplus': _lists}

    def write_info_file(self):
        """This function creates the 'info.dat' file."""
        difficulty_beatmaps_array = []

        def beatmap_df(diff, rank, movement_speed):
            return {"_difficulty": diff,
                    "_difficultyRank": rank,
                    "_beatmapFilename": f"{diff.casefold()}.dat",
                    "_noteJumpMovementSpeed": movement_speed,
                    "_noteJumpStartBeatOffset": 0,
                    "_customData": {}}

        easy_beatmaps_df = beatmap_df("Easy", 1, 8)
        normal_beatmaps_df = beatmap_df("Normal", 3, 10)
        hard_beatmaps_df = beatmap_df("Hard", 5, 12)
        expert_beatmaps_df = beatmap_df("Expert", 7, 14)
        expertplus_beatmaps_df = beatmap_df("ExpertPlus", 9, 16)

        if self.difficulty.casefold() == 'easy'.casefold():
            difficulty_beatmaps_array = [easy_beatmaps_df]
        elif self.difficulty.casefold() == 'normal'.casefold():
            difficulty_beatmaps_array = [normal_beatmaps_df]
        elif self.difficulty.casefold() == 'hard'.casefold():
            difficulty_beatmaps_array = [hard_beatmaps_df]
        elif self.difficulty.casefold() == 'expert'.casefold():
            difficulty_beatmaps_array = [expert_beatmaps_df]
        elif self.difficulty.casefold() == 'expertplus'.casefold():
            difficulty_beatmaps_array = [expertplus_beatmaps_df]
        elif self.difficulty.casefold() == 'all'.casefold():
            difficulty_beatmaps_array = [easy_beatmaps_df,
                                         normal_beatmaps_df,
                                         hard_beatmaps_df,
                                         expert_beatmaps_df,
                                         expertplus_beatmaps_df]
        _artist = self.song_name.split(' - ')
        _artist = _artist[len(_artist)]
        info = {'_version': '2.0.0',
                '_songName': f"{self.song_name}",
                '_songSubName': '',
                '_songAuthorName': f"{_artist}",
                '_levelAuthorName': 'BeatMapSynth',
                '_beatsPerMinute': round(self.tracks['bpm']),
                '_songTimeOffset': 0,
                '_shuffle': 0,
                '_shufflePeriod': 0,
                '_previewStartTime': 10,
                '_previewDuration': 30,
                '_songFilename': 'song.egg',
                '_coverImageFilename': 'cover.jpg',
                '_environmentName': self.environment,
                '_customData': {},
                '_difficultyBeatmapSets': [
                 {'_beatmapCharacteristicName': 'Standard',
                  '_difficultyBeatmaps': difficulty_beatmaps_array}]
                }

        with open(f"{self.workingDir}/info.dat", 'w') as f:
            json.dump(info, f, indent=4)

    def write_level_file(self):
        """This function creates the 'level.dat' file."""
        if self.difficulty.casefold() == 'ALL'.casefold():
            for diff in ['easy', 'normal', 'hard', 'expert', 'expertplus']:
                level = {
                 '_version': '2.0.0',
                 '_customData': {'_time': '',  # not sure what time refers to
                                 '_BPMChanges': [],
                                 '_bookmarks': []},
                 '_events': self.tracks[diff.casefold()]['events_list'],
                 '_notes': self.tracks[diff.casefold()]['notes_list'],
                 '_obstacles': self.tracks[diff.casefold()]['obstacles_list']}
                with open(f"{self.workingDir}/{diff}.dat", 'w') as f:
                    json.dump(level, f, indent=4)
        else:
            level = {
                 '_version': '2.0.0',
                 '_customData': {'_time': '',  # not sure what time refers to
                                 '_BPMChanges': [],
                                 '_bookmarks': []},
                 '_events': self.tracks[self.difficulty.casefold()]['events_list'],
                 '_notes': self.tracks[self.difficulty.casefold()]['notes_list'],
                 '_obstacles': self.tracks[self.difficulty.casefold()]['obstacles_list']}
            with open(f"{self.workingDir}/{self.difficulty}.dat", 'w') as f:
                json.dump(level, f, indent=4)

    def convert_music_file(self):
        """Converts audio file from supported type to EGG"""
        if self.song_path.endswith('.mp3'):
            AudioSegment.from_mp3(self.song_path).export(f"{self.workingDir}/song.egg", format='ogg')
        elif self.song_path.endswith('.wav'):
            AudioSegment.from_wav(self.song_path).export(f"{self.workingDir}/song.egg", format='ogg')
        elif self.song_path.endswith('.flv'):
            AudioSegment.from_flv(self.song_path).export(f"{self.workingDir}/song.egg", format='ogg')
        elif self.song_path.endswith('.raw'):
            AudioSegment.from_raw(self.song_path).export(f"{self.workingDir}/song.egg", format='ogg')
        elif self.song_path.endswith('.ogg') or self.song_path.endswith('.egg'):
            shutil.copyfile(self.song_path, f"{self.workingDir}/song.egg")
        else:
            raise IOError("Unsupported file type. Choose a file of type MP3, WAV, FLV, RAW, OGG, or EGG.")

    def events_writer(self, difficulty):
        """Function for writing a list of events."""
        # Set an event to be at time 0
        notes_list = self.tracks[difficulty.casefold()]['notes_list']
        events_list = [{'_time': 0, '_type': 4, '_value': 0}]

        """
        _type
        0 : Back Laser
        1 : Track Neons
        2 : Left Laser
        3 : Right Laser
        4 : Primary Light
        5 :
        6 :
        7 :
        8 : Ring Rotation (uses value of 0, swaps rotation each time)
        9 : Small Ring Zoom (uses value of 0, zooms in/out if it is zoomed out/in)
        10 :
        11 :
        12 : Left Laser Speed (value is 0-12, higher value = higher speed)
        13 : Right Laser Speed (value is 0-12, higher value = higher speed)
        """
        eventTypes = {'Lights': 4,
                      'Lasers': [0, 1, 2, 3],
                      'Rings': [8, 9],
                      'Speeds': [12, 13]}

        """
        _value
        0 : Off
        1 : Blue Normal
        2 : Blue Fade In
        3 : Blue Fade Out
        4 :
        5 : Red Normal
        6 : Red Fade In
        7 : Red Fade Out
        """
        eventValues = {'Off': 0,
                       'Normal': [5, 1],
                       'FadeIn': [6, 2],
                       'FadeOut': [7, 3]}

        lastEventTime = 0
        lastEventColor = 0
        lastEventIntensity = 'Off'
        lastEventRing = 0
        # Offset is applied to change the lighting every n'th second
        eventColorSwapInterval = round(self.tracks['bpm'] / 60) * self.eventColorSwapOffset

        firstNote = notes_list[0]
        lastNote = notes_list[len(notes_list) - 1]

        for note in notes_list:
            # Lights
            try:
                if (note['_time'] - lastEventTime) > eventColorSwapInterval and note != lastNote and note != firstNote:
                    color = 0
                    intensity = 'Normal'

                    if lastEventIntensity == 'Off' or lastEventIntensity == 'FadeOut':
                        intensity = 'FadeIn'
                        color = 0 if lastEventColor else 1
                    if lastEventIntensity == 'FadeIn':
                        intensity = 'Normal'
                        color = lastEventColor
                    if lastEventIntensity == 'Normal':
                        intensity = 'FadeOut'
                        color = lastEventColor

                    event = {'_time': note['_time'],
                             '_type': eventTypes['Lights'],
                             '_value': eventValues[intensity][color]}

                    events_list.append(event)
                    lastEventTime = note['_time']
                    lastEventColor = color
                    lastEventIntensity = intensity

                elif note == lastNote:
                    event = {'_time': note['_time'],
                             '_type': eventTypes['Lights'],
                             '_value': eventValues['Off']}
                    events_list.append(event)

                elif note == firstNote:
                    event = {'_time': note['_time'],
                             '_type': eventTypes['Lights'],
                             '_value': eventValues['Off']}
                    events_list.append(event)
            except Exception:
                _print()
                _print(traceback.format_exc())
                _print(f"1.1 Event Writing Error in Song: {self.song_name} during Event:")
                _print(json.dumps(event, indent=4))
                _print()

            # Rings
            try:
                if lastEventRing > 2:
                    lastEventRing = 0

                ring = 1 if lastEventRing > 0 else 0

                event = {'_time': note['_time'],
                         '_type': eventTypes['Rings'][ring],
                         '_value': eventValues['Off']}

                events_list.append(event)
                lastEventRing = lastEventRing + 1
            except Exception:
                _print()
                _print(traceback.format_exc())
                _print(f"1.1 Event Writing Error in Song: {self.song_name} during Event:")
                _print(json.dumps(event, indent=4))
                _print()

            # Lasers
            try:
                if note['_type'] != 3:
                    event = {'_time': note['_time'],
                             '_type': eventTypes['Lasers'][1],
                             '_value': eventValues['Normal'][note['_type']]}

                    events_list.append(event)
            except Exception:
                _print()
                _print(traceback.format_exc())
                _print(f"1.1 Event Writing Error in Song: {self.song_name} during Event:")
                _print(json.dumps(event, indent=4))
                _print()

        return events_list

    def obstacles_writer(self, difficulty):
        """Function for writing a list of obstacles."""
        obstacles_list = []

        return obstacles_list

    def zip_writer(self):
        """
        This function exports the ZIP file or folder containing the
        info.dat, difficulty.dat, cover.jpg, and song.egg files.
        """
        shutil.copyfile(self.albumDir, f"{self.workingDir}/cover.jpg")

        if self.zipFiles:
            files = [f"{self.workingDir}/info.dat",
                     f"{self.workingDir}/cover.jpg",
                     f"{self.workingDir}/song.egg"]
            if self.difficulty.casefold() == 'ALL'.casefold():
                for diff in ['easy', 'normal', 'hard', 'expert', 'expertplus']:
                    files.append(f"{self.workingDir}/{diff}.dat")
            else:
                files.append(f"{self.workingDir}/{self.difficulty}.dat")
            with ZipFile(f"{self.outDir}/{self.song_name}.zip", 'w') as custom:
                for file in files:
                    custom.write(file, arcname=os.path.basename(file))
            for file in files:
                os.remove(file)
            os.rmdir(self.workingDir)

    def get_beat_features(self):
        """Takes in the song stored at 'song_path' and estimates the bpm and beat times."""
        # Load song and split into harmonic and percussive parts.
        y, sr = librosa.load(self.song_path)
        # y_harmonic, y_percussive = librosa.effects.hpss(y)
        # Isolate beats and beat times
        bpm, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        return bpm, beat_times, y, sr

    def run_model(self, difficulty):
        """Refractored model runner to allow for only a single mapping function"""
        _print(f"\t{self.song_name} | Modeling {difficulty} using {self.model} model...")

        if self.model == 'random':
            """
            Function to generate a completely random map (i.e. baseline model) for a song.
            This is completely random and is likely not enjoyable if even playable!
            """
            return self.random_notes_writer(difficulty)
        elif self.model == 'HMM':
            """
            This function generates a custom map based on a Hidden Markov Model.
            """
            return self.hmm_notes_writer(difficulty)
        elif self.model == 'segmented_HMM':
            """
            This function generates a custom map based on a
            HMM model that operates on song segments.
            First, Laplacian song segmentation is performed
            to identify similar portions of songs.
            Then, a HMM is used to generate a block sequence through
            the first of each of these identified song segments.
            If that segment is repeated later in the song,
            the block sequence will be repeated.
            """
            return self.segmented_hmm_notes_writer(difficulty)
        elif self.model == 'rate_modulated_segmented_HMM':
            """
            This function generates the files for a custom map using a
            rate modulated segmented HMM model.
            """
            return self.rate_modulated_segmented_hmm_notes_writer(difficulty)
        else:
            _print('Please specify model for mapping.')

    def remove_bad_notes(self, notes_list):
        """Remove notes that come too early in the song"""
        # Using the BPM we can covert from beats to seconds
        def seconds(number):
            return round(self.tracks['bpm'] / 60) * number

        notes_list = list(filter(lambda note: note['_time'] >= seconds(2), notes_list))  # Only keep notes that come after the 2 seconds into the song

        def remove_zeros(number):
            while number % 10 == 0:
                number //= 10
            return number

        temp_notes_list = []
        index = 0
        current_note = notes_list[index]
        while current_note:
            try:
                if current_note['_lineIndex'] > 3:
                    current_note['_lineIndex'] = remove_zeros(current_note['_lineIndex'])
                elif current_note['_lineIndex'] < 0:
                    index += 1
                    current_note = notes_list[index]
                    continue
                if current_note['_lineLayer'] > 2:
                    current_note['_lineLayer'] = remove_zeros(current_note['_lineLayer'])
                elif current_note['_lineLayer'] < 0:
                    index += 1
                    current_note = notes_list[index]
                    continue
                if current_note['_cutDirection'] > 8:
                    current_note['_cutDirection'] = remove_zeros(current_note['_cutDirection'])
                elif current_note['_cutDirection'] < 0:
                    index += 1
                    current_note = notes_list[index]
                    continue
                temp_notes_list.append(current_note)
                index += 1
                current_note = notes_list[index]
            except KeyError:
                index += 1
                current_note = notes_list[index]
                continue
            except IndexError:
                current_note = None

        notes_list = temp_notes_list

        cut_dirs = Notes().cut_dirs
        line_indices = Notes().line_indices
        line_layers = Notes().line_layers

        oppositeCutDirs = {cut_dirs.Up:        [cut_dirs.DownRight,   cut_dirs.Down,         cut_dirs.DownLeft],
                           cut_dirs.UpRight:   [cut_dirs.Down,        cut_dirs.DownLeft,     cut_dirs.Left],
                           cut_dirs.Right:     [cut_dirs.Down,        cut_dirs.DownLeft,     cut_dirs.Left],
                           cut_dirs.DownRight: [cut_dirs.Up,          cut_dirs.UpLeft,       cut_dirs.Left],
                           cut_dirs.Down:      [cut_dirs.Up,          cut_dirs.UpRight,      cut_dirs.UpLeft],
                           cut_dirs.DownLeft:  [cut_dirs.Up,          cut_dirs.UpRight,      cut_dirs.Right],
                           cut_dirs.Left:      [cut_dirs.UpRight,     cut_dirs.Right,        cut_dirs.DownRight],
                           cut_dirs.UpLeft:    [cut_dirs.Right,       cut_dirs.DownRight,    cut_dirs.Down]}

        oppositeCutDir = {cut_dirs.Up:         cut_dirs.Down,
                          cut_dirs.UpRight:    cut_dirs.DownLeft,
                          cut_dirs.Right:      cut_dirs.Left,
                          cut_dirs.DownRight:  cut_dirs.UpLeft,
                          cut_dirs.Down:       cut_dirs.Up,
                          cut_dirs.DownLeft:   cut_dirs.UpRight,
                          cut_dirs.Left:       cut_dirs.Right,
                          cut_dirs.UpLeft:     cut_dirs.DownRight}

        cardinalDirs = [cut_dirs.Up, cut_dirs.Right, cut_dirs.Down, cut_dirs.Left]
        upDownDirs = [cut_dirs.Up, cut_dirs.Down]
        leftRightDirs = [cut_dirs.Left, cut_dirs.Right]

        oppositeIndices = {line_indices.Col1: [line_indices.Col2, line_indices.Col3],
                           line_indices.Col2: [line_indices.Col1, line_indices.Col3, line_indices.Col4],
                           line_indices.Col3: [line_indices.Col1, line_indices.Col2, line_indices.Col4],
                           line_indices.Col4: [line_indices.Col2, line_indices.Col3]}

        oppositeLayers = {line_layers.Bottom:   [line_layers.Middle, line_layers.Top],
                          line_layers.Middle:   [line_layers.Bottom, line_layers.Top],
                          line_layers.Top:      [line_layers.Bottom, line_layers.Middle]}

        # Top Row can't have cuts inward
        layerInwards = {line_layers.Top: [cut_dirs.DownRight, cut_dirs.Down, cut_dirs.DownLeft]}
        # Columns 1 and 4 can't have cuts inward
        indexInwards = {line_indices.Col1: [cut_dirs.UpRight, cut_dirs.Right, cut_dirs.DownRight],
                        line_indices.Col4: [cut_dirs.DownLeft, cut_dirs.Left, cut_dirs.UpLeft]}

        lastNote = notes_list[0]

        for i in range(1, len(notes_list)):
            try:
                if notes_list[i]['_cutDirection'] != cut_dirs.Dot and notes_list[i]['_type'] != 3 and lastNote['_time'] - notes_list[i]['_time'] < seconds(1.5):
                    try:
                        if (lastNote['_cutDirection'] != cut_dirs.Dot and notes_list[i]['_cutDirection'] != oppositeCutDir[lastNote['_cutDirection']] and
                                notes_list[i]['_type'] == lastNote['_type']):

                            notes_list[i]['_cutDirection'] = int(np.random.choice(oppositeCutDir[lastNote['_cutDirection']]))

                    except Exception:
                        _print()
                        _print(traceback.format_exc())
                        _print(f"1.1 Note Validation Error for Note: {i} in Song: {self.song_name}")
                        _print(json.dumps(notes_list[i], indent=4))
                        _print()
                    try:
                        if (notes_list[i]['_lineIndex'] not in oppositeIndices[lastNote['_lineIndex']] and
                                notes_list[i]['_lineLayer'] not in oppositeLayers[lastNote['_lineLayer']] and
                                notes_list[i]['_type'] != lastNote['_type']):

                            if int(np.random.choice([0, 1])):
                                notes_list[i]['_lineIndex'] = int(np.random.choice(oppositeIndices[lastNote['_lineIndex']]))
                            else:
                                notes_list[i]['_lineLayer'] = int(np.random.choice(oppositeLayers[lastNote['_lineLayer']]))

                    except Exception:
                        _print()
                        _print(traceback.format_exc())
                        _print(f"1.2 Note Validation Error for Note: {i} in Song: {self.song_name}")
                        _print(json.dumps(notes_list[i], indent=4))
                        _print()

                    try:
                        if notes_list[i]['_time'] == lastNote['_time']:

                            if notes_list[i]['_type'] == lastNote['_type']:
                                notes_list = notes_list.pop(i)

                            else:

                                if notes_list[i]['_lineIndex'] == lastNote['_lineIndex']:
                                    if notes_list[i]['_lineIndex'] in [line_indices.Col2, line_indices.Col3]:
                                        notes_list[i]['_cutDirection'] = cut_dirs.Dot
                                        notes_list[i-1]['_cutDirection'] = cut_dirs.Dot

                                    elif notes_list[i]['_lineIndex'] == line_indices.Col1:
                                        notes_list[i]['_cutDirection'] = cut_dirs.Left
                                        notes_list[i-1]['_cutDirection'] = cut_dirs.Left
                                        if notes_list[i]['_type'] == 0 and notes_list[i]['_lineLayer'] < lastNote['_lineLayer']:
                                            notes_list[i-1]['_lineLayer'] = notes_list[i]['_lineLayer']
                                            notes_list[i]['_lineLayer'] = lastNote['_lineLayer']

                                    elif notes_list[i]['_lineIndex'] == line_indices.Col4:
                                        notes_list[i]['_cutDirection'] = cut_dirs.Right
                                        notes_list[i-1]['_cutDirection'] = cut_dirs.Right
                                        if notes_list[i]['_type'] == 0 and notes_list[i]['_lineLayer'] > lastNote['_lineLayer']:
                                            notes_list[i-1]['_lineLayer'] = notes_list[i]['_lineLayer']
                                            notes_list[i]['_lineLayer'] = lastNote['_lineLayer']

                                elif notes_list[i]['_lineLayer'] == lastNote['_lineLayer']:

                                    if notes_list[i]['_lineLayer'] == line_layers.Bottom:
                                        notes_list[i]['_cutDirection'] = cut_dirs.Down
                                        notes_list[i-1]['_cutDirection'] = cut_dirs.Down

                                    elif notes_list[i]['_lineLayer'] == line_layers.Middle:
                                        choice = int(np.random.choice([0, 1]))
                                        notes_list[i]['_cutDirection'] = cut_dirs.Down
                                        notes_list[i-1]['_cutDirection'] = cut_dirs.Down

                                    elif notes_list[i]['_lineLayer'] == line_layers.Top:
                                        notes_list[i]['_cutDirection'] = cut_dirs.Up
                                        notes_list[i-1]['_cutDirection'] = cut_dirs.Up

                    except Exception:
                        _print()
                        _print(traceback.format_exc())
                        _print(f"1.3 Note Validation Error for Note: {i} in Song: {self.song_name}")
                        _print(json.dumps(notes_list[i], indent=4))
                        _print()

                    try:
                        if (notes_list[i]['_lineLayer'] == line_layers.Top and notes_list[i]['_lineIndex'] in [line_indices.Col2, line_indices.Col3]
                                and lastNote['_cutDIrection'] != cut_dirs.Up):
                            notes_list[i]['_cutDirection'] = cut_dirs.Up

                        elif (notes_list[i]['_lineLayer'] == line_layers.Top and notes_list[i]['_lineIndex'] == line_indices.Col1
                                and lastNote['_cutDIrection'] != cut_dirs.UpLeft):
                            notes_list[i]['_cutDirection'] = cut_dirs.UpLeft

                        elif (notes_list[i]['_lineLayer'] == line_layers.Top and notes_list[i]['_lineIndex'] == line_indices.Col2
                                and lastNote['_cutDIrection'] != cut_dirs.UpRight):
                            notes_list[i]['_cutDirection'] = cut_dirs.UpRight

                        elif (notes_list[i]['_lineIndex'] == line_indices.Col1
                                and lastNote['_cutDIrection'] != cut_dirs.Left):
                            notes_list[i]['_cutDirection'] = cut_dirs.Left

                        elif (notes_list[i]['_lineIndex'] == line_indices.Col4
                                and lastNote['_cutDIrection'] != cut_dirs.Right):
                            notes_list[i]['_cutDirection'] = cut_dirs.Right

                    except Exception:
                        _print()
                        _print(traceback.format_exc())
                        _print(f"1.4 Note Validation Error for Note: {i} in Song: {self.song_name}")
                        _print(json.dumps(notes_list[i], indent=4))
                        _print()

            except Exception:
                _print()
                _print(traceback.format_exc())
                _print(f"1.0 Note Validation Error for Note: {i} in Song: {self.song_name}")
                _print(json.dumps(notes_list[i], indent=4))
                _print()
            lastNote = notes_list[i]

        return notes_list

    def write_notes_hmm(self, df_preds):
        notes_list = []
        for index, row in df_preds.iterrows():
            for x in list(filter(lambda y: y.startswith('notes_type'), df_preds.columns)):
                if row[x] != '999':
                    num = x[-1]
                    note = {'_time': row['_time'],
                            '_lineIndex':    int(row[f"notes_lineIndex_{num}"]),
                            '_lineLayer':    int(row[f"notes_lineLayer_{num}"]),
                            '_type':         int(num),
                            '_cutDirection': int(row[f"notes_cutDirection_{num}"])}
                    notes_list.append(note)
        return self.remove_bad_notes(notes_list)

    # Random Mapping Note Writer
    def random_notes_writer(self, difficulty):
        """
        This function randomly places blocks at approximately each beat
        or every other beat depending on the difficulty.
        """
        notes_list = []
        line_index = [0, 1, 2, 3]
        line_layer = [0, 1, 2]
        types = [0, 1, 3]
        directions = list(range(0, 8))
        self.tracks['beat_times'] = [x * (self.tracks['bpm'] / 60) for x in self.tracks['beat_times']]

        if difficulty == 'Easy' or difficulty == 'Normal':
            for beat in self.tracks['beat_times']:
                empty = np.random.choice([0, 1])
                if empty == 1:
                    note = {'_time': beat,
                            '_lineIndex':    int(np.random.choice(line_index)),
                            '_lineLayer':    int(np.random.choice(line_layer)),
                            '_type':         int(np.random.choice(types)),
                            '_cutDirection': int(np.random.choice(directions))}
                    notes_list.append(note)
                else:
                    continue
        else:
            # Randomly choose beats to have more than one note placed
            random_beats = np.random.choice(self.tracks['beat_times'], np.random.choice(range(len(self.tracks['beat_times']))))
            randomly_duplicated_beat_times = np.concatenate([self.tracks['beat_times'], random_beats])
            randomly_duplicated_beat_times.sort()
            randomly_duplicated_beat_times = [float(x) for x in randomly_duplicated_beat_times]
            for beat in randomly_duplicated_beat_times:
                note = {'_time': beat,
                        '_lineIndex':    int(np.random.choice(line_index)),
                        '_lineLayer':    int(np.random.choice(line_layer)),
                        '_type':         int(np.random.choice(types)),
                        '_cutDirection': int(np.random.choice(directions))}
                notes_list.append(note)

        notes_list = self.remove_bad_notes(notes_list)
        return notes_list

    # Hidden Markov Models Note Writing Functions
    def walk_to_data_frame(self, walk):
        """
        Function for turning a Markov walk sequence into a DataFrame of note placement predictions
        """
        sequence = []
        for step in walk:
            sequence.append(step.replace(", ", ",").split(","))
        constant = ['notes_type_0', 'notes_lineIndex_0', 'notes_lineLayer_0',
                    'notes_cutDirection_0', 'notes_type_1', 'notes_lineIndex_1',
                    'notes_lineLayer_1', 'notes_cutDirection_1', 'notes_type_3',
                    'notes_lineIndex_3', 'notes_lineLayer_3', 'notes_cutDirection_3']
        df = pd.DataFrame(sequence, columns=constant)
        return df

    def load_hmm_model(self, difficulty):
        # Load model
        with open(f"./models/HMM_{difficulty}_v{self.version}.pkl", 'rb') as m:
            MC = pickle.load(m)
            return MC

    def hmm_notes_writer(self, difficulty):
        """Writes a list of notes based on a Hidden Markov Model walk."""
        MC = load_hmm_model(difficulty)
        # Set note placement rate dependent on difficulty level
        counter = 2
        beats = []
        rate = None
        if difficulty == 'easy':
            rate = 3
        elif difficulty == 'normal':
            rate = 2
        else:
            rate = 1
        while counter <= len(self.tracks['beat_times']):
            beats.append(counter)
            counter += rate
        # Get HMM walk long enough to cover number of beats
        random_walk = MC.walk()
        while len(random_walk) < len(beats):
            random_walk = MC.walk()
        df_walk = self.walk_to_data_frame(random_walk)
        # Combine beat numbers with HMM walk steps
        df_preds = pd.concat([pd.DataFrame(beats, columns=['_time']), df_walk], axis=1, sort=True)
        df_preds.dropna(axis=0, inplace=True)
        # Write notes dictionaries
        return self.write_notes_hmm(df_preds)

    # Segmented HMM Note Writing Functions
    def laplacian_segmentation(self):
        """
        This function uses the Laplacian Segmentation method
        described in McFee and Ellis, 2014, and adapted from
        example code in the librosa documentation.
        It returns the segment boundaries (in frame number and time)
        and segment ID's of isolated music file segments.
        """
        BINS_PER_OCTAVE = 12 * 3
        N_OCTAVES = 7
        C = librosa.amplitude_to_db(np.abs(librosa.cqt(y=self.tracks['y'],
                                                       sr=self.tracks['sr'],
                                                       bins_per_octave=BINS_PER_OCTAVE,
                                                       n_bins=N_OCTAVES * BINS_PER_OCTAVE)), ref=np.max)
        tempo, beats = librosa.beat.beat_track(y=self.tracks['y'], sr=self.tracks['sr'], trim=False)
        Csync = librosa.util.sync(C, beats, aggregate=np.median)

        # For plotting purposes, we'll need the timing of the beats
        # We fix_frames to include non-beat frames 0 and C.shape[1] (final frame)
        beat_times = librosa.frames_to_time(librosa.util.fix_frames(beats, x_min=0, x_max=C.shape[1]), sr=self.tracks['sr'])

        R = librosa.segment.recurrence_matrix(Csync, width=3, mode='affinity', sym=True)
        # Enhance diagonals with a median filter (Equation 2)
        df = librosa.segment.timelag_filter(scipy.ndimage.median_filter)
        Rf = df(R, size=(1, 7))
        mfcc = librosa.feature.mfcc(y=self.tracks['y'], sr=self.tracks['sr'])
        Msync = librosa.util.sync(mfcc, beats)
        path_distance = np.sum(np.diff(Msync, axis=1)**2, axis=0)
        sigma = np.median(path_distance)
        path_sim = np.exp(-path_distance / sigma)
        R_path = np.diag(path_sim, k=1) + np.diag(path_sim, k=-1)
        deg_path = np.sum(R_path, axis=1)
        deg_rec = np.sum(Rf, axis=1)
        mu = deg_path.dot(deg_path + deg_rec) / np.sum((deg_path + deg_rec)**2)
        A = mu * Rf + (1 - mu) * R_path
        L = scipy.sparse.csgraph.laplacian(A, normed=True)
        # and its spectral decomposition
        evals, evecs = scipy.linalg.eigh(L)
        # We can clean this up further with a median filter.
        # This can help smooth over small discontinuities
        evecs = scipy.ndimage.median_filter(evecs, size=(9, 1))
        # cumulative normalization is needed for symmetric normalize laplacian eigenvectors
        Cnorm = np.cumsum(evecs**2, axis=1)**0.5
        # If we want k clusters, use the first k normalized eigenvectors.
        # Fun exercise: see how the segmentation changes as you vary k
        self.k = self.k
        X = evecs[:, :self.k] / Cnorm[:, self.k-1:self.k]
        KM = sklearn.cluster.KMeans(n_clusters=self.k)
        seg_ids = KM.fit_predict(X)
        bound_beats = 1 + np.flatnonzero(seg_ids[:-1] != seg_ids[1:])
        # Count beat 0 as a boundary
        bound_beats = librosa.util.fix_frames(bound_beats, x_min=0)
        # Compute the segment label for each boundary
        bound_segs = list(seg_ids[bound_beats])
        # Convert beat indices to frames
        bound_frames = beats[bound_beats]
        # Make sure we cover to the end of the track
        bound_frames = librosa.util.fix_frames(bound_frames, x_min=None, x_max=C.shape[1]-1)
        bound_times = librosa.frames_to_time(bound_frames)
        bound_times = [(x/60) * tempo for x in bound_times]
        beat_numbers = list(range(len(bound_frames)))
        bound_beats = np.append(bound_beats, list(range(len(beats)))[-1])
        segments = list(zip(zip(bound_times, bound_times[1:]), zip(bound_beats, bound_beats[1:]), bound_segs))

        return segments, beat_times, tempo

    def segments_to_data_frame(self, segments):
        """Helper function to translate a song semgmenation to a pandas DataFrame."""
        lengths = []
        for seg in segments:
            length = seg[1][1] - seg[1][0]
            lengths.append(length)
        df = pd.concat([pd.Series(lengths, name='length'), pd.Series([x[2] for x in segments], name='seg_no')], axis=1)
        return df

    def segment_predictions(self, segment_df, HMM_model):
        """
        This function predicts a Markov chain walk for each segment of a segmented music file.
        It will repeat a walk for segments that it has already mapped previously
        (truncating or extending as necessary).
        """
        preds = pd.DataFrame([])
        completed_segments = {}
        for index, row in segment_df.iterrows():
            if row['seg_no'] not in completed_segments.keys():
                def get_preds(init_state, obj):
                    pred = HMM_model.walk(init_state=tuple(preds.iloc[-5:, 0])) if init_state else HMM_model.walk()
                    while len(pred) < row['length']:
                        pred = HMM_model.walk(init_state=tuple(preds.iloc[-5:, 0])) if init_state else HMM_model.walk()
                    completed_segments.update(obj)
                    return pd.concat([preds, pd.Series(pred[0: row['length']])], axis=0, ignore_index=True)

                if index == 0:
                    preds = get_preds(False, {row['seg_no']: {'start': 0, 'end': len(pred)}})
                else:
                    try:
                        preds = get_preds(True, {row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}})
                    except Exception:
                        preds = get_preds(False, {row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}})

            else:
                if (row['length'] <= (completed_segments[row['seg_no']]['end'] - completed_segments[row['seg_no']]['start'])):
                    pred = preds.iloc[completed_segments[row['seg_no']]['start']: completed_segments[row['seg_no']]['start'] + row['length'], 0]
                    preds = pd.concat([preds, pred], axis=0, ignore_index=True)
                else:
                    def get_preds(extend, preds):
                        pred = preds.iloc[completed_segments[row['seg_no']]['start']: completed_segments[row['seg_no']]['end'], 0]
                        diff = row['length'] - len(pred)
                        pred = pd.concat([pred, pd.Series(extend[0: diff+1])], axis=0, ignore_index=True)
                        completed_segments.update({row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}})
                        return pd.concat([preds, pred], axis=0, ignore_index=True)
                    try:
                        extend = HMM_model.walk(init_state=tuple(preds.iloc[completed_segments[row['seg_no']]['end'] - 5: completed_segments[row['seg_no']]['end'], 0]))
                        preds = get_preds(extend, preds)
                    except Exception:
                        extend = HMM_model.walk()
                        preds = get_preds(extend, preds)

        preds_list = list(preds.iloc[:, 0])
        preds = self.walk_to_data_frame(preds_list)
        return preds

    def segmented_hmm_notes_writer(self, difficulty):
        """
        This function writes the list of notes based on the segmented HMM model.
        """
        MC = load_hmm_model(difficulty)
        (segments, beat_times, tempo) = self.laplacian_segmentation()
        segments_df = self.segments_to_data_frame(segments)
        preds = self.segment_predictions(segments_df, MC)
        # Combine beat numbers with HMM walk steps
        beats = [(x/60) * tempo for x in beat_times]
        df_preds = pd.concat([pd.DataFrame(beats, columns=['_time']), preds], axis=1, sort=True)
        df_preds.dropna(axis=0, inplace=True)
        # Write notes dictionaries
        return self.write_notes_hmm(df_preds)

    # Rate Modulated Segmented HMM Note Writing Functions
    def choose_rate(self, decibel, difficulty):
        """
        This function modulates the block placement rate by using the average amplitude
        (i.e., 'loudness') across beats to choose how many blocks per beat will be placed.
        Takes in the difficulty level and the amplitude and returns an
        integer in the set {0, 1, 2, 4, 8, 16}.
        If you are finding that your maps are too fast or too slow for you,
        you might want to play with the probabilities in this file.
        """
        decibel = np.abs(decibel)
        p = None

        def get_rate_level_from_decibel(decibel):
            if decibel > 70:
                return 4
            elif decibel <= 70 and decibel > 55:
                return 3
            elif decibel <= 55 and decibel > 45:
                return 2
            elif decibel <= 45 and decibel > 35:
                return 1
            else:
                return 0

        easy_probabilities = {0: [0.3, 0.6, 0.1, 0, 0, 0],
                              1: [0.4, 0.5, 0.1, 0, 0, 0],
                              2: [0.80, 0.2, 0, 0, 0, 0],
                              3: [0.90, 0.10, 0, 0, 0, 0],
                              4: [0.95, 0.05, 0, 0, 0, 0]}

        normal_probabilities = {0: [0.05, 0.7, 0.25, 0, 0, 0],
                                1: [0.2, 0.7, 0.1, 0, 0, 0],
                                2: [0.3, 0.7, 0, 0, 0, 0],
                                3: [0.5, 0.5, 0, 0, 0, 0],
                                4: [0.95, 0.05, 0, 0, 0, 0]}

        hard_probabilities = {0: [0.05, 0.35, 0.6, 0, 0, 0],
                              1: [0.1, 0.5, 0.4, 0, 0, 0],
                              2: [0.2, 0.6, 0.2, 0, 0, 0],
                              3: [0.5, 0.5, 0, 0, 0, 0],
                              4: [0.95, 0.05, 0, 0, 0, 0]}

        expert_probabilities = {0: [0.8, 0.2, 0, 0, 0, 0],
                                1: [0.2, 0.7, 0.1, 0, 0, 0],
                                2: [0.1, 0.4, 0.3, 0.2, 0, 0],
                                3: [0, 0.05, 0.6, 0.35, 0, 0],
                                4: [0, 0, 0.35, 0.65, 0, 0]}

        expertPlus_probabilities = {0: [0, 0, 0, 0.5, 0.3, 0.2],
                                    1: [0, 0.05, 0.1, 0.6, 0.25, 0],
                                    2: [0, 0.1, 0.6, 0.3, 0, 0],
                                    3: [0, 0.3, 0.6, 0.1, 0, 0],
                                    4: [0, 0.5, 0.4, 0.1, 0, 0]}

        difficulty_probabilities = {'easy':       easy_probabilities,
                                    'normal':     normal_probabilities,
                                    'hard':       hard_probabilities,
                                    'expert':     expert_probabilities,
                                    'expertplus': expertPlus_probabilities}

        p = difficulty_probabilities[difficulty.casefold()][get_rate_level_from_decibel(decibel)]

        return np.random.choice([0, 1, 2, 4, 8, 16], p=p)

    def amplitude_rate_modulation(self, difficulty):
        """
        This function uses the average amplitude (i.e., 'loudness')
        of a beat and the difficulty level to determine
        how many blocks will be placed within the beat.
        Returns a list of beat numbers.
        """
        # Make amplitude matrix
        D = np.abs(librosa.stft(self.tracks['y']))
        decibel = librosa.amplitude_to_db(D, ref=np.max)
        # Get beat frames and sync with amplitudes
        tempo, beat_frames = librosa.beat.beat_track(self.tracks['y'], self.tracks['sr'], trim=False)
        beat_decibel = pd.DataFrame(librosa.util.sync(decibel, beat_frames, aggregate=np.mean))
        # Mean amplitude per beat
        avg_beat_decibel = beat_decibel.mean()
        # Choose rates and smooth rate transitions
        rates = [0]
        counter = 1
        while counter < len(avg_beat_decibel)-1:
            rate = self.choose_rate(np.mean([avg_beat_decibel.iloc[counter-1], avg_beat_decibel.iloc[counter], avg_beat_decibel.iloc[counter+1]]), difficulty)
            diff = np.abs(rate - rates[-1])
            maxdiff = 4 if 'expert'.casefold() in difficulty.casefold() else 2
            while diff > maxdiff:
                rate = self.choose_rate(np.mean([avg_beat_decibel.iloc[counter-1], avg_beat_decibel.iloc[counter], avg_beat_decibel.iloc[counter+1]]), difficulty)
                diff = rates[-1] - rate
            if rate == 4 and rates[-1] == 4:
                rate = np.random.choice([0, 1, 2])
            rates.append(rate)
            counter += 1
        # Make list of beat numbers based on rates
        beat_num_list = []
        for ind, val in enumerate(rates):
            if val == 0:
                continue
            elif val == 1:
                beat_num_list.append(ind)
            else:
                num_list = [ind, ind+1]
                for x in range(1, val):
                    num_list.append(ind+(x/val))
                for y in num_list:
                    beat_num_list.append(y)
        beat_num_list = list(set(beat_num_list))
        beat_num_list.sort()
        return beat_num_list

    def segments_to_data_frame_rate_modulated(self, segments, difficulty):
        """
        This function returns a DataFrame of the number of blocks needed for each song segment.
        """
        expanded_beat_list = []
        for x in segments:
            for y in self.tracks[difficulty.casefold()]['modulated_beat_list']:
                if y > x[1][0] and y <= x[1][1]:
                    expanded_beat_list.append({'_time': y, 'segment': x[2]})
        df = pd.DataFrame([], columns=['length', 'seg_no'])
        counter = 0
        first = None
        last = None
        while counter < len(expanded_beat_list):
            if counter == 0:
                first = counter
                counter += 1
            elif expanded_beat_list[counter]['segment'] != expanded_beat_list[counter-1]['segment']:
                first = counter
                counter += 1
            elif expanded_beat_list[counter] == expanded_beat_list[-1]:
                length = len(expanded_beat_list[first: -1])
                df = df.append(pd.DataFrame({'length': length, 'seg_no': expanded_beat_list[-1]['segment']}, index=[0]))
                break
            elif expanded_beat_list[counter]['segment'] == expanded_beat_list[counter+1]['segment']:
                counter += 1
            elif expanded_beat_list[counter]['segment'] != expanded_beat_list[counter+1]['segment']:
                last = counter
                length = len(expanded_beat_list[first: last+1])
                df = df.append(pd.DataFrame({'length': length, 'seg_no': expanded_beat_list[counter]['segment']}, index=[0]))
                counter += 1
        return df

    def rate_modulated_segmented_hmm_notes_writer(self, difficulty):
        """
        Function to write the notes to a list after predicting with
        the rate modulated segmented HMM model.
        """
        MC = load_hmm_model(difficulty)
        (segments, beat_times, tempo) = self.laplacian_segmentation()
        self.tracks[difficulty.casefold()]['modulated_beat_list'] = (
            self.amplitude_rate_modulation(difficulty))
        segments_df = self.segments_to_data_frame_rate_modulated(segments, difficulty)
        preds = self.segment_predictions(segments_df, MC)
        # Combine beat numbers with HMM walk steps
        beat_times = [(x/60) * tempo for x in beat_times]
        beat_count = list(range(len(beat_times)))
        beats = pd.concat([pd.Series(beat_times, name='_time'),
                           pd.Series(beat_count, name='beat_count')],
                          axis=1)
        for index, value in beats.iterrows():
            if value['beat_count'] not in self.tracks[difficulty.casefold()]['modulated_beat_list']:
                beats.drop(index=index, inplace=True)
        leftDF = beats.astype('float64')
        rightDF = pd.Series(self.tracks[difficulty.casefold()]['modulated_beat_list'], name='beat_count').astype('float64')
        merged_beats = pd.merge(left=leftDF, right=rightDF, how='outer', on='beat_count', sort=True)
        merged_beats.interpolate(inplace=True)
        merged_beats.drop(columns='beat_count', inplace=True)

        df_preds = pd.concat([merged_beats, preds], axis=1, sort=True)
        df_preds.dropna(axis=0, inplace=True)
        # Write notes dictionaries
        return self.write_notes_hmm(df_preds)


if __name__ == '__main__':
    args = parseArgs()

    os.chdir(f"{args.workingDir}")

    testFile = open(f"{args.workingDir}/debug.log", 'w')
    testFile.write(f"Current working dir: {os.getcwd()}\n")
    testFile.write(f"Song path: {args.song_path}\n")
    testFile.write(f"Song name: {args.song_name}\n")
    testFile.write(f"Difficulty: {args.difficulty}\n")
    testFile.write(f"Model: {args.model}\n")
    testFile.write(f"K: {args.k}\n")
    testFile.write(f"Version: {args.version}\n")
    testFile.write(f"Environment: {args.environment}\n")
    testFile.write(f"Lighting Intensity: {args.lightsIntensity}\n")
    testFile.write(f"Album Directory: {args.albumDir}\n")
    testFile.write(f"Out Directory: {args.outDir}\n")
    testFile.write(f"Zip Files: {args.zipFiles}\n")
    testFile.write(f"\nArgs: {sys.argv}\n")
    testFile.close()

    # Main Class Init
    main = Main(args.song_path,
                args.song_name,
                args.difficulty,
                args.model,
                args.k,
                args.version,
                args.environment,
                args.lightsIntensity,
                args.albumDir,
                args.outDir,
                args.zipFiles)

    # Load song and get beat features
    _print
    _print(f"{main.song_name}")
    _print
    _print(f"\t{main.song_name} | Loading Song...")
    (main.tracks['bpm'],
     main.tracks['beat_times'],
     main.tracks['y'],
     main.tracks['sr']) = main.get_beat_features()
    _print(f"\t{main.song_name} | Song loaded...")

    # Write lists for note placement, event placement, and obstacle placement
    _print(f"\t{main.song_name} | Mapping...")
    if main.difficulty.casefold() == 'ALL'.casefold():
        for diff in ['easy', 'normal', 'hard', 'expert', 'expertplus']:
            main.tracks[diff.casefold()]['notes_list'] = main.run_model(diff.casefold())
            main.tracks[diff.casefold()]['events_list'] = main.events_writer(diff.casefold())
            main.tracks[diff.casefold()]['obstacles_list'] = main.obstacles_writer(diff.casefold())
    else:
        main.tracks[main.difficulty.casefold()]['notes_list'] = (
            main.run_model(main.difficulty.casefold()))
        main.tracks[main.difficulty.casefold()]['events_list'] = (
            main.events_writer(main.difficulty.casefold()))
        main.tracks[main.difficulty.casefold()]['obstacles_list'] = (
            main.obstacles_writer(main.difficulty.casefold()))
    _print(f"\t{main.song_name} | Mapping done!")

    # Write and zip files
    _print(f"\t{main.song_name} | Writing files to disk...")
    main.write_info_file()
    main.write_level_file()
    _print(f"\t{main.song_name} | Converting music file...")
    main.convert_music_file()
    _print(f"\t{main.song_name} | Zipping folder...")
    main.zip_writer()

    # Print finished message
    finishMessage = f"{main.song_name} | Finished! \n\tLook for "
    if (main.zipFiles):
        finishMessage += f"zipped folder in {main.outDir}, unzip the folder, "
    else:
        finishMessage += f"folder in {main.outDir}, "
    finishMessage += "place in the 'CustomMusic' folder in Beat Saber's files."
    _print()
    _print(finishMessage)
    _print()
