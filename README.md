# JellyfinMasonry Plugin

Jellyfin Plugin das Aspect Ratios aller Bibliotheks-Items cached und per API bereitstellt — für ein sauberes Masonry/Pinterest Layout.

## Installation

### Plugin bauen

```bash
cd JellyfinMasonry
dotnet publish -c Release -o ./dist
```

### Plugin installieren

1. `JellyfinMasonry.dll` nach `/config/plugins/JellyfinMasonry/` kopieren
2. Jellyfin neu starten
3. Im Dashboard unter **Geplante Aufgaben** → **"Masonry: Scan Aspect Ratios"** einmal manuell ausführen

### JavaScript Injector

`masonry.js` Inhalt in den JavaScript Injector einfügen.

## API Endpoints

| Endpoint | Beschreibung |
|---|---|
| `GET /Masonry/Ratios/{parentId}` | Ratios für eine Bibliothek |
| `POST /Masonry/Ratios/{parentId}/Refresh` | Cache für eine Bibliothek neu aufbauen |
| `POST /Masonry/Ratios/RefreshAll` | Cache für alle Bibliotheken neu aufbauen |
| `GET /Masonry/Status?parentId={id}` | Cache-Status prüfen |

## Wie es funktioniert

1. **Scheduled Task** scannt täglich alle Bibliotheken und speichert Aspect Ratios im Speicher
2. **API Endpoint** gibt die gecachten Ratios als JSON zurück: `{ "itemId": ratio }`
3. **JavaScript** holt die Ratios einmal pro Session vom Server und baut das Masonry Grid

## Einstellungen (masonry.js)

```javascript
const COLUMN_WIDTH = 220;         // Zielbreite pro Masonry-Spalte
const GAP = 12;                   // Abstand zwischen Karten
const DEFAULT_RATIO = 16 / 9;     // Fallback falls keine Ratio gefunden wird
```

Der aktuelle Ansatz nutzt bewusst ein einfaches Spalten-Masonry statt `grid-row`-Berechnungen.
Dadurch bleiben vertikale und horizontale Vorschauen stabiler sichtbar, besonders bei Jellyfin-Themes und Lazy-Loading.
