from __future__ import print_function
import os
import pickle
import shutil
import sys
import traceback
import warnings

from flask import Flask
from flask import jsonify, request
from gevent.pywsgi import WSGIServer
import audioread
import librosa
import markovify
import numpy as np
import pandas as pd
import scipy
from sklearn.cluster import KMeans
from sklearn.preprocessing import MinMaxScaler
from pydub import AudioSegment

warnings.filterwarnings(
    'ignore',
    "PySoundFile failed. Trying audioread instead.")


def _print(message=None):
    if message:
        sys.stdout.write(f"{message}\n")
        sys.stdout.flush()
    else:
        sys.stdout.write(
            '_________________________________________________________\n')
        sys.stdout.flush()


def _print_exception(exception=None, message=None, json_content=None):
    if exception and message and json_content:
        _print()
        _print(exception)
        _print(message)
        _print(json_content)
        _print()
    elif exception and message:
        _print()
        _print(exception)
        _print(message)
        _print()
    elif exception:
        _print()
        _print(exception)
        _print()


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

    validCutDirs = [cut_dirs.Up, cut_dirs.UpRight, cut_dirs.Right, cut_dirs.DownRight,
                    cut_dirs.Down, cut_dirs.DownLeft, cut_dirs.Left, cut_dirs.UpLeft, cut_dirs.Dot]
    validColumns = [line_indices.Col1, line_indices.Col2,
                    line_indices.Col3, line_indices.Col4]
    validRows = [line_layers.Bottom, line_layers.Middle, line_layers.Top]


