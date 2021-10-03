"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * __beatMapArgs is a class for containing the arguments for the beat map generation in a single object
 */
class __beatMapArgs {
    dir;
    difficulty;
    model;
    version;
    outDir;
    zipFiles;
    environment;
    lightsIntensity;
    albumDir;
    constructor() {
        this.dir = '';
        this.difficulty = 'all';
        this.model = 'random';
        this.version = 2;
        this.outDir = process.env.PORTABLE_EXECUTABLE_DIR ?? process.cwd();
        this.zipFiles = 0;
        this.environment = 'RANDOM';
        this.lightsIntensity = 9;
        this.albumDir = 'NONE';
    }
}
exports.default = __beatMapArgs;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiX19iZWF0TWFwQXJncy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9fX2JlYXRNYXBBcmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUE7O0dBRUc7QUFDSCxNQUFxQixhQUFhO0lBQ2hDLEdBQUcsQ0FBUztJQUNaLFVBQVUsQ0FBUztJQUNuQixLQUFLLENBQVM7SUFDZCxPQUFPLENBQVM7SUFDaEIsTUFBTSxDQUFTO0lBQ2YsUUFBUSxDQUFTO0lBQ2pCLFdBQVcsQ0FBUztJQUNwQixlQUFlLENBQVM7SUFDeEIsUUFBUSxDQUFTO0lBRWpCO1FBQ0UsSUFBSSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN4QixJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQztRQUN0QixJQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNqQixJQUFJLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ25FLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDO1FBQzVCLElBQUksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQXRCRCxnQ0FzQkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogX19iZWF0TWFwQXJncyBpcyBhIGNsYXNzIGZvciBjb250YWluaW5nIHRoZSBhcmd1bWVudHMgZm9yIHRoZSBiZWF0IG1hcCBnZW5lcmF0aW9uIGluIGEgc2luZ2xlIG9iamVjdFxyXG4gKi9cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgX19iZWF0TWFwQXJncyB7XHJcbiAgZGlyOiBzdHJpbmc7XHJcbiAgZGlmZmljdWx0eTogc3RyaW5nO1xyXG4gIG1vZGVsOiBzdHJpbmc7XHJcbiAgdmVyc2lvbjogbnVtYmVyO1xyXG4gIG91dERpcjogc3RyaW5nO1xyXG4gIHppcEZpbGVzOiBudW1iZXI7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBsaWdodHNJbnRlbnNpdHk6IG51bWJlcjtcclxuICBhbGJ1bURpcjogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHRoaXMuZGlyID0gJyc7XHJcbiAgICB0aGlzLmRpZmZpY3VsdHkgPSAnYWxsJztcclxuICAgIHRoaXMubW9kZWwgPSAncmFuZG9tJztcclxuICAgIHRoaXMudmVyc2lvbiA9IDI7XHJcbiAgICB0aGlzLm91dERpciA9IHByb2Nlc3MuZW52LlBPUlRBQkxFX0VYRUNVVEFCTEVfRElSID8/IHByb2Nlc3MuY3dkKCk7XHJcbiAgICB0aGlzLnppcEZpbGVzID0gMDtcclxuICAgIHRoaXMuZW52aXJvbm1lbnQgPSAnUkFORE9NJztcclxuICAgIHRoaXMubGlnaHRzSW50ZW5zaXR5ID0gOTtcclxuICAgIHRoaXMuYWxidW1EaXIgPSAnTk9ORSc7XHJcbiAgfVxyXG59XHJcbiJdfQ==