from __future__ import print_function
import numpy as np
import pandas as pd
import librosa
import json
import pickle
from io import BytesIO, TextIOWrapper, StringIO
from zipfile import ZipFile
import os
import soundfile as sf
import audioread
from pydub import AudioSegment
import markovify
import sklearn.cluster
import scipy
import sys
import argparse
import shutil

"""
Class to load a music file and generate a custom Beat Saber map based on the specified model and difficulty. Outputs a zipped folder of necessary files to play the custom map in the Beat Saber game.
    
***
song_path = string file path to music file location
    
song_name = string to name level as it will appear in the game
    
difficulty = desired difficulty level, can be: 'easy', 'normal', 'hard', 'expert', 'expertplus', or 'all'
    
model = desired model to use for map generation, can be: 'random', 'HMM', 'segmented_HMM', or 'rate_modulated_segmented_HMM'
    
k = number of song segments if using a segmented model. Default is 5, may want to increase or decrease based on song complexity
   
version = for HMM models, can choose either 1 or 2. 1 was trained on a smaller, but potentially higher quality dataset (custom maps with over 90% rating on beatsaver.com), while 2 was trained on a larger dataset of custom maps with over 70% rating, so it may have a larger pool of "potential moves."
    
outDir = the directory to put the output zip file in
***
"""
class Main:
    def __init__(self, song_path, song_name, difficulty, model, k, version, outDir, zipFiles):
        self.song_path = song_path
        if song_name is None:
            song_name = self.getSongNameFromMetadata()
        self.song_name = song_name
        self.difficulty = difficulty
        self.model = model
        if k is None:
            k = 5
        self.k = k
        if version is None:
            version = 2
        self.version = version
        self.outDir = outDir
        self.zipFiles = zipFiles
        self.workingDir = f"{self.outDir}/{self.song_name}"
        if not os.path.exists(self.workingDir):
            os.makedirs(self.workingDir)
        self.tracks = {
                    'bpm': 0,
                    'beat_times': [],
                    'y': 0,
                    'sr': 0,
                    'easy': {
                        'events_list': [],
                        'notes_list': [],
                        'obstacles_list': [],
                        'modulated_beat_list': []
                    },
                    'normal': {
                        'events_list': [],
                        'notes_list': [],
                        'obstacles_list': [],
                        'modulated_beat_list': []
                    },
                    'hard': {
                        'events_list': [],
                        'notes_list': [],
                        'obstacles_list': [],
                        'modulated_beat_list': []
                    },
                    'expert': {
                        'events_list': [],
                        'notes_list': [],
                        'obstacles_list': [],
                        'modulated_beat_list': []
                    },
                    'expertplus': {
                        'events_list': [],
                        'notes_list': [],
                        'obstacles_list': [],
                        'modulated_beat_list': []
                    }
                }

    def getListOfFilesInDirectory(self, path):
        # Create a list of file and sub directories 
        # Names in the given directory 
        listOfFile = os.listdir(path)
        allFiles = list()
        # Iterate over all the entries
        for entry in listOfFile:
            # Create full path
            fullPath = os.path.join(path, entry)
            # If entry is a directory then get the list of files in this directory 
            if os.path.isdir(fullPath):
                allFiles = allFiles + self.getListOfFilesInDirectory(fullPath)
            else:
                allFiles.append(fullPath)
        return allFiles

    def getListOfMusicFiles(self, path):
        # Get the list of all files in directory tree at given path
        listOfFiles = self.getListOfFilesInDirectory(path)
        listOfMusicFiles = []
    
        # Print the files
        for file in listOfFiles:
            if file.endswith(".mp3"):
                listOfMusicFiles.append(file)
        return listOfMusicFiles

    def getSongNameFromMetadata(self):
        song_name = 'default'
        audiofile = eyed3.load(self.song_path)
        artist = audiofile.tag.artist
        track = audiofile.tag.title
        if artist is not None and track is not None:
            song_name = track + ' - ' + artist
        elif track is not None:
            song_name = track
        elif artist is not None:
            song_name = artist   
        invalidchars = [ "<", ">", ":", '"', "/", "\\", "|", "?", "*" ]
        if any(char in song_name for char in invalidchars):
            for char in invalidchars:
                song_name.replace(char, "^") 
        return song_name

    def writeInfoFile(self):
        """This function creates the 'info.dat' file that needs to be included in the custom folder."""
        difficulty_beatmaps_array = []
    
        easy_beatmaps_df = { 
        '_difficulty': 'Easy', '_difficultyRank': 1, '_beatmapFilename': "easy.dat", '_noteJumpMovementSpeed': 8, '_noteJumpStartBeatOffset': 0, '_customData': {} 
        }
        normal_beatmaps_df = { 
        '_difficulty': 'Normal', '_difficultyRank': 3, '_beatmapFilename': "normal.dat", '_noteJumpMovementSpeed': 10, '_noteJumpStartBeatOffset': 0, '_customData': {} 
        }
        hard_beatmaps_df = {
        '_difficulty': 'Hard', '_difficultyRank': 5, '_beatmapFilename': "hard.dat", '_noteJumpMovementSpeed': 12, '_noteJumpStartBeatOffset': 0, '_customData': {}
        }
        expert_beatmaps_df = {
        '_difficulty': 'Expert', '_difficultyRank': 7, '_beatmapFilename': "expert.dat", '_noteJumpMovementSpeed': 14, '_noteJumpStartBeatOffset': 0, '_customData': {}
        }
        expertplus_beatmaps_df = {
        '_difficulty': 'ExpertPlus', '_difficultyRank': 9, '_beatmapFilename': "expertplus.dat", '_noteJumpMovementSpeed': 16, '_noteJumpStartBeatOffset': 0, '_customData': {}
        }

        if self.difficulty.casefold() == 'easy'.casefold():
            difficulty_beatmaps_array = [
            easy_beatmaps_df
            ]
        elif self.difficulty.casefold() == 'normal'.casefold():
            difficulty_beatmaps_array = [
            normal_beatmaps_df
            ]
        elif self.difficulty.casefold() == 'hard'.casefold():
            difficulty_beatmaps_array = [
            hard_beatmaps_df
            ]
        elif self.difficulty.casefold() == 'expert'.casefold():
            difficulty_beatmaps_array = [
            expert_beatmaps_df
            ]
        elif self.difficulty.casefold() == 'expertplus'.casefold():
            difficulty_beatmaps_array = [
            expertplus_beatmaps_df
            ]
        elif self.difficulty.casefold() == 'all'.casefold():
            difficulty_beatmaps_array = [
            easy_beatmaps_df,
            normal_beatmaps_df,
            hard_beatmaps_df,
            expert_beatmaps_df,
            expertplus_beatmaps_df
            ]

        info = {'_version': '2.0.0',
            '_songName': f"{self.song_name}",
            '_songSubName': '',
            '_songAuthorName': '',
            '_levelAuthorName': 'BeatMapSynth',
            '_beatsPerMinute': round(self.tracks['bpm']),
            '_songTimeOffset': 0,
            '_shuffle': 0,
            '_shufflePeriod': 0,
            '_previewStartTime': 10,
            '_previewDuration': 30,
            '_songFilename': 'song.egg',
            '_coverImageFilename': 'cover.jpg',
            '_environmentName': 'DefaultEnvironment',
            '_customData': {},
             '_difficultyBeatmapSets': [{'_beatmapCharacteristicName': 'Standard',
                                         '_difficultyBeatmaps': difficulty_beatmaps_array}]}

        with open(f"{self.workingDir}/info.dat", 'w') as f:
            json.dump(info, f)

    def writeLevelFile(self):
        """This function creates the 'level.dat' file that contains all the data for that paticular difficulty level"""
        if self.difficulty.casefold() == 'ALL'.casefold():
            for diff in [ 'easy', 'normal', 'hard', 'expert', 'expertplus' ]:
                level = {
                 '_version': '2.0.0',
                 '_customData': {'_time': '', #not sure what time refers to 
                                 '_BPMChanges': [], 
                                 '_bookmarks': []},
                 '_events': self.tracks[diff.casefold()]['events_list'],
                 '_notes': self.tracks[diff.casefold()]['notes_list'],
                 '_obstacles': self.tracks[diff.casefold()]['obstacles_list'] }
                with open(f"{self.workingDir}/{diff}.dat", 'w') as f:
                    json.dump(level, f)
        else:
            level = {
                 '_version': '2.0.0',
                 '_customData': {'_time': '', #not sure what time refers to 
                                 '_BPMChanges': [], 
                                 '_bookmarks': []},
                 '_events': self.tracks[self.difficulty.casefold()]['events_list'],
                 '_notes': self.tracks[self.difficulty.casefold()]['notes_list'],
                 '_obstacles': self.tracks[self.difficulty.casefold()]['obstacles_list'] }
            with open(f"{self.workingDir}/{self.difficulty}.dat", 'w') as f:
                json.dump(level, f)

    def convertMusicFile(self):
        """This function makes sure the file type of the provided song will be converted to the music file type that 
        Beat Saber accepts"""
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
            print("Unsupported song file type. Choose a file of type .mp3, .wav, .flv, .raw, or .ogg.")

    def eventsWriter(self, difficulty):
        """Placeholder function for writing a list of events to be incorporated into a beatmap file. May have future support."""
        if self.model == 'rate_modulated_segmented_HMM':
            # Use self.tracks[diff.casefold()]['modulated_beat_list']
            events_list = []
            return events_list
        else:
            events_list = []
            return events_list

    def obstaclesWriter(self, difficulty):
        """Placeholder function for writing a list of obstacles to be incorporated into a beatmap file."""
        if self.model == 'rate_modulated_segmented_HMM':
            # Use self.tracks[diff.casefold()]['modulated_beat_list']
            obstacles_list = []
            return obstacles_list
        else:
            obstacles_list = []
            return obstacles_list

    def zipWriter(self):
        "This function exports the zip folder containing the info.dat, difficulty.dat, cover.jpg, and song.egg files."
        shutil.copy('cover.jpg', f"{self.workingDir}")
        if self.zipFiles:
            files = [ f"{self.workingDir}/info.dat", f"{self.workingDir}/cover.jpg", f"{self.workingDir}/song.egg" ]
            if self.difficulty.casefold() == 'ALL'.casefold():
                for diff in [ 'easy', 'normal', 'hard', 'expert', 'expertplus' ]:
                    files.append(f"{self.workingDir}/{diff}.dat")
            else:
                files.append(f"{self.workingDir}/{self.difficulty}.dat")
            with ZipFile(f"{self.outDir}/{self.song_name}.zip", 'w') as custom:
                for file in files:
                    custom.write(file, arcname=os.path.basename(file))
            for file in files:
                os.remove(file)
            os.rmdir(self.workingDir)

    def getBeatFeatures(self):
        """This function takes in the song stored at 'song_path' and estimates the bpm and beat times."""
        #Load song and split into harmonic and percussive parts.
        y, sr = librosa.load(self.song_path)
        #y_harmonic, y_percussive = librosa.effects.hpss(y)
        #Isolate beats and beat times
        bpm, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim = False)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        return bpm, beat_times, y, sr

    #Mapping Function
    def generateBeatMap(self):
        #Load song and get beat features
        print("Loading Song...")
        self.tracks['bpm'], self.tracks['beat_times'], self.tracks['y'], self.tracks['sr'] = self.getBeatFeatures()
        print("Song loaded successfully!")
        #Write lists for note placement, event placement, and obstacle placement
        print("Mapping...")
        if self.difficulty.casefold() == 'ALL'.casefold():
            for diff in [ 'easy', 'normal', 'hard', 'expert', 'expertplus' ]:
                self.tracks[diff.casefold()]['notes_list'] = self.runModel(diff.casefold()) #fixes _time != beat time
                self.tracks[diff.casefold()]['events_list'] = self.eventsWriter(diff.casefold())
                self.tracks[diff.casefold()]['obstacles_list'] = self.obstaclesWriter(diff.casefold())
        else:
            self.tracks[self.difficulty.casefold()]['notes_list'] = self.runModel(self.difficulty.casefold()) #fixes _time != beat time
            self.tracks[self.difficulty.casefold()]['events_list'] = self.eventsWriter(self.difficulty.casefold())
            self.tracks[self.difficulty.casefold()]['obstacles_list'] = self.obstaclesWriter(self.difficulty.casefold())
        print("Mapping done!")
        #Write and zip files
        print("Writing files to disk...")
        self.writeInfoFile()
        self.writeLevelFile()
        print("Converting music file...")
        self.convertMusicFile()
        print("Zipping folder...")
        self.zipWriter()
        print(f"Finished! Look for zipped folder in {self.outDir}, unzip the folder, and place in the 'CustomMusic' folder in the Beat Saber directory")
    
    #Refractored model runner to allow for only a single mapping function
    def runModel(self, difficulty):
        if self.model == 'random':
            """Function to output the automatically created completely random map (i.e. baseline model) for a provided song. Returns a zipped folder that can be unzipped and placed in the 'CustomMusic' folder in the Beat Saber game directory and played. CAUTION: This is completely random and is likely not enjoyable if even playable!"""
            return self.random_NotesWriter(difficulty)
        elif self.model == 'HMM':
            """This function generates a custom map based on a Hidden Markov Model."""
            return self.HMM_NotesWriter(difficulty)
        elif self.model == 'segmented_HMM':
            """This function generates a custom map based on a HMM model that operates on song segments. First, Laplacian song segmentation is performed to identify similar portions of songs. Then, a HMM is used to generate a block sequence through the first of each of these identified song segments. If that segment is repeated later in the song, the block sequence will be repeated."""
            return self.segmentedHMM_NotesWriter(difficulty)
        elif self.model == 'rate_modulated_segmented_HMM':
            """This function generates the files for a custom map using a rate modulated segmented HMM model."""
            return self.rateModulatedSegmentedHMM_NotesWriter(difficulty)
        else:
            print('Please specify model for mapping.')

    #Random Mapping Note Writer
    def random_NotesWriter(self, difficulty):
        """This function randomly places blocks at approximately each beat or every other beat depending on the difficulty."""
        notes_list = []
        line_index = [0, 1, 2, 3]
        line_layer = [0, 1, 2]
        types = [0, 1, 2, 3]
        directions = list(range(0, 10))
        #self.tracks['beat_times'] = [float(x) for x in self.tracks['beat_times']]
        self.tracks['beat_times'] = [ x * (self.tracks['bpm'] / 60) for x in self.tracks['beat_times'] ] #list(range(len(self.tracks['beat_times'])))
    
        if difficulty == 'Easy' or difficulty == 'Normal':
            for beat in self.tracks['beat_times']:
                empty = np.random.choice([0,1])
                if empty == 1:
                    note = {'_time': beat,
                            '_lineIndex': int(np.random.choice(line_index)),
                            '_lineLayer': int(np.random.choice(line_layer)),
                            '_type': int(np.random.choice(types)),
                            '_cutDirection': int(np.random.choice(directions))}
                    notes_list.append(note)
                else:
                    continue
        else:
            random_beats = np.random.choice(self.tracks['beat_times'], np.random.choice(range(len(self.tracks['beat_times'])))) #randomly choose beats to have more than one note placed
            randomly_duplicated_beat_times = np.concatenate([self.tracks['beat_times'], random_beats])
            randomly_duplicated_beat_times.sort()
            randomly_duplicated_beat_times = [float(x) for x in randomly_duplicated_beat_times]
            for beat in randomly_duplicated_beat_times:
                note = {'_time': beat,
                        '_lineIndex': int(np.random.choice(line_index)),
                        '_lineLayer': int(np.random.choice(line_layer)),
                        '_type': int(np.random.choice(types)),
                        '_cutDirection': int(np.random.choice(directions))}
                notes_list.append(note)
        #Remove potential notes that come too early in the song:
        for i, x in enumerate(notes_list):
            if notes_list[i]['_time'] >= 0 and notes_list[i]['_time'] <= 1.5:
                del notes_list[i]
            elif notes_list[i]['_time'] > self.tracks['beat_times'][-1]:
                del notes_list[i]

        return notes_list

    #Hidden Markov Models Note Writing Functions
    def walkToDataFrame(self, walk):
        """Function for turning a Markov walk sequence into a DataFrame of note placement predictions"""
        sequence = []
        for step in walk:
            sequence.append(step.split(","))
        constant = ['notes_type_0', 'notes_lineIndex_0', 'notes_lineLayer_0',
                        'notes_cutDirection_0', 'notes_type_1', 'notes_lineIndex_1', 'notes_lineLayer_1', 
                        'notes_cutDirection_1', 'notes_type_3', 'notes_lineIndex_3',
                        'notes_lineLayer_3', 'notes_cutDirection_3']
        df = pd.DataFrame(sequence, columns = constant)
        return df

    def HMM_NotesWriter(self, difficulty):
        """Writes a list of notes based on a Hidden Markov Model walk."""
        #Load model
        if self.version == 1:
            with open(f"./models/HMM_{difficulty}.pkl", 'rb') as m:
                MC = pickle.load(m)
        elif self.version == 2:
            with open(f"./models/HMM_{difficulty}_v2.pkl", 'rb') as m:
                MC = pickle.load(m)
        #Set note placement rate dependent on difficulty level
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
        #Get HMM walk long enough to cover number of beats
        random_walk = MC.walk()
        while len(random_walk) < len(beats):
            random_walk = MC.walk()
        df_walk = self.walkToDataFrame(random_walk)
        #Combine beat numbers with HMM walk steps
        df_preds = pd.concat([pd.DataFrame(beats, columns = ['_time']), df_walk], axis = 1, sort = True)
        df_preds.dropna(axis = 0, inplace = True)
        #Write notes dictionaries
        notes_list = []
        for index, row in df_preds.iterrows():
            for x in list(filter(lambda y: y.startswith('notes_type'), df_preds.columns)):
                if row[x] != '999':
                    num = x[-1]
                    note = {'_time': row['_time'],
                            '_lineIndex': int(row[f"notes_lineIndex_{num}"]),
                            '_lineLayer': int(row[f"notes_lineLayer_{num}"]),
                            '_type': num,
                            '_cutDirection': int(row[f"notes_cutDirection_{num}"])}
                    notes_list.append(note)
       #Remove potential notes that come too early in the song:
        for i, x in enumerate(notes_list):
            if notes_list[i]['_time'] >= 0 and notes_list[i]['_time'] <= 1.5:
                del notes_list[i]
            elif notes_list[i]['_time'] > beats[-1]:
                del notes_list[i]

        return notes_list

    #Segmented HMM Note Writing Functions
    def laplacianSegmentation(self):
        """This function uses the Laplacian Segmentation method described in McFee and Ellis, 2014, and adapted from example code in the librosa documentation. It returns the segment boundaries (in frame number and time and segment ID's of isolated music file segments."""
        BINS_PER_OCTAVE = 12 * 3
        N_OCTAVES = 7
        C = librosa.amplitude_to_db(np.abs(librosa.cqt(y=self.tracks['y'], sr=self.tracks['sr'], bins_per_octave=BINS_PER_OCTAVE, n_bins=N_OCTAVES * BINS_PER_OCTAVE)), ref=np.max)
        tempo, beats = librosa.beat.beat_track(y=self.tracks['y'], sr=self.tracks['sr'], trim=False)
        Csync = librosa.util.sync(C, beats, aggregate=np.median)

        # For plotting purposes, we'll need the timing of the beats
        # we fix_frames to include non-beat frames 0 and C.shape[1] (final frame)
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
        bound_times = [ ( x / 60 ) * tempo for x in bound_times ]
        beat_numbers = list(range(len(bound_frames)))
        bound_beats = np.append(bound_beats, list(range(len(beats)))[-1])
        segments = list(zip(zip(bound_times, bound_times[1:]), zip(bound_beats, bound_beats[1:]), bound_segs))
    
        return segments, beat_times, tempo

    def segmentsToDataFrame(self, segments):
        """Helper function to translate a song semgmenation to a pandas DataFrame."""
        lengths = []
        for seg in segments:
            length = seg[1][1] - seg[1][0]
            lengths.append(length)
        df = pd.concat([pd.Series(lengths, name = 'length'), pd.Series([x[2] for x in segments], name = 'seg_no')], axis = 1)
        return df

    def segmentPredictions(self, segment_df, HMM_model):
        """This function predicts a Markov chain walk for each segment of a segmented music file. It will repeat a walk for segments that it has already mapped previously (truncating or extending as necessary)."""
        preds = pd.DataFrame([])
        completed_segments = {}
        for index, row in segment_df.iterrows():
            try:
                if row['seg_no'] not in completed_segments.keys():
                    if index == 0:
                        pred = HMM_model.walk()
                        while len(pred) < row['length']:
                            pred = HMM_model.walk()
                        completed_segments.update({row['seg_no']: {'start':0, 'end': len(pred)}})
                        preds = pd.concat([preds, pd.Series(pred[0: row['length']])], axis = 0, ignore_index = True)
                
                    else:
                        pred = HMM_model.walk(init_state = tuple(preds.iloc[-5:, 0]))
                        while len(pred) < row['length']:
                            pred = HMM_model.walk(init_state = tuple(preds.iloc[-5:, 0]))
                        completed_segments.update({row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}})
                        preds = pd.concat([preds, pd.Series(pred[0: row['length']])], axis = 0, ignore_index = True)

                else:
                    if row['length'] <= (completed_segments[row['seg_no']]['end'] - completed_segments[row['seg_no']]['start']): 
                        pred = preds.iloc[completed_segments[row['seg_no']]['start']: completed_segments[row['seg_no']]['start'] + row['length'], 0]
                        preds = pd.concat([preds, pred], axis = 0, ignore_index = True)
                    else:
                        extend = HMM_model.walk(init_state = tuple(preds.iloc[completed_segments[row['seg_no']]['end'] - 5 : completed_segments[row['seg_no']]['end'], 0]))
                        pred = preds.iloc[completed_segments[row['seg_no']]['start']: completed_segments[row['seg_no']]['end'], 0]
                        diff = row['length'] - len(pred)
                        pred = pd.concat([pred, pd.Series(extend[0: diff+1])], axis = 0, ignore_index = True)
                        completed_segments.update({row['seg_no']: {'start': len(preds)+1, 'end': len(preds)+len(pred)}})
                        preds = pd.concat([preds, pred], axis = 0, ignore_index = True)
            except:
                continue

    
        preds_list = list(preds.iloc[:, 0])
        preds = self.walkToDataFrame(preds_list)
        return preds

    def segmentedHMM_NotesWriter(self, difficulty):
        """This function writes the list of notes based on the segmented HMM model."""
        #Load model:
        if version == 1:
            with open(f"./models/HMM_{difficulty}.pkl", 'rb') as m:
                MC = pickle.load(m)
        elif version == 2:
            with open(f"./models/HMM_{difficulty}_v2.pkl", 'rb') as m:
                MC = pickle.load(m)
            
        segments, beat_times, tempo = self.laplacianSegmentation()
        segments_df = self.segmentsToDataFrame(segments)
        preds = self.segmentPredictions(segments_df, MC)
        #Combine beat numbers with HMM walk steps
        beats = [ ( x / 60 ) * tempo for x in beat_times ]
        df_preds = pd.concat([pd.DataFrame(beats, columns = ['_time']), preds], axis = 1, sort = True)
        df_preds.dropna(axis = 0, inplace = True)
        #Write notes dictionaries
        notes_list = []
        for index, row in df_preds.iterrows():
            for x in list(filter(lambda y: y.startswith('notes_type'), df_preds.columns)):
                if row[x] != '999':
                    num = x[-1]
                    note = {'_time': row['_time'],
                            '_lineIndex': int(row[f"notes_lineIndex_{num}"]),
                            '_lineLayer': int(row[f"notes_lineLayer_{num}"]),
                            '_type': num,
                            '_cutDirection': int(row[f"notes_cutDirection_{num}"])}
                    notes_list.append(note)
        #Remove potential notes that come too early in the song:
        for i, x in enumerate(notes_list):
            if notes_list[i]['_time'] >= 0 and notes_list[i]['_time'] <= 1.5:
                del notes_list[i]
            elif notes_list[i]['_time'] > beats[-1]:
                del notes_list[i]
    
        return notes_list

    #Rate Modulated Segmented HMM Note Writing Functions
    def chooseRate(self, db, difficulty):
        """
        This function modulates the block placement rate by using the average amplitude (i.e., 'loudness') across beats to choose how many blocks per beat will be placed. Takes in the difficulty level and the amplitude and returns an integer in the set {0, 1, 2, 4, 8, 16}.
        If you are finding that your maps are too fast or too slow for you, you might want to play with the probabilities in this file.
        """
        db = np.abs(db)
        p = None
        if difficulty.casefold() == 'easy'.casefold():
            if db > 70:
                p = [0.95, 0.05, 0, 0, 0, 0]
            elif db <= 70 and db > 55:
                p = [0.90, 0.10, 0, 0, 0, 0]
            elif db <= 55 and db > 45:
                p = [0.80, 0.2, 0, 0, 0, 0]
            elif db <= 45 and db > 35:
                p = [0.4, 0.5, 0.1, 0, 0, 0]
            else:
                p = [0.3, 0.6, 0.1, 0, 0, 0]
        elif difficulty.casefold() == 'normal'.casefold():
            if db > 70:
                p = [0.95, 0.05, 0, 0, 0, 0]
            elif db <= 70 and db > 55:
                p = [0.5, 0.5, 0, 0, 0, 0]
            elif db <= 55 and db > 45:
                p = [0.3, 0.7, 0, 0, 0, 0]
            elif db <= 45 and db > 35:
                p = [0.2, 0.7, 0.1, 0, 0, 0]
            else:
                p = [0.05, 0.7, 0.25, 0, 0, 0]
        elif difficulty.casefold() == 'hard'.casefold():
            if db > 70:
                p = [0.95, 0.05, 0, 0, 0, 0]
            elif db <= 70 and db > 55:
                p = [0.5, 0.5, 0, 0, 0, 0]
            elif db <= 55 and db > 45:
                p = [0.2, 0.6, 0.2, 0, 0, 0]
            elif db <= 45 and db > 35:
                p = [0.1, 0.5, 0.4, 0, 0, 0]
            else:
                p = [0.05, 0.35, 0.6, 0, 0, 0]
        elif difficulty.casefold() == 'expert'.casefold():
            if db > 70:
                p = [0.8, 0.2, 0, 0, 0, 0]
            elif db <= 70 and db > 55:
                p = [0.2, 0.7, 0.1, 0, 0, 0]
            elif db <= 55 and db > 50:
                p = [0.1, 0.4, 0.3, 0.2, 0, 0]
            elif db <= 50 and db > 45:
                p = [0, 0.05, 0.6, 0.35, 0, 0]
            else:
                p = [0, 0, 0.35, 0.65, 0, 0]
        elif difficulty.casefold() == 'expertplus'.casefold():
            if db > 70:
                p = [0, 0.5, 0.4, 0.1, 0, 0]
            elif db <= 70 and db > 55:
                p = [0, 0.3, 0.6, 0.1, 0, 0]
            elif db <= 55 and db > 50:
                p = [0, 0.1, 0.6, 0.3, 0, 0]
            elif db <= 50 and db > 45:
                p = [0, 0.05, 0.1, 0.6, 0.25, 0]
            else:
                p = [0, 0, 0, 0.5, 0.3, 0.2]
        return np.random.choice([0, 1, 2, 4, 8, 16], p = p)

    def amplitudeRateModulation(self, difficulty):
        """This function uses the average amplitude (i.e., 'loudness') of a beat and the difficulty level to determine 
        how many blocks will be placed within the beat. Returns a list of beat numbers."""
        #Make amplitude matrix
        D = np.abs(librosa.stft(self.tracks['y']))
        db = librosa.amplitude_to_db(D, ref=np.max)
        #Get beat frames and sync with amplitudes
        tempo, beat_frames = librosa.beat.beat_track(self.tracks['y'], self.tracks['sr'], trim = False)
        beat_db = pd.DataFrame(librosa.util.sync(db, beat_frames, aggregate = np.mean))
        #Mean amplitude per beat
        avg_beat_db = beat_db.mean()
        #Choose rates and smooth rate transitions
        rates = [0]
        counter = 1
        while counter < len(avg_beat_db)-1:
            rate = self.chooseRate(np.mean([avg_beat_db.iloc[counter-1], avg_beat_db.iloc[counter], avg_beat_db.iloc[counter+1]]), difficulty)
            diff = np.abs(rate - rates[-1])
            if difficulty.casefold() == 'expert'.casefold() or difficulty.casefold() == 'expertplus'.casefold():
                maxdiff = 4
            else:
                maxdiff = 2
            while diff > maxdiff:
                rate = self.chooseRate(np.mean([avg_beat_db.iloc[counter-1], avg_beat_db.iloc[counter], avg_beat_db.iloc[counter+1]]), difficulty)
                diff = rates[-1] - rate
            if rate == 4 and rates[-1] == 4: #and rates[-2] == 4:
                rate = np.random.choice([0, 1, 2])
            rates.append(rate)
            counter +=1
        #Make list of beat numbers based on rates
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

    def segmentsToDataFrameRateModulated(self, segments, difficulty):
        """This function returns a DataFrame of the number of blocks needed for each song segment."""
        expanded_beat_list = []
        for x in segments:
            for y in self.tracks[difficulty.casefold()]['modulated_beat_list']:
                if y > x[1][0] and y <= x[1][1]:
                    expanded_beat_list.append({'_time': y, 'segment': x[2]})
        df = pd.DataFrame([], columns = ['length', 'seg_no'])
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
                df = df.append(pd.DataFrame({'length': length, 'seg_no': expanded_beat_list[-1]['segment']}, index = [0]))
                break
            elif expanded_beat_list[counter]['segment'] == expanded_beat_list[counter+1]['segment']:
                counter += 1  
            elif expanded_beat_list[counter]['segment'] != expanded_beat_list[counter+1]['segment']:
                last = counter
                length = len(expanded_beat_list[first: last+1])
                df = df.append(pd.DataFrame({'length': length, 'seg_no': expanded_beat_list[counter]['segment']}, index = [0]))
                counter += 1
        return df

    def rateModulatedSegmentedHMM_NotesWriter(self, difficulty):
        """Function to write the notes to a list after predicting with the rate modulated segmented HMM model."""
        #Load model:
        if self.version == 1:
            with open(f"./models/HMM_{difficulty}.pkl", 'rb') as m:
                MC = pickle.load(m)
        elif self.version == 2:
            with open(f"./models/HMM_{difficulty}_v2.pkl", 'rb') as m:
                MC = pickle.load(m)
        segments, beat_times, tempo = self.laplacianSegmentation()
        self.tracks[difficulty.casefold()]['modulated_beat_list'] = self.amplitudeRateModulation(difficulty)
        segments_df = self.segmentsToDataFrameRateModulated(segments, difficulty)
        preds = self.segmentPredictions(segments_df, MC)
        #Combine beat numbers with HMM walk steps
        beat_times = [ ( x / 60 ) * tempo for x in beat_times ]
        beat_count = list(range(len(beat_times)))
        beats = pd.concat([pd.Series(beat_times, name = '_time'), pd.Series(beat_count, name = 'beat_count')], axis = 1)
        for index, value in beats.iterrows():
            if value['beat_count'] not in self.tracks[difficulty.casefold()]['modulated_beat_list']:
                beats.drop(index = index, inplace=True)
        merged_beats = pd.merge(left = beats, right = pd.Series(self.tracks[difficulty.casefold()]['modulated_beat_list'], name = 'beat_count'), how='outer', on='beat_count', sort = True)
        merged_beats.interpolate(inplace=True)
        merged_beats.drop(columns = 'beat_count', inplace = True)
    
        df_preds = pd.concat([merged_beats, preds], axis = 1, sort = True)
        df_preds.dropna(axis = 0, inplace = True)
        #Write notes dictionaries
        notes_list = []
        for index, row in df_preds.iterrows():
            for x in list(filter(lambda y: y.startswith('notes_type'), df_preds.columns)):
                if row[x] != '999':
                    num = x[-1]
                    note = {'_time': row['_time'],
                            '_lineIndex': int(row[f"notes_lineIndex_{num}"]),
                            '_lineLayer': int(row[f"notes_lineLayer_{num}"]),
                            '_type': num,
                            '_cutDirection': int(row[f"notes_cutDirection_{num}"])}
                    notes_list.append(note)
        #Remove potential notes that come too early in the song:
        for i, x in enumerate(notes_list):
            if notes_list[i]['_time'] >= 0 and notes_list[i]['_time'] <= 1.5:
                del notes_list[i]
            elif notes_list[i]['_time'] > beat_times[-1]:
                del notes_list[i]
        return notes_list

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('song_path', metavar='path', type=str, help='File Path to song file')
    parser.add_argument('song_name', type=str, help='Name of song to be displayed in Beat Saber')
    parser.add_argument('difficulty', type=str, help="Desired difficulty level: 'easy', 'normal', 'hard', 'expert', 'expertplus', or 'all'")
    parser.add_argument('model', type=str, help="Desired model for mapping: 'random', 'HMM', 'segmented_HMM', 'rate_modulated_segmented_HMM'")
    parser.add_argument('-k', type=int, help="Number of expected segments for segmented model. Default 5", default=5, required=False)
    parser.add_argument('--version', type=int, help="Version of HMM model to use: 1 (90% rating or greater) or 2 (70% rating or greater)", default=2, required=False)
    parser.add_argument('--workingDir', type=str, help="Directory of scripts folder (this is automatically done, do not use this argument!)", required=True)
    parser.add_argument('--outDir', type=str, help="Directory to save outputed files to. Default is the current directory.", required=False)
    parser.add_argument('--zipFiles', type=int, help="Boolean to zip output files.", default=0, required=False)

    args = parser.parse_args()
    
    os.chdir(f"{args.workingDir}/scripts")
    
    testFile = open(f"{args.workingDir}/debug.log", 'w')
    testFile.write(f"Current working dir: {os.getcwd()}\n")
    testFile.write(f"Song path: {args.song_path}\n")
    testFile.write(f"Song name:{args.song_name}\n")
    testFile.write(f"Difficulty: {args.difficulty}\n")
    testFile.write(f"Model: {args.model}\n")
    testFile.write(f"K: {args.k}\n")
    testFile.write(f"Version: {args.version}\n")
    testFile.write(f"Out Directory: {args.outDir}\n")
    testFile.write(f"Zip Files: {args.zipFiles}\n")
    testFile.close()
    
    main = Main(args.song_path, args.song_name, args.difficulty, args.model, args.k, args.version, args.outDir, args.zipFiles)
    main.generateBeatMap()
    