def remove_bad_notes(notes_list, bpm):
    """Remove notes that come too early in the song"""
    cut_dirs = Notes().cut_dirs
    line_indices = Notes().line_indices
    line_layers = Notes().line_layers

    # Using the BPM we can covert from beats to seconds
    def seconds(number):
        return round(bpm / 60) * number

    # Only keep notes that come after the 2 seconds into the song
    notes_list = list(
        filter(lambda note: note['_time'] >= seconds(2), notes_list))

    def validateNotes(notes_list):
        validated_notes_list = []
        index = 0
        current_note = notes_list[index]

        def remove_zeros(number):
            while number % 10 == 0:
                number //= 10
            return number

        def makeLineIndexValid(note):
            if note['_lineIndex'] > line_indices.Col4:
                note['_lineIndex'] = remove_zeros(note['_lineIndex'])
            if note['_lineIndex'] in Notes().validColumns:
                return note
            return None

        def makeLineLayerValid(note):
            if note['_lineLayer'] > line_layers.Top:
                note['_lineLayer'] = remove_zeros(note['_lineLayer'])
            if note['_lineLayer'] in Notes().validRows:
                return note
            return None

        def makeCutDirectionValid(note):
            if note['_cutDirection'] > cut_dirs.Dot:
                note['_cutDirection'] = remove_zeros(note['_cutDirection'])
            if note['_cutDirection'] in Notes().validCutDirs:
                return note
            return None

        while current_note:
            try:
                current_note = makeLineIndexValid(current_note)
                if current_note is None:
                    index += 1
                    current_note = notes_list[index]
                    continue

                current_note = makeLineLayerValid(current_note)
                if current_note is None:
                    index += 1
                    current_note = notes_list[index]
                    continue

                current_note = makeCutDirectionValid(current_note)
                if current_note is None:
                    index += 1
                    current_note = notes_list[index]
                    continue

                validated_notes_list.append(current_note)
                index += 1
                current_note = notes_list[index]
            except KeyError:
                index += 1
                current_note = notes_list[index]
                continue
            except IndexError:
                break
        return validated_notes_list

    notes_list = validateNotes(notes_list)

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

    cardinalDirs = [cut_dirs.Up, cut_dirs.Right,
                    cut_dirs.Down, cut_dirs.Left]
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
    layerInwards = {line_layers.Top: [
        cut_dirs.DownRight, cut_dirs.Down, cut_dirs.DownLeft]}
    # Columns 1 and 4 can't have cuts inward
    indexInwards = {line_indices.Col1: [cut_dirs.UpRight, cut_dirs.Right, cut_dirs.DownRight],
                    line_indices.Col4: [cut_dirs.DownLeft, cut_dirs.Left, cut_dirs.UpLeft]}

    lastNote = notes_list[0] if notes_list else None

    for i in range(1, len(notes_list)):
        try:
            if notes_list[i]['_cutDirection'] != cut_dirs.Dot and notes_list[i]['_type'] != 3 and lastNote['_time'] - notes_list[i]['_time'] < seconds(1.5):
                try:
                    if (lastNote['_cutDirection'] != cut_dirs.Dot and notes_list[i]['_cutDirection'] != oppositeCutDir[lastNote['_cutDirection']] and
                            notes_list[i]['_type'] == lastNote['_type']):
                        notes_list[i]['_cutDirection'] = int(
                            oppositeCutDir[lastNote['_cutDirection']])

                except Exception:
                    _print_exception(traceback.format_exc(),
                                     f"1.1 Note Validation Error for Note: {i}")
                try:
                    if (notes_list[i]['_lineIndex'] not in oppositeIndices[lastNote['_lineIndex']] and
                            notes_list[i]['_lineLayer'] not in oppositeLayers[lastNote['_lineLayer']] and
                            notes_list[i]['_type'] != lastNote['_type']):

                        if int(np.random.choice([0, 1])):
                            notes_list[i]['_lineIndex'] = int(np.random.choice(
                                oppositeIndices[lastNote['_lineIndex']]))
                        else:
                            notes_list[i]['_lineLayer'] = int(
                                np.random.choice(oppositeLayers[lastNote['_lineLayer']]))

                except Exception:
                    _print_exception(traceback.format_exc(),
                                     f"1.2 Note Validation Error for Note: {i}")

                try:
                    if notes_list[i]['_time'] == lastNote['_time']:

                        if notes_list[i]['_type'] == lastNote['_type']:
                            notes_list = notes_list.pop(i)

                        else:

                            if notes_list[i]['_lineIndex'] == lastNote['_lineIndex']:
                                if notes_list[i]['_lineIndex'] in [line_indices.Col2, line_indices.Col3]:
                                    notes_list[i]['_cutDirection'] = cut_dirs.Dot
                                    notes_list[i -
                                               1]['_cutDirection'] = cut_dirs.Dot

                                elif notes_list[i]['_lineIndex'] == line_indices.Col1:
                                    notes_list[i]['_cutDirection'] = cut_dirs.Left
                                    notes_list[i -
                                               1]['_cutDirection'] = cut_dirs.Left
                                    if notes_list[i]['_type'] == 0 and notes_list[i]['_lineLayer'] < lastNote['_lineLayer']:
                                        notes_list[i-1]['_lineLayer'] = notes_list[i]['_lineLayer']
                                        notes_list[i]['_lineLayer'] = lastNote['_lineLayer']

                                elif notes_list[i]['_lineIndex'] == line_indices.Col4:
                                    notes_list[i]['_cutDirection'] = cut_dirs.Right
                                    notes_list[i -
                                               1]['_cutDirection'] = cut_dirs.Right
                                    if notes_list[i]['_type'] == 0 and notes_list[i]['_lineLayer'] > lastNote['_lineLayer']:
                                        notes_list[i-1]['_lineLayer'] = notes_list[i]['_lineLayer']
                                        notes_list[i]['_lineLayer'] = lastNote['_lineLayer']

                            elif notes_list[i]['_lineLayer'] == lastNote['_lineLayer']:

                                if notes_list[i]['_lineLayer'] == line_layers.Bottom:
                                    notes_list[i]['_cutDirection'] = cut_dirs.Down
                                    notes_list[i -
                                               1]['_cutDirection'] = cut_dirs.Down

                                elif notes_list[i]['_lineLayer'] == line_layers.Middle:
                                    choice = int(np.random.choice([0, 1]))
                                    notes_list[i]['_cutDirection'] = cut_dirs.Down
                                    notes_list[i -
                                               1]['_cutDirection'] = cut_dirs.Down

                                elif notes_list[i]['_lineLayer'] == line_layers.Top:
                                    notes_list[i]['_cutDirection'] = cut_dirs.Up
                                    notes_list[i -
                                               1]['_cutDirection'] = cut_dirs.Up

                except Exception:
                    _print_exception(traceback.format_exc(),
                                     f"1.3 Note Validation Error for Note: {i}")

                try:
                    if (notes_list[i]['_lineLayer'] == line_layers.Top and notes_list[i]['_lineIndex'] in [line_indices.Col2, line_indices.Col3]
                            and lastNote['_cutDirection'] != cut_dirs.Up):
                        notes_list[i]['_cutDirection'] = cut_dirs.Up

                    elif (notes_list[i]['_lineLayer'] == line_layers.Top and notes_list[i]['_lineIndex'] == line_indices.Col1
                            and lastNote['_cutDirection'] != cut_dirs.UpLeft):
                        notes_list[i]['_cutDirection'] = cut_dirs.UpLeft

                    elif (notes_list[i]['_lineLayer'] == line_layers.Top and notes_list[i]['_lineIndex'] == line_indices.Col2
                            and lastNote['_cutDirection'] != cut_dirs.UpRight):
                        notes_list[i]['_cutDirection'] = cut_dirs.UpRight

                    elif (notes_list[i]['_lineIndex'] == line_indices.Col1
                            and lastNote['_cutDirection'] != cut_dirs.Left):
                        notes_list[i]['_cutDirection'] = cut_dirs.Left

                    elif (notes_list[i]['_lineIndex'] == line_indices.Col4
                            and lastNote['_cutDirection'] != cut_dirs.Right):
                        notes_list[i]['_cutDirection'] = cut_dirs.Right

                except Exception:
                    _print_exception(traceback.format_exc(),
                                     f"1.4 Note Validation Error for Note: {i}")

            lastNote = notes_list[i]

        except Exception:
            _print_exception(traceback.format_exc(),
                             f"1.0 Note Validation Error for Note: {i}")

    return notes_list


