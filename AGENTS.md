# AudioPilot - Agent Guide

## Overview
AudioPilot, sürücülerin telefona bakmalarını gerektirmeyen, tamamen sesli ve haptik geri bildirim ile çalışan bir sürüş güvenlik asistanıdır.

## Architecture

### System Flow
```
User Location → OSM Overpass API → Road Segments → Curvature Analysis → Turn Detection
                                                                        ↓
User Interface ← MinimalCockpit ← Audio Service ← TTS Engine
                ← Haptic Service ← Viraj Uyarısı
```

### Core Components

#### 1. Location Service (`src/services/locationService.ts`)
- **Purpose**: High-accuracy background GPS tracking
- **Key Methods**:
  - `requestPermissions()`: Foreground + background location permissions
  - `startTracking(callbacks)`: Starts GPS watch with configurable intervals
  - `stopTracking()`: Cleanup location subscription
  - `handleLocationUpdate()`: Processes location updates and triggers turn detection
- **GPS Intervals**:
  - Highway (>80 km/h): 10s interval, 500m distance filter
  - City (<80 km/h): 5s interval, 50m distance filter
- **Dependencies**: expo-location, OSMService, CurvatureService

#### 2. OSM Service (`src/services/osmService.ts`)
- **Purpose**: Fetch road data from OpenStreetMap Overpass API
- **Key Methods**:
  - `buildOverpassQuery(lat, lon, radius)`: Constructs Overpass QL query
  - `fetchRoadData(lat, lon, radius)`: Fetches road segments from OSM
  - `parseOSMData(data)`: Parses OSM JSON into RoadSegment objects
  - `extractSpeedLimit(tags)`: Extracts speed limit from OSM way tags
  - `cacheRoute()` / `getCachedRoute()`: Offline route caching with MMKV
- **API Endpoint**: `https://overpass-api.de/api/interpreter`
- **Query Scope**: 500m radius for city, 1000m for highway
- **Dependencies**: react-native-mmkv for caching

#### 3. Curvature Service (`src/services/curvatureService.ts`)
- **Purpose**: Calculate road curvature and detect upcoming turns
- **Key Methods**:
  - `calculateBearing(lat1, lon1, lat2, lon2)`: Bearing angle between two points
  - `haversineDistance(lat1, lon1, lat2, lon2)`: Distance in meters
  - `calculateCurvatureRadius(points)`: Radius of curvature from 3+ points
  - `classifyTurn(curvatureRadius, bearingChange)`: Classify turn type
  - `calculateSafeSpeed(curvatureRadius, speedLimit)`: Safe speed based on lateral acceleration
  - `findUpcomingTurns()`: Find turns within LOOKAHEAD_DISTANCE
- **Constants**:
  - `TURN_DETECTION_THRESHOLD`: 15 degrees
  - `CURVATURE_RADIUS_SHARP`: 150m
  - `CURVATURE_RADIUS_GENTLE`: 500m
  - `LOOKAHEAD_DISTANCE`: 300m

#### 4. Audio Service (`src/services/audioService.ts`)
- **Purpose**: Text-to-Speech and audio focus management
- **Key Methods**:
  - `initialize()`: Configure expo-audio audio mode with ducking
  - `speak(text, priority)`: Speak text with priority-based interruption
  - `speakTurn(turn)`: Generate Turkish turn announcement
  - `speakNotification(notification)`: Announce community notifications
  - `stop()`: Stop current speech
  - `setDuckingLevel(level)`: Adjust audio ducking (0.1-1.0)
- **Audio Mode**:
  - `playsInSilentMode`: true
  - `shouldPlayInBackground`: true
  - `interruptionMode`: `'duckOthers'` (applies to iOS + Android)
  - `allowsRecording`: false
  - `shouldRouteThroughEarpiece`: false
- **Dependencies**: expo-speech, expo-audio

