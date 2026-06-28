# JellyfinMasonry Plugin

A Jellyfin plugin that caches the aspect ratios of all library items and exposes them via an API—enabling a clean Masonry/Pinterest-style layout.

## Installation

### Build the plugin

```bash
cd JellyfinMasonry
dotnet publish -c Release -o ./dist
```

### Install the plugin

1. Copy `JellyfinMasonry.dll` to `/config/plugins/JellyfinMasonry/`
2. Restart Jellyfin
3. Manually run the **"Masonry: Scan Aspect Ratios"** task in the dashboard under **Scheduled Tasks**

### JavaScript Injector

Insert the contents of `masonry.js` into the JavaScript Injector.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /Masonry/Ratios/{parentId}` | Ratios for a specific library |
| `POST /Masonry/Ratios/{parentId}/Refresh` | Rebuild cache for a specific library |
| `POST /Masonry/Ratios/RefreshAll` | Rebuild cache for all libraries |
| `GET /Masonry/Status?parentId={id}` | Check cache status |

## How it works

1. **Scheduled Task:** Scans all libraries daily and stores aspect ratios in memory
2. **API Endpoint:** Returns cached ratios as JSON: `{ "itemId": ratio }`
3. **JavaScript:** Fetches ratios from the server once per session and constructs the Masonry grid

## Settings (masonry.js)

```javascript
const COLUMN_WIDTH = 220;         // Target width per Masonry column
const GAP = 12;                   // Spacing between cards
const DEFAULT_RATIO = 16 / 9;     // Fallback if no ratio is found
```

The current approach deliberately uses a simple column-based Masonry layout rather than `grid-row` calculations.
This ensures that vertical and horizontal previews remain more stable visually, especially when using Jellyfin themes and lazy loading.