def write_notes_hmm(df_preds, bpm):
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
    return remove_bad_notes(notes_list, bpm)


# Random Mapping Note Writer
def random_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr):
    """
    This function randomly places blocks at approximately each beat
    or every other beat depending on the difficulty.
    """
    notes_list = []
    line_index = [0, 1, 2, 3]
    line_layer = [0, 1, 2]
    types = [0, 1, 3]
    directions = list(range(0, 8))
    beat_times = [
        x * (bpm / 60) for x in beat_times]

    if difficulty.casefold() == 'easy' or difficulty.casefold() == 'normal':
        for beat in beat_times:
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
        random_beats = np.random.choice(beat_times, np.random.choice(
            range(len(beat_times))))
        randomly_duplicated_beat_times = np.concatenate(
            [beat_times, random_beats])
        randomly_duplicated_beat_times.sort()
        randomly_duplicated_beat_times = [
            float(x) for x in randomly_duplicated_beat_times]
        for beat in randomly_duplicated_beat_times:
            note = {'_time': beat,
                    '_lineIndex':    int(np.random.choice(line_index)),
                    '_lineLayer':    int(np.random.choice(line_layer)),
                    '_type':         int(np.random.choice(types)),
                    '_cutDirection': int(np.random.choice(directions))}
            notes_list.append(note)

    notes_list = remove_bad_notes(notes_list, bpm)
    return notes_list


# Hidden Markov Models Note Writing Functions
def walk_to_data_frame(walk):
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


def load_hmm_model(tempDir, difficulty, version):
    # Load model
    with open(f"{tempDir}/models/HMM_{difficulty}_v{version}.pkl", 'rb') as m:
        MC = pickle.load(m)
        return MC


