# JellyfinMasonry

`JellyfinMasonry` is a Jellyfin plugin that caches aspect ratios for videos and photos and exposes them through a small API.
Together with a JavaScript snippet, this enables a Pinterest-style Masonry layout where portrait and landscape items use different card heights.

## Features

- Works with videos and photos
- Caches aspect ratios on the server side
- Exposes cached ratios through `/Masonry/...` endpoints
- Supports portrait and landscape cards
- Designed for Masonry / Pinterest-style library views

## Requirements

- Jellyfin `10.11.x`
- The `JavaScript Injector` plugin installed in Jellyfin

## Quick Setup

You do **not** need to build the project yourself if you only want to install it.
Use the prebuilt files from the `out/` folder:

- `out/JellyfinMasonry.dll`
- `out/masonry.js`

## Installation Tutorial

### 1. Install JavaScript Injector

Install the `JavaScript Injector` plugin in Jellyfin first.

This plugin is required because `JellyfinMasonry` uses a frontend script (`masonry.js`) in addition to the backend DLL.

### 2. Copy the plugin DLL

Copy `out/JellyfinMasonry.dll` into your Jellyfin plugin folder.

Example Docker path:

```text
/config/plugins/JellyfinMasonry/JellyfinMasonry.dll
```

If the `JellyfinMasonry` folder does not exist yet, create it first.

### 3. Add the JavaScript

Open the `JavaScript Injector` plugin in Jellyfin and paste the full contents of:

```text
out/masonry.js
```

into the injector script field.

### 4. Restart Jellyfin

Completely restart Jellyfin after copying the DLL and updating the injected script.

### 5. Run the ratio scan

In Jellyfin, open:

```text
Dashboard -> Scheduled Tasks
```

Then manually run:

```text
Masonry: Scan Aspect Ratios
```

This builds the aspect-ratio cache used by the frontend Masonry layout.

### 6. Hard refresh your browser

After the restart and scan, do a hard reload in your browser so the new injected JavaScript is loaded.

## Updating

When updating to a newer version:

1. Replace `JellyfinMasonry.dll` with the new file from `out/`
2. Replace the injected JavaScript with the new `out/masonry.js`
3. Restart Jellyfin
4. Run the ratio scan again if needed

## Building From Source

Building is optional.
Most users can simply use the files from `out/`.

If you want to build it yourself:

```powershell
cd JellyfinMasonry
.\build.ps1
```

The build output is written to:

```text
JellyfinMasonry/out/
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /Masonry/Ratios/{parentId}` | Returns aspect ratios for a specific library |
| `POST /Masonry/Ratios/{parentId}/Refresh` | Rebuilds the cache for one library |
| `POST /Masonry/Ratios/RefreshAll` | Rebuilds the cache for all libraries |
| `GET /Masonry/Status?parentId={id}` | Returns cache status information |

## How It Works

1. The scheduled task scans items and caches aspect ratios on the server.
2. The API returns ratio data as JSON: `{ "itemId": ratio }`.
3. The injected `masonry.js` script reads those ratios and builds the Masonry-style layout in the browser.

## Frontend Settings

These values can be adjusted in `masonry.js` if you want a different look:

```javascript
const COLUMN_WIDTH = 236;
const GAP = 14;
const DEFAULT_RATIO = 16 / 9;
```

## Left-To-Right Settings

If you use `masonry-left-right.js`, these values can be adjusted at the top of the file:

```javascript
const COLUMN_MIN_WIDTH = 236;
const GAP = 14;
const GRID_ROW_HEIGHT = 8;
const DEFAULT_RATIO = 16 / 9;
const CARD_TEXT_HEIGHT = 72;
const CHUNK_SIZE = 500;
const BATCH_SIZE = 12;
const RATIO_REQUEST_BATCH_SIZE = 250;
const INITIAL_CARD_LIMIT = 16;
const SCROLL_INCREMENT = 8;
const DEBUG_LOGS = false;
const SEARCH_COLUMN_MIN_WIDTH = 280;
const SEARCH_RATIO_MIN = 0.82;
const SEARCH_RATIO_MAX = 1.32;
const SEARCH_RATIO_BLEND = 0.58;
const SEARCH_PHOTO_RATIO_MIN = 0.92;
const SEARCH_PHOTO_RATIO_MAX = 1.08;
const SEARCH_PHOTO_RATIO_BLEND = 0.82;
const LARGE_CONTAINER_THRESHOLD = 180;
const ENABLE_LITE_MODE = false;
const NO_LIMIT_THRESHOLD = 1000;
const SMALL_LIBRARY_THRESHOLD = 80;
const SMALL_LIBRARY_BATCH_SIZE = 48;
const PROCESS_DEBOUNCE_MS = 120;
const AUTO_EXPAND_DELAY_MS = 220;
```

### Variable Notes

- `COLUMN_MIN_WIDTH`: Minimum width for a normal library column
- `GAP`: Space between cards
- `GRID_ROW_HEIGHT`: Internal grid row height used for row spans
- `DEFAULT_RATIO`: Fallback aspect ratio when no item-specific value is available
- `CARD_TEXT_HEIGHT`: Estimated text area added to the card height calculation
- `CHUNK_SIZE`: Number of cards grouped into one Masonry chunk
- `BATCH_SIZE`: How many cards are processed per UI batch for large libraries
- `RATIO_REQUEST_BATCH_SIZE`: How many item IDs are sent per layout / ratio lookup request
- `INITIAL_CARD_LIMIT`: Initial number of visible cards when limits are active
- `SCROLL_INCREMENT`: Number of additional cards per expansion step when limits are active
- `DEBUG_LOGS`: Enables extra console logging
- `SEARCH_COLUMN_MIN_WIDTH`: Minimum width for search-result columns
- `SEARCH_RATIO_MIN`: Lower clamp for search-result ratio smoothing
- `SEARCH_RATIO_MAX`: Upper clamp for search-result ratio smoothing
- `SEARCH_RATIO_BLEND`: Blend strength for search-result ratio normalization
- `SEARCH_PHOTO_RATIO_MIN`: Lower clamp for search-result photo ratios
- `SEARCH_PHOTO_RATIO_MAX`: Upper clamp for search-result photo ratios
- `SEARCH_PHOTO_RATIO_BLEND`: Blend strength for search-result photo ratio normalization
- `LARGE_CONTAINER_THRESHOLD`: Threshold that marks a container as large for optional lite-mode handling
- `ENABLE_LITE_MODE`: Enables the lighter fallback mode for very large containers
- `NO_LIMIT_THRESHOLD`: Libraries with up to this many cards load fully without the normal limit/expand system
- `SMALL_LIBRARY_THRESHOLD`: Threshold for the faster small-library path
- `SMALL_LIBRARY_BATCH_SIZE`: Batch size used by the small-library fast path
- `PROCESS_DEBOUNCE_MS`: Debounce time for queued container processing
- `AUTO_EXPAND_DELAY_MS`: Delay between automatic expansion steps for large libraries

## Notes

- If the layout does not update, make sure Jellyfin was fully restarted.
- If portrait items still look wrong, rerun the `Masonry: Scan Aspect Ratios` task.
- If the script changes do not appear, hard refresh the browser cache.