#### 5. Haptic Service (`src/services/hapticService.ts`)
- **Purpose**: Haptic feedback patterns for turns and notifications
- **Key Methods**:
  - `triggerTurnHaptic(turn)`: Direction-specific haptic
    - Sharp turns: NotificationWarning + Heavy impact
    - Gentle turns: Medium impact
  - `triggerNotificationHaptic(notification)`: Priority-based haptic
    - High: NotificationError
    - Medium: NotificationWarning
    - Low: Light impact
  - `triggerConfirmationHaptic()`: Light impact for button presses
- **Dependencies**: expo-haptics

#### 6. UI Components

##### MinimalCockpit (`src/components/MinimalCockpit.tsx`)
- **Purpose**: Minimalist driving UI with speedometer and turn indicator
- **Props**:
  - `currentSpeed`, `speedLimit`, `recommendedSpeed`
  - `upcomingTurn`, `distanceToTurn`
  - `isHeadDown`: Toggle minimal mode
- **Features**:
  - SVG-based compass arrow (direction + intensity)
  - Large speed display with color coding
  - Speed limit sign (right side)
  - Recommended speed badge
  - Animated warning for sharp turns <200m

##### DriveScreen (`src/screens/DriveScreen.tsx`)
- **Purpose**: Main driving screen with map and controls
- **States**:
  - `splash`: Legal disclaimer + audio warning
  - `drive`: Active driving mode
  - `head-down`: Black screen + audio only
- **Features**:
  - OpenStreetMap background (30% opacity)
  - MinimalCockpit overlay
  - Bottom control buttons (Head-Down, Radar, Kaza)
  - Notification banners
  - AppState management for keep-awake

##### HeadDownScreen (`src/screens/HeadDownScreen.tsx`)
- **Purpose**: Head-down mode with minimal visual information
- **Features**:
  - Large speed display
  - Warning overlay for sharp turns
  - Exit button (X)
  - Radar/Kaza buttons

##### SplashScreen (`src/screens/SplashScreen.tsx`)
- **Purpose**: Legal disclaimer and app initialization
- **Features**:
  - Animated logo and loading bar
  - Turkish audio disclaimer (mandatory)
  - Auto-advance to DriveScreen after 6s

## Data Models (`src/models/types.ts`)

### Turn
```typescript
interface Turn {
  id: string;
  latitude: number;
  longitude: number;
  bearing: number;
  curvatureRadius: number;  // meters, Infinity = straight
  type: 'sharp_left' | 'sharp_right' | 'gentle_left' | 'gentle_right' | 'straight';
  speedLimit: number;
  recommendedSpeed: number;
  distance: number;         // meters from current location
  osmWayId: string;
}
```

### RoadSegment
```typescript
interface RoadSegment {
  id: string;
  latitude: number;
  longitude: number;
  bearing: number;
  speedLimit: number;
  curvatureRadius: number;
  osmWayId: string;
}
```

### Notification
```typescript
interface Notification {
  id: string;
  type: 'turn' | 'speed' | 'police' | 'accident';
  message: string;
  priority: 'low' | 'medium' | 'high';
  distance: number;
  timestamp: number;
}
```

### CachedRoute
```typescript
interface CachedRoute {
  wayId: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  turns: Turn[];
  downloadedAt: number;
}
```

## Constants (`src/utils/constants.ts`)
- `APP_NAME`: 'AudioPilot'
- `APP_VERSION`: '1.0.0'
- `DEFAULT_SPEED_LIMIT`: 50 km/h
- `MAX_SPEED_LIMIT`: 200 km/h
- `TURN_WARNING_DISTANCE`: 300m
- `SHARP_TURN_WARNING_DISTANCE`: 200m
- `AUDIO_LANGUAGE`: 'tr-TR'
- `CACHE_EXPIRY_DAYS`: 7
- `NOTIFICATION_RADIUS_KM`: 5
- `MAP_TILE_URL`: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
- `LOCATION_TASK_NAME`: 'background-location-task'
- `BACKGROUND_FETCH_TASK`: 'background-fetch-task'