def hmm_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr):
    """Writes a list of notes based on a Hidden Markov Model walk."""
    MC = load_hmm_model(tempDir, difficulty, version)
    # Set note placement rate dependent on difficulty level
    counter = 2
    beats = []
    rate = None
    if difficulty.casefold() == 'easy':
        rate = 3
    elif difficulty.casefold() == 'normal':
        rate = 2
    else:
        rate = 1
    while counter <= len(beat_times):
        beats.append(counter)
        counter += rate
    # Get HMM walk long enough to cover number of beats
    random_walk = MC.walk()
    while len(random_walk) < len(beats):
        random_walk = MC.walk()
    df_walk = walk_to_data_frame(random_walk)
    # Combine beat numbers with HMM walk steps
    df_preds = pd.concat(
        [pd.DataFrame(beats, columns=['_time']), df_walk], axis=1, sort=True)
    df_preds.dropna(axis=0, inplace=True)
    # Write notes dictionaries
    return write_notes_hmm(df_preds, bpm)


# Segmented HMM Note Writing Functions
def laplacian_segmentation(y, sr):
    """
    This function uses the Laplacian Segmentation method
    described in McFee and Ellis, 2014, and adapted from
    example code in the librosa documentation.
    It returns the segment boundaries (in frame number and time)
    and segment ID's of isolated music file segments.
    """
    BINS_PER_OCTAVE = 12 * 3
    N_OCTAVES = 7
    C = librosa.amplitude_to_db(np.abs(librosa.cqt(y=np.array(y),
                                                   sr=sr,
                                                   bins_per_octave=BINS_PER_OCTAVE,
                                                   n_bins=N_OCTAVES * BINS_PER_OCTAVE)), ref=np.max)
    tempo, beats = librosa.beat.beat_track(
        y=np.array(y), sr=sr, trim=False)
    Csync = librosa.util.sync(C, beats, aggregate=np.median)

    # For plotting purposes, we'll need the timing of the beats
    # We fix_frames to include non-beat frames 0 and C.shape[1] (final frame)
    beat_times = librosa.frames_to_time(librosa.util.fix_frames(
        beats, x_min=0, x_max=C.shape[1]), sr=sr)

    R = librosa.segment.recurrence_matrix(
        Csync, width=3, mode='affinity', sym=True)
    # Enhance diagonals with a median filter (Equation 2)
    df = librosa.segment.timelag_filter(scipy.ndimage.median_filter)
    Rf = df(R, size=(1, 7))
    mfcc = librosa.feature.mfcc(y=np.array(y), sr=sr)
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

    # estimate k, set = 5 by default
    k_estimate = 5

    def estimate_segments():
        mms = MinMaxScaler()
        melspec = librosa.feature.melspectrogram(
            y=np.array(y), sr=sr)
        mms.fit(librosa.power_to_db(melspec, ref=np.max))
        data_transformed = mms.transform(
            librosa.power_to_db(melspec, ref=np.max))

        sum_of_squared_distances = []
        K = range(1, 12)
        for k in K:
            km = KMeans(n_clusters=k)
            km = km.fit(data_transformed)
            sum_of_squared_distances.append(km.inertia_)
        delta_sum_of_squared_distances = np.diff(sum_of_squared_distances)

        def f_delta(x):
            return sum_of_squared_distances[x] - delta_sum_of_squared_distances[x]
        try:
            for i in range(1, len(delta_sum_of_squared_distances) - 1):
                if (f_delta(i-1) - f_delta(i)) < (f_delta(i) - f_delta(i+1)):
                    return i
                    break
        except Exception:
            _print_exception(traceback.format_exc(),
                             "Segmentation estimation error in song")
            return 5

    k_estimate = estimate_segments()
    if k_estimate is None or k_estimate < 2 or k_estimate > 9:
        k_estimate = 5

    # If we want k clusters, use the first k normalized eigenvectors.
    X = evecs[:, :k_estimate] / Cnorm[:, k_estimate-1:k_estimate]
    KM = KMeans(n_clusters=k_estimate)
    seg_ids = KM.fit_predict(X)
    bound_beats = 1 + np.flatnonzero(seg_ids[:-1] != seg_ids[1:])
    # Count beat 0 as a boundary
    bound_beats = librosa.util.fix_frames(bound_beats, x_min=0)
    # Compute the segment label for each boundary
    bound_segs = list(seg_ids[bound_beats])
    # Convert beat indices to frames
    bound_frames = beats[bound_beats]
    # Make sure we cover to the end of the track
    bound_frames = librosa.util.fix_frames(
        bound_frames, x_min=None, x_max=C.shape[1]-1)
    bound_times = librosa.frames_to_time(bound_frames)
    bound_times = [(x/60) * tempo for x in bound_times]
    beat_numbers = list(range(len(bound_frames)))
    bound_beats = np.append(bound_beats, list(range(len(beats)))[-1])
    segments = list(zip(zip(bound_times, bound_times[1:]), zip(
        bound_beats, bound_beats[1:]), bound_segs))

    return segments, beat_times, tempo