## Build and Deployment

### Local Build
```bash
npm install
npx expo start
npx expo run:android  # Android
npx expo run:ios      # iOS
```

### CI/CD Pipeline (GitHub Actions)
- **Trigger**: Push to `main` branch or manual dispatch
- **Runner**: `ubuntu-latest`
- **Steps**:
  1. Checkout code
  2. Setup Node.js 22 with npm cache
  3. `npm ci` (lockfile is committed and must stay in sync with package.json)
  4. `npm test -- --ci` (unit tests must pass before a build is submitted)
  5. `npx expo config --type public` (fail fast if the Expo config is invalid)
  6. `eas init` (links or creates the EAS project; see below)
  7. Assert `extra.eas.projectId` is now present
  8. Cancel queued builds from older commits (see note below)
  9. `npx eas-cli build --platform android --profile preview --non-interactive --no-wait --json`
     - submits the build and prints the build id to the step summary immediately
  10. Poll `npx eas-cli build:view <build_id> --json` every 30s for up to 120
      minutes until the status is `FINISHED` (on `ERRORED`/`CANCELED` the step
      fails and prints the EAS error + log files)
  11. Download the APK from `artifacts.buildUrl` and publish it as a workflow
      artifact (`audiopilot-preview-apk`)
- **Required Secret**: `EXPO_TOKEN`
- **Optional Secrets/Vars**:
  - `EAS_PROJECT_ID`: link an existing project instead of creating one
  - `EAS_ACCOUNT` (repository variable): Expo account that owns the project,
    defaults to `yapayziya`
- **Note**: the deprecated `expo/expo-github-action` is NOT used. It installs the
  legacy, end-of-life `expo-cli`, which cannot evaluate an SDK 57 project config
  (it fails with `expo config ... exited with non-zero code` or
  `Unexpected token 'typeof'`). EAS CLI alone is sufficient.
- **Note**: the workflow must not finish green while the build is still queued.
  Submitting with `--no-wait` + polling `build:view` is used instead of `--wait`
  so the build id is visible in the step summary right after submission, even
  if the run is cancelled or times out while waiting. Free-tier EAS queues can
  exceed 30 minutes, so the poll window is 120 minutes and the job timeout is
  240 minutes. If it still times out, re-run the workflow manually with the
  `build_id` input to attach the APK to that run.
- **Note**: the submit path first cancels queued builds that belong to older
  commits. Every push submits a build and the Expo plan only allows a limited
  number of concurrent builds, so without this a burst of pushes leaves several
  obsolete builds competing for slots and the newest commit waits behind them.
  The step only touches non-terminal builds whose `gitCommitHash` differs from
  the commit being built, and it is `continue-on-error`.

### EAS Build Profiles (`eas.json`)
- `preview`: APK, internal distribution
- `production`: App Bundle (AAB), Google Play

## Known Issues and Solutions

### Expo Config Validation Error
**Issue**: `The field "cli.appVersionSource" is not set` or `expo config --json exited with non-zero code: 1`
**Solution**: Set `"cli": { "appVersionSource": "local" }` in **both** `app.json`
(`expo.cli`) and `eas.json` (`cli`). Never install the legacy `expo-cli`; it cannot
read modern (SDK 50+) project configs.

### EAS Build Fails Immediately (2 seconds)
**Issue**: `Package "expo-speech" does not contain a valid config plugin` followed by
a hard failure before the build is uploaded.
**Root Cause**: Only packages that ship an `app.plugin.js` may be listed in
`expo.plugins`. `expo-speech` and `expo-haptics` have no config plugin (autolinking
handles them), and `expo-av` no longer exists in SDK 57 (use `expo-audio`).
**Solution**: `plugins` only lists `expo-location`, `expo-audio`, `expo-task-manager`,
`expo-background-fetch` and `expo-splash-screen`.