def segments_to_data_frame(segments):
    """Helper function to translate a song semgmenation to a pandas DataFrame."""
    lengths = []
    for seg in segments:
        length = seg[1][1] - seg[1][0]
        lengths.append(length)
    df = pd.concat([pd.Series(lengths, name='length'), pd.Series(
        [x[2] for x in segments], name='seg_no')], axis=1)
    return df


def segment_predictions(segment_df, HMM_model):
    """
    This function predicts a Markov chain walk for each segment of a segmented music file.
    It will repeat a walk for segments that it has already mapped previously
    (truncating or extending as necessary).
    """
    preds = pd.DataFrame([])
    completed_segments = {}
    for index, row in segment_df.iterrows():
        if row['seg_no'] not in completed_segments.keys():
            def get_preds(init_state, index):
                pred = HMM_model.walk(init_state=tuple(
                    preds.iloc[-5:, 0])) if init_state else HMM_model.walk()
                while len(pred) < row['length']:
                    pred = HMM_model.walk(init_state=tuple(
                        preds.iloc[-5:, 0])) if init_state else HMM_model.walk()
                obj = {0: {row['seg_no']: {'start': 0, 'end': len(pred)}},
                       1: {row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}}}
                completed_segments.update(obj[index])
                return pd.concat([preds, pd.Series(pred[0: row['length']])], axis=0, ignore_index=True)

            if index == 0:
                preds = get_preds(False, 0)
            else:
                try:
                    preds = get_preds(True, 1)
                except Exception:
                    preds = get_preds(False, 1)

        else:
            if (row['length'] <= (completed_segments[row['seg_no']]['end'] - completed_segments[row['seg_no']]['start'])):
                pred = preds.iloc[
                    completed_segments[row['seg_no']]['start']: completed_segments[row['seg_no']]['start'] + row['length'],
                    0]
                preds = pd.concat([preds, pred], axis=0, ignore_index=True)
            else:
                def get_preds(extend, preds):
                    pred = preds.iloc[completed_segments[row['seg_no']]
                                      ['start']: completed_segments[row['seg_no']]['end'], 0]
                    diff = row['length'] - len(pred)
                    pred = pd.concat(
                        [pred, pd.Series(extend[0: diff+1])], axis=0, ignore_index=True)
                    completed_segments.update(
                        {row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}})
                    return pd.concat([preds, pred], axis=0, ignore_index=True)
                try:
                    extend = HMM_model.walk(init_state=tuple(
                        preds.iloc[completed_segments[row['seg_no']]['end'] - 5: completed_segments[row['seg_no']]['end'], 0]))
                    preds = get_preds(extend, preds)
                except Exception:
                    extend = HMM_model.walk()
                    preds = get_preds(extend, preds)

    preds_list = list(preds.iloc[:, 0])
    preds = walk_to_data_frame(preds_list)
    return preds


def segmented_hmm_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr):
    """
    This function writes the list of notes based on the segmented HMM model.
    """
    MC = load_hmm_model(tempDir, difficulty, version)
    (segments, beat_times, tempo) = laplacian_segmentation(y, sr)
    segments_df = segments_to_data_frame(segments)
    preds = segment_predictions(segments_df, MC)
    # Combine beat numbers with HMM walk steps
    beats = [(x/60) * tempo for x in beat_times]
    df_preds = pd.concat(
        [pd.DataFrame(beats, columns=['_time']), preds], axis=1, sort=True)
    df_preds.dropna(axis=0, inplace=True)
    # Write notes dictionaries
    return write_notes_hmm(df_preds, bpm)


# Rate Modulated Segmented HMM Note Writing Functions
def choose_rate(decibel, difficulty):
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

    p = difficulty_probabilities[difficulty.casefold(
    )][get_rate_level_from_decibel(decibel)]

    return np.random.choice([0, 1, 2, 4, 8, 16], p=p)


def amplitude_rate_modulation(difficulty, y, sr):
    """
    This function uses the average amplitude (i.e., 'loudness')
    of a beat and the difficulty level to determine
    how many blocks will be placed within the beat.
    Returns a list of beat numbers.
    """
    # Make amplitude matrix
    D = np.abs(librosa.stft(np.array(y)))
    decibel = librosa.amplitude_to_db(D, ref=np.max)
    # Get beat frames and sync with amplitudes
    tempo, beat_frames = librosa.beat.beat_track(
        np.array(y), sr, trim=False)
    beat_decibel = pd.DataFrame(librosa.util.sync(
        decibel, beat_frames, aggregate=np.mean))
    # Mean amplitude per beat
    avg_beat_decibel = beat_decibel.mean()
    # Choose rates and smooth rate transitions
    rates = [0]
    counter = 1
    while counter < len(avg_beat_decibel)-1:
        rate = choose_rate(np.mean(
            [avg_beat_decibel.iloc[counter-1], avg_beat_decibel.iloc[counter], avg_beat_decibel.iloc[counter+1]]), difficulty)
        diff = np.abs(rate - rates[-1])

        if difficulty.casefold() == 'expert':
            maxdiff = 4
        elif difficulty.casefold() == 'expertplus':
            maxdiff = 8
        else:
            maxdiff = 2

        while diff > maxdiff:
            rate = choose_rate(np.mean(
                [avg_beat_decibel.iloc[counter-1], avg_beat_decibel.iloc[counter], avg_beat_decibel.iloc[counter+1]]), difficulty)
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


def segments_to_data_frame_rate_modulated(segments, modulated_beat_list):
    """
    This function returns a DataFrame of the number of blocks needed for each song segment.
    """
    expanded_beat_list = []
    for x in segments:
        for y in modulated_beat_list:
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
            df = df.append(pd.DataFrame(
                {'length': length, 'seg_no': expanded_beat_list[-1]['segment']}, index=[0]))
            break
        elif expanded_beat_list[counter]['segment'] == expanded_beat_list[counter+1]['segment']:
            counter += 1
        elif expanded_beat_list[counter]['segment'] != expanded_beat_list[counter+1]['segment']:
            last = counter
            length = len(expanded_beat_list[first: last+1])
            df = df.append(pd.DataFrame(
                {'length': length, 'seg_no': expanded_beat_list[counter]['segment']}, index=[0]))
            counter += 1
    return df