### EAS Project Not Configured
**Issue**: `EAS project not configured. This command cannot configure it in
non-interactive mode.`
**Root Cause**: `app.json` has no `extra.eas.projectId`, and `eas build
--non-interactive` refuses to create/link a project on its own.
**Solution**: run `eas init` before the build. Once the project exists, copy its id
into `app.json` as `expo.extra.eas.projectId` (plus `expo.owner`) and commit it so
CI becomes fully declarative.

### Version Matrix Drift (root cause of past build failures)
**Issue**: Builds fail right after `npm install` even though install succeeds.
**Root Cause**: `package.json`, `package-lock.json` and the installed Expo SDK were
out of sync (lockfile pinned SDK 51 while package.json claimed SDK 57, and the
declared versions did not exist for that SDK).
**Solution**: One source of truth. Native module versions come from
`node_modules/expo/bundledNativeModules.json`. After any dependency change run
`npm install` and **commit `package-lock.json`**; CI uses `npm ci`.

### Lockfile Regenerated With A Newer npm Breaks CI
**Issue**: `npm ci` on CI fails immediately with `Missing: <pkg>@<ver> from
lock file` even though `npm install` succeeded locally.
**Root Cause**: The lockfile was regenerated with a newer npm major than CI
uses (CI runs Node 22 → npm 10). A lockfile written by npm 11 (Node 24) is
not accepted by `npm ci` on npm 10.
**Solution**: Always regenerate the lockfile with npm 10:
`npx npm@10 install` or, for a single removal,
`npx npm@10 uninstall <pkg> --package-lock-only`. Verify with
`npx npm@10 ci` before committing.

### Missing Assets Break the Build
**Issue**: `expo prebuild` / EAS fails because `assets/icon.png` etc. cannot be found.
**Root Cause**: The `assets/` directory was empty and git does not track empty
directories, so CI checkouts had no images at all.
**Solution**: `assets/` must contain `icon.png` (1024x1024), `adaptive-icon.png`,
`splash.png` and `favicon.png`, and they must be committed.

### TypeScript Errors in CI
**Issue**: Missing type declarations for react-native
**Solution**: Use `npm install` in CI before build, ensure `node_modules` is restored from cache.

### Audio Ducking Not Working
**Issue**: Background audio doesn't duck
**Solution**: Ensure `interruptionMode: 'duckOthers'` and `shouldPlayInBackground: true` are set via `setAudioModeAsync` from `expo-audio`.

## Testing
- **Runner**: Jest via the `jest-expo` preset (pinned to the SDK). `npm test` runs the suite.
- **Unit tests (done)**: `src/services/__tests__/curvatureService.test.ts` covers
  `calculateBearing`, `haversineDistance`, `normalizeBearingDelta`,
  `calculateCurvatureRadius`, `classifyTurn`, `calculateSafeSpeed` and
  `findUpcomingTurns`.
- **Not covered yet**: `OSMService.buildOverpassQuery` / `parseOSMData`,
  `LocationService` callbacks, and the React Native screens.
- **Manual testing** on a physical device is still required for GPS, haptics and
  audio focus, none of which can be covered by unit tests.
- Tests run in CI (`npm test -- --ci`) before an APK build is submitted.

### Conventions that the tests pin down
- Compass bearings grow **clockwise** (0 = north, 90 = east). A left turn
  therefore *decreases* the bearing, a right turn increases it.
- Bearing differences must be normalised through `normalizeBearingDelta` before
  any comparison. A turn from 350° to 10° is a raw delta of -340°, not +340°.
- `findUpcomingTurns` trusts the caller to pass a `currentBearing` consistent
  with the road geometry; a mismatched heading is reported as a turn.

## Future Improvements
- [ ] Implement actual map matching algorithm
- [ ] Add smart watch integration (WatchOS/WearOS)
- [ ] Real-time community notification sync
- [ ] Offline map tile caching
- [ ] Machine learning for turn prediction
- [ ] Voice command support
- [ ] Multi-language support (TR/EN)