def rate_modulated_segmented_hmm_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr):
    """
    Function to write the notes to a list after predicting with
    the rate modulated segmented HMM model.
    """
    MC = load_hmm_model(tempDir, difficulty, version)
    (segments, beat_times, tempo) = laplacian_segmentation(y, sr)
    modulated_beat_list = amplitude_rate_modulation(difficulty, y, sr)
    segments_df = segments_to_data_frame_rate_modulated(
        segments, modulated_beat_list)
    preds = segment_predictions(segments_df, MC)
    # Combine beat numbers with HMM walk steps
    beat_times = [(x/60) * tempo for x in beat_times]
    beat_count = list(range(len(beat_times)))
    beats = pd.concat([pd.Series(beat_times, name='_time'),
                       pd.Series(beat_count, name='beat_count')],
                      axis=1)
    for index, value in beats.iterrows():
        if value['beat_count'] not in modulated_beat_list:
            beats.drop(index=index, inplace=True)
    leftDF = beats.astype('float64')
    rightDF = pd.Series(modulated_beat_list,
                        name='beat_count').astype('float64')
    merged_beats = pd.merge(
        left=leftDF, right=rightDF, how='outer', on='beat_count', sort=True)
    merged_beats.interpolate(inplace=True)
    merged_beats.drop(columns='beat_count', inplace=True)

    df_preds = pd.concat([merged_beats, preds], axis=1, sort=True)
    df_preds.dropna(axis=0, inplace=True)
    # Write notes dictionaries
    return write_notes_hmm(df_preds, bpm)


app = Flask(__name__)
http_server = None


@app.route('/ping', methods=['GET'])
def ping():
    return 'OK', 200


@app.route('/close', methods=['GET'])
def close():
    if http_server is not None:
        http_server.close()
    return 'OK', 200


@app.route('/get_beat_features', methods=['POST'])
def get_beat_features():
    """Takes in the song stored at 'song_path' and estimates the bpm and beat times."""
    data = request.get_json()
    song_path = data['song_path']
    if song_path is not None:
        # Load song and split into harmonic and percussive parts.
        y, sr = librosa.load(song_path)
        # y_harmonic, y_percussive = librosa.effects.hpss(y)
        # Isolate beats and beat times
        bpm, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        return jsonify(data={
            'bpm': bpm,
            'beat_times': beat_times.tolist(),
            'y': y.tolist(),
            'sr': sr
        })
    return 'ERROR', 500


@app.route('/run_model', methods=['POST'])
def run_model():
    """Refractored model runner to allow for only a single mapping function"""
    data = request.get_json()
    model = data['model']
    difficulty = data['difficulty']
    beat_times = data['beat_times']
    bpm = data['bpm']
    version = data['version']
    y = data['y']
    sr = data['sr']
    tempDir = data['tempDir']
    if model == 'random':
        """
        Function to generate a completely random map (i.e. baseline model) for a song.
        This is completely random and is likely not enjoyable if even playable!
        """
        return jsonify(data=random_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr))
    elif model == 'HMM':
        """
        This function generates a custom map based on a Hidden Markov Model.
        """
        return jsonify(data=hmm_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr))
    elif model == 'segmented_HMM':
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
        return jsonify(data=segmented_hmm_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr))
    elif model == 'rate_modulated_segmented_HMM':
        """
        This function generates the files for a custom map using a
        rate modulated segmented HMM model.
        """
        return jsonify(data=rate_modulated_segmented_hmm_notes_writer(tempDir, difficulty, beat_times, bpm, version, y, sr))
    return 'ERROR', 500


@app.route('/convert_music_file', methods=['POST'])
def convert_music_file():
    """Converts audio file from supported type to EGG"""
    data = request.get_json()
    song_path = data['song_path']
    workingDir = data['workingDir']
    song_ext = os.path.splitext(song_path)[1][1:]
    try:
        AudioSegment.from_file(song_path, format=song_ext).export(
            f"{workingDir}/song.egg", format='ogg')
        return 'OK', 200
    except Exception:
        _print_exception(traceback.format_exc())
        return 'ERROR', 500


if __name__ == "__main__":
    app.run(port=5000)
    # http_server = WSGIServer(('127.0.0.1', 5000), app)
    # http_server.serve_forever()
