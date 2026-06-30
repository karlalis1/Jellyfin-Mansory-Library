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
const STYLE_ID = "jellyfin-masonry-left-right-styles";
const CHUNK_CLASS = "masonry-left-right-chunk";
const STATUS_CLASS = "jellyfin-masonry-left-right-status";
const LARGE_CONTAINER_THRESHOLD = 180;
const ENABLE_LITE_MODE = false;
const NO_LIMIT_THRESHOLD = 1000;
const SMALL_LIBRARY_THRESHOLD = 80;
const SMALL_LIBRARY_BATCH_SIZE = 48;
const PROCESS_DEBOUNCE_MS = 120;
const AUTO_EXPAND_DELAY_MS = 220;
const layoutMaps = {};
const ratioMaps = {};
const runningParents = new Set();
const itemDetailRatioAttempts = new Set();
const pendingContainers = new Set();
const autoExpandTimers = new WeakMap();
let layoutLookupUnavailable = false;
let layoutLookupDisabledLogged = false;
let suppressedMutationBatches = 0;
let searchContainerCounter = 0;
let processQueueTimer = null;

function debugLog(...args) {
    if (DEBUG_LOGS) {
        console.log(...args);
    }
}

function getStoredServer() {
    try {
        return JSON.parse(localStorage.getItem("jellyfin_credentials") || "{}").Servers?.[0] || null;
    } catch {
        return null;
    }
}

function getToken() {
    const stored = getStoredServer();
    return window.ApiClient?._serverInfo?.AccessToken
        || stored?.AccessToken
        || null;
}

function getUserId() {
    const stored = getStoredServer();
    return window.ApiClient?._serverInfo?.UserId
        || stored?.UserId
        || null;
}

function getServerUrl() {
    const stored = getStoredServer();
    return window.ApiClient?._serverAddress
        || window.ApiClient?.serverAddress?.()
        || stored?.ManualAddress
        || stored?.LocalAddress
        || stored?.ServerAddress
        || window.location.origin;
}

function buildUrl(path) {
    return new URL(path, getServerUrl()).toString();
}

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .itemsContainer[data-masonry-left-right-active="1"],
        .itemsContainer[data-masonry-left-right-lite="1"] {
            display: block !important;
            width: 100% !important;
            padding: 6px 4px 24px !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] > .${CHUNK_CLASS} {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(${COLUMN_MIN_WIDTH}px, 1fr)) !important;
            grid-auto-rows: ${GRID_ROW_HEIGHT}px !important;
            grid-auto-flow: row dense !important;
            gap: ${GAP}px !important;
            width: 100% !important;
            align-items: start !important;
            margin: 0 0 ${GAP}px !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"][data-masonry-left-right-search="1"] > .${CHUNK_CLASS} {
            grid-template-columns: repeat(auto-fill, minmax(${SEARCH_COLUMN_MIN_WIDTH}px, 1fr)) !important;
        }

        .itemsContainer[data-masonry-left-right-lite="1"] > .${CHUNK_CLASS} {
            display: block !important;
            column-width: ${COLUMN_MIN_WIDTH}px !important;
            column-gap: ${GAP}px !important;
            width: 100% !important;
            margin: 0 0 ${GAP}px !important;
        }

        .itemsContainer[data-masonry-left-right-lite="1"][data-masonry-left-right-search="1"] > .${CHUNK_CLASS} {
            column-width: ${SEARCH_COLUMN_MIN_WIDTH}px !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] > .${CHUNK_CLASS} > .card,
        .itemsContainer[data-masonry-left-right-lite="1"] > .${CHUNK_CLASS} > .card {
            box-sizing: border-box !important;
            overflow: visible !important;
            border-radius: 20px !important;
            transition: filter 180ms ease !important;
            filter: none !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] > .${CHUNK_CLASS} > .card {
            display: block !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        .itemsContainer[data-masonry-left-right-lite="1"] > .${CHUNK_CLASS} > .card {
            display: inline-block !important;
            width: 100% !important;
            margin: 0 0 ${GAP}px !important;
            padding: 0 !important;
            vertical-align: top !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            page-break-inside: avoid !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] > .${CHUNK_CLASS} > .card:hover,
        .itemsContainer[data-masonry-left-right-lite="1"] > .${CHUNK_CLASS} > .card:hover {
            filter: brightness(1.03) !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] > .${CHUNK_CLASS} > .card[data-masonry-left-right-visible="0"],
        .itemsContainer[data-masonry-left-right-lite="1"] > .${CHUNK_CLASS} > .card[data-masonry-left-right-visible="0"] {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] > .${CHUNK_CLASS} > .card[data-masonry-left-right-visible="reserve"],
        .itemsContainer[data-masonry-left-right-lite="1"] > .${CHUNK_CLASS} > .card[data-masonry-left-right-visible="reserve"] {
            visibility: hidden !important;
            pointer-events: none !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardBox,
        .itemsContainer[data-masonry-left-right-active="1"] .cardText,
        .itemsContainer[data-masonry-left-right-active="1"] .cardOverlayText,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardBox,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardText,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardOverlayText {
            width: 100% !important;
            height: auto !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardBox,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardBox {
            border-radius: 20px !important;
            overflow: hidden !important;
            background: rgba(26, 26, 30, 0.92) !important;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22) !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardScalable,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardScalable {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            height: 0 !important;
            overflow: hidden !important;
            border-radius: 20px 20px 0 0 !important;
            background: rgba(0, 0, 0, 0.18) !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardPadder,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardPadder {
            display: none !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardOverlayContainer,
        .itemsContainer[data-masonry-left-right-active="1"] .cardImageContainer,
        .itemsContainer[data-masonry-left-right-active="1"] .cardImage,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardOverlayContainer,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardImageContainer,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardImage {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardImageContainer,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardImageContainer {
            display: block !important;
            z-index: 1 !important;
            opacity: 1 !important;
            visibility: visible !important;
            border-radius: 20px 20px 0 0 !important;
            background-position: center center !important;
            background-repeat: no-repeat !important;
            background-size: contain !important;
            background-color: transparent !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardOverlayContainer,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardOverlayContainer {
            z-index: 2 !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardOverlayButton,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardOverlayButton {
            background: rgba(15, 15, 18, 0.72) !important;
            backdrop-filter: blur(8px) !important;
            border-radius: 999px !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardPadder .cardImageIcon,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardPadder .cardImageIcon {
            display: none !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardImage,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardImage {
            background-position: center center !important;
            background-repeat: no-repeat !important;
            background-size: contain !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] img,
        .itemsContainer[data-masonry-left-right-lite="1"] img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardText,
        .itemsContainer[data-masonry-left-right-active="1"] .cardTextCentered,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardText,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardTextCentered {
            display: block !important;
            text-align: left !important;
            padding: 10px 12px 0 !important;
            line-height: 1.35 !important;
            font-size: 0.95rem !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardText:last-child,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardText:last-child {
            padding-bottom: 12px !important;
        }

        .itemsContainer[data-masonry-left-right-active="1"] .cardText a,
        .itemsContainer[data-masonry-left-right-active="1"] .cardTextCentered a,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardText a,
        .itemsContainer[data-masonry-left-right-lite="1"] .cardTextCentered a {
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: normal !important;
            font-weight: 600 !important;
        }

        .${STATUS_CLASS} {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin: 12px 0 18px !important;
            padding: 7px 12px !important;
            border-radius: 999px !important;
            background: rgba(26, 26, 30, 0.9) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            color: rgba(255, 255, 255, 0.88) !important;
            font-size: 0.92rem !important;
            line-height: 1.2 !important;
            white-space: nowrap !important;
        }

        .${STATUS_CLASS}[data-masonry-status-state="loading"] {
            color: #ffd27a !important;
        }

        .${STATUS_CLASS}[data-masonry-status-state="complete"] {
            color: #9be59b !important;
        }
    `;

    document.head.appendChild(style);
}

function isPaginationControl(element) {
    if (!element) return false;

    const text = [
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.textContent
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (/(next|weiter|zurück|zurueck|previous|seite|page)/.test(text)) {
        return true;
    }

    return [...element.querySelectorAll(".material-icons, .material-icons-round, i")]
        .some(icon => /(navigate_next|chevron_right|keyboard_arrow_right|navigate_before|chevron_left|keyboard_arrow_left)/i.test(icon.textContent || ""));
}

function findStatusHost(container) {
    const parent = container?.parentElement;
    if (!parent) return null;

    const controls = [...parent.querySelectorAll("button, a")].filter(isPaginationControl);
    if (!controls.length) return null;

    return controls[0].closest(".listPaging, .pagingContainer, .pagination, .sectionFooter, .itemsContainerFooter")
        || controls[0].parentElement
        || null;
}

function ensureStatusElement(container) {
    const key = getContainerKey(container);
    const parent = container.parentElement;
    if (!parent) return null;

    const host = findStatusHost(container);
    if (host) {
        let element = host.querySelector(`.${STATUS_CLASS}[data-masonry-status-for="${key}"]`);
        if (!element) {
            element = document.createElement("span");
            element.className = STATUS_CLASS;
            element.dataset.masonryStatusFor = key;
            host.appendChild(element);
        }
        return element;
    }

    let element = parent.querySelector(`:scope > .${STATUS_CLASS}[data-masonry-status-for="${key}"]`);
    if (!element) {
        element = document.createElement("div");
        element.className = STATUS_CLASS;
        element.dataset.masonryStatusFor = key;
        if (container.nextSibling) {
            parent.insertBefore(element, container.nextSibling);
        } else {
            parent.appendChild(element);
        }
    }
    return element;
}

function updateMasonryStatus(container, isComplete, visibleCount, totalCount) {
    const element = ensureStatusElement(container);
    if (!element) return;

    const safeVisible = Math.min(Math.max(Number(visibleCount) || 0, 0), Number(totalCount) || 0);
    const safeTotal = Math.max(Number(totalCount) || 0, 0);
    element.dataset.masonryStatusState = isComplete ? "complete" : "loading";
    element.textContent = isComplete
        ? `Masonry: alle Items dieser Seite geladen (${safeVisible}/${safeTotal})`
        : `Masonry: lädt noch (${safeVisible}/${safeTotal})`;
}

function ensureParentRatioMap(parentId) {
    if (!ratioMaps[parentId]) {
        ratioMaps[parentId] = {};
    }

    return ratioMaps[parentId];
}

function ensureParentLayoutMap(parentId) {
    if (!layoutMaps[parentId]) {
        layoutMaps[parentId] = {};
    }

    return layoutMaps[parentId];
}

async function fetchLayoutForIds(parentId, ids) {
    const layoutMap = ensureParentLayoutMap(parentId);
    const idsToLoad = ids.filter(id => id && !layoutMap[id]);

    if (!idsToLoad.length || layoutLookupUnavailable) {
        return layoutMap;
    }

    for (let i = 0; i < idsToLoad.length; i += RATIO_REQUEST_BATCH_SIZE) {
        const batch = idsToLoad.slice(i, i + RATIO_REQUEST_BATCH_SIZE);

        try {
            const res = await fetch(buildUrl("/Masonry/Layout/Lookup"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Emby-Token": getToken()
                },
                body: JSON.stringify({
                    parentId,
                    itemIds: batch
                })
            });

            if (!res.ok) {
                if (res.status === 404 || res.status === 405) {
                    layoutLookupUnavailable = true;
                    if (!layoutLookupDisabledLogged) {
                        layoutLookupDisabledLogged = true;
                        console.warn(`Masonry left-right layout lookup unavailable (${res.status}), using ratio fallback only.`);
                    }
                    return layoutMap;
                }
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            Object.assign(layoutMap, data || {});
        } catch (e) {
            console.warn("Masonry left-right layout lookup failed, fallback to ratio-based flow:", e);
        }
    }

    return layoutMap;
}

async function fetchRatiosForIds(parentId, ids) {
    const ratioMap = ensureParentRatioMap(parentId);
    const idsToLoad = ids.filter(id => id && !ratioMap[id]);

    if (!idsToLoad.length) {
        return ratioMap;
    }

    for (let i = 0; i < idsToLoad.length; i += RATIO_REQUEST_BATCH_SIZE) {
        const batch = idsToLoad.slice(i, i + RATIO_REQUEST_BATCH_SIZE);

        try {
            const res = await fetch(buildUrl("/Masonry/Ratios/Lookup"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Emby-Token": getToken()
                },
                body: JSON.stringify({
                    parentId,
                    itemIds: batch
                })
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            Object.assign(ratioMap, data || {});
        } catch (e) {
            console.warn("Masonry left-right ratio lookup failed, fallback to Jellyfin item API:", e);
        }
    }

    return ratioMap;
}

async function getRatiosFallback(parentId, ids) {
    const ratioMap = ensureParentRatioMap(parentId);
    const userId = getUserId();
    const idsToLoad = ids.filter(id => id && !ratioMap[id]);

    for (let i = 0; i < idsToLoad.length; i += 50) {
        const batchIds = idsToLoad.slice(i, i + 50);
        const batch = batchIds.join(",");

        try {
            const query = userId
                ? `/Items?Ids=${batch}&Fields=PrimaryImageAspectRatio&UserId=${userId}`
                : `/Items?Ids=${batch}&Fields=PrimaryImageAspectRatio`;
            const res = await fetch(buildUrl(query), {
                headers: { "X-Emby-Token": getToken() }
            });
            const data = await res.json();

            data.Items?.forEach(item => {
                if (item.PrimaryImageAspectRatio) {
                    ratioMap[item.Id] = item.PrimaryImageAspectRatio;
                }
            });
        } catch (e) {
            console.warn("Masonry left-right fallback fetch error:", e);
        }
    }

    return ratioMap;
}

function extractRatioFromItem(item) {
    const width = Number(item?.Width);
    const height = Number(item?.Height);
    if (width > 0 && height > 0) {
        return width / height;
    }

    const mediaSources = Array.isArray(item?.MediaSources) ? item.MediaSources : [];
    for (const mediaSource of mediaSources) {
        const mediaStreams = Array.isArray(mediaSource?.MediaStreams) ? mediaSource.MediaStreams : [];
        const videoStream = mediaStreams.find(stream =>
            stream?.Type === "Video" || stream?.Type === 1 || stream?.IsExternal === false
        );
        const streamWidth = Number(videoStream?.Width);
        const streamHeight = Number(videoStream?.Height);
        if (streamWidth > 0 && streamHeight > 0) {
            return streamWidth / streamHeight;
        }
    }

    const directAspectRatio = Number(item?.PrimaryImageAspectRatio);
    if (directAspectRatio > 0) {
        return directAspectRatio;
    }

    return null;
}

function getItemDetailAttemptKey(parentId, id) {
    return `${parentId}:${id}`;
}

async function hydrateRatiosFromItemDetails(parentId, ids, baseRatioMap) {
    const userId = getUserId();
    if (!userId) {
        return baseRatioMap;
    }

    const ratioMap = ensureParentRatioMap(parentId);
    Object.assign(ratioMap, baseRatioMap || {});
    const idsToLoad = ids.filter(id => {
        if (!id || ratioMap[id]) {
            return false;
        }

        const key = getItemDetailAttemptKey(parentId, id);
        if (itemDetailRatioAttempts.has(key)) {
            return false;
        }

        itemDetailRatioAttempts.add(key);
        return true;
    });

    if (!idsToLoad.length) {
        return ratioMap;
    }

    for (let i = 0; i < idsToLoad.length; i += 50) {
        const batch = idsToLoad.slice(i, i + 50).join(",");

        try {
            const query = `/Users/${userId}/Items?Ids=${batch}&Fields=Width,Height,MediaSources,PrimaryImageAspectRatio`;
            const res = await fetch(buildUrl(query), {
                headers: { "X-Emby-Token": getToken() }
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            data.Items?.forEach(item => {
                const ratio = extractRatioFromItem(item);
                if (ratio && ratio > 0) {
                    ratioMap[item.Id] = ratio;
                }
            });
        } catch (e) {
            console.warn("Masonry left-right item detail ratio fetch error:", e);
        }
    }

    return ratioMap;
}

function getShape(ratio) {
    if (ratio < 0.9) return "portrait";
    if (ratio > 1.2) return "landscape";
    return "square";
}

function estimateRowSpan(ratio, container) {
    if (isLiteContainer(container)) {
        return null;
    }

    const numericRatio = Number(ratio);
    const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
        ? numericRatio
        : DEFAULT_RATIO;
    const columnWidth = isSearchContainer(container)
        ? SEARCH_COLUMN_MIN_WIDTH
        : COLUMN_MIN_WIDTH;
    const imageHeight = columnWidth / safeRatio;
    return Math.max(1, Math.ceil((imageHeight + CARD_TEXT_HEIGHT + GAP) / (GRID_ROW_HEIGHT + GAP)));
}

function getRatioKey(ratio) {
    const numericRatio = Number(ratio);
    const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
        ? numericRatio
        : DEFAULT_RATIO;
    return safeRatio.toFixed(6);
}

function isProcessableMediaCard(card) {
    if (!card?.dataset?.id) return false;
    if (card.dataset.isfolder === "true") return false;
    return true;
}

function getLayoutCards(container) {
    return [...container.querySelectorAll(".card[data-id]")];
}

function getChunkWrappers(container) {
    return [...container.children].filter(child => child.classList?.contains(CHUNK_CLASS));
}

function suppressInternalMutations(callback) {
    suppressedMutationBatches += 1;

    try {
        callback();
    } finally {
        window.setTimeout(() => {
            suppressedMutationBatches = Math.max(0, suppressedMutationBatches - 1);
        }, 0);
    }
}

function ensureChunkWrappers(container, cards) {
    suppressInternalMutations(() => {
        const existingWrappers = new Map(
            getChunkWrappers(container).map(wrapper => [Number(wrapper.dataset.masonryChunkIndex), wrapper])
        );
        const usedWrappers = [];

        cards.forEach((card, index) => {
            const chunkIndex = Math.floor(index / CHUNK_SIZE);
            let wrapper = existingWrappers.get(chunkIndex);

            if (!wrapper) {
                wrapper = document.createElement("div");
                wrapper.className = CHUNK_CLASS;
                wrapper.dataset.masonryChunkIndex = String(chunkIndex);
                existingWrappers.set(chunkIndex, wrapper);
            }

            usedWrappers[chunkIndex] = wrapper;
            if (card.parentElement !== wrapper) {
                wrapper.appendChild(card);
            }
        });

        usedWrappers.filter(Boolean).forEach(wrapper => {
            container.appendChild(wrapper);
        });

        getChunkWrappers(container).forEach(wrapper => {
            if (!usedWrappers.includes(wrapper) || !wrapper.children.length) {
                wrapper.remove();
            }
        });
    });
}

function getCurrentHash() {
    return (window.location.hash || "").toLowerCase();
}

function isSearchPage() {
    return getCurrentHash().includes("search");
}

function isHomePage() {
    const hash = getCurrentHash();
    return !hash
        || hash === "#"
        || hash === "#/"
        || hash.startsWith("#/home")
        || hash.startsWith("#/index")
        || hash.startsWith("#/mypreferencesmenu");
}

function shouldProcessContainer(container) {
    if (!container || !getLayoutCards(container).length) {
        return false;
    }

    if (isSearchPage()) {
        return true;
    }

    if (isHomePage()) {
        return false;
    }

    return Boolean(container.dataset.parentid);
}

function getMasonryContainers() {
    return [...document.querySelectorAll(".itemsContainer")]
        .filter(shouldProcessContainer);
}

function shouldUseLiteMode(container, totalCards) {
    if (isNoLimitLibrary(totalCards)) {
        return false;
    }

    if (!ENABLE_LITE_MODE) {
        return false;
    }

    return !isSearchContainer(container) && totalCards >= LARGE_CONTAINER_THRESHOLD;
}

function isNoLimitLibrary(totalCards) {
    return Number(totalCards) > 0 && Number(totalCards) <= NO_LIMIT_THRESHOLD;
}

function isSmallLibrary(totalCards) {
    return Number(totalCards) > 0 && Number(totalCards) <= SMALL_LIBRARY_THRESHOLD;
}

function getEffectiveInitialLimit(totalCards) {
    if (isNoLimitLibrary(totalCards)) {
        return totalCards;
    }

    return isSmallLibrary(totalCards)
        ? totalCards
        : INITIAL_CARD_LIMIT;
}

function getEffectiveBatchSize(totalCards) {
    if (isNoLimitLibrary(totalCards)) {
        return Math.max(BATCH_SIZE, totalCards);
    }

    return isSmallLibrary(totalCards)
        ? Math.max(BATCH_SIZE, Math.min(SMALL_LIBRARY_BATCH_SIZE, totalCards))
        : BATCH_SIZE;
}

function getEffectiveExpandStep(container, totalCards) {
    if (isNoLimitLibrary(totalCards)) {
        return totalCards;
    }

    if (isSmallLibrary(totalCards)) {
        return totalCards;
    }

    return isLiteContainer(container)
        ? Math.max(SCROLL_INCREMENT * 3, BATCH_SIZE)
        : SCROLL_INCREMENT;
}

function isLiteContainer(container) {
    return container?.dataset?.masonryLeftRightLite === "1";
}

function setCardVisibility(card, visibilityState) {
    const nextValue = visibilityState === true
        ? "1"
        : (visibilityState === false ? "0" : (visibilityState || "0"));
    if (card.dataset.masonryLeftRightVisible === nextValue) {
        return;
    }

    card.dataset.masonryLeftRightVisible = nextValue;
    if (nextValue === "0") {
        card.style.gridRowEnd = "";
        card.dataset.masonryAppliedSpan = "";
    }
}

function syncCardVisibility(allCards, visibleLimit, reserveLimit) {
    allCards.forEach((card, index) => {
        if (index < visibleLimit) {
            setCardVisibility(card, "1");
            return;
        }

        if (index < reserveLimit) {
            setCardVisibility(card, "reserve");
            return;
        }

        setCardVisibility(card, "0");
    });
}

function scheduleContainer(container) {
    if (!shouldProcessContainer(container)) {
        return;
    }

    pendingContainers.add(container);
    if (processQueueTimer) {
        return;
    }

    processQueueTimer = window.setTimeout(() => {
        processQueueTimer = null;
        const containers = [...pendingContainers].filter(shouldProcessContainer);
        pendingContainers.clear();
        containers.forEach(processContainer);
    }, PROCESS_DEBOUNCE_MS);
}

function scheduleAllContainers() {
    getMasonryContainers().forEach(scheduleContainer);
}

function collectRelevantContainersFromNode(node, containerSet) {
    if (!(node instanceof Element)) {
        return;
    }

    if (node.matches(".itemsContainer")) {
        containerSet.add(node);
    }

    const closestContainer = node.closest(".itemsContainer");
    if (closestContainer) {
        containerSet.add(closestContainer);
    }

    if (node.matches(".card[data-id]")) {
        const cardContainer = node.closest(".itemsContainer");
        if (cardContainer) {
            containerSet.add(cardContainer);
        }
    }

    node.querySelectorAll?.(".itemsContainer").forEach(container => {
        containerSet.add(container);
    });
}

function clearAutoExpandTimer(container) {
    const timerInfo = autoExpandTimers.get(container);
    if (!timerInfo) {
        return;
    }

    if (timerInfo.type === "idle") {
        window.cancelIdleCallback?.(timerInfo.id);
    } else {
        clearTimeout(timerInfo.id);
    }

    autoExpandTimers.delete(container);
}

function scheduleAutoExpand(container) {
    if (!container || autoExpandTimers.has(container) || runningParents.has(getContainerKey(container))) {
        return;
    }

    const cards = getLayoutCards(container);
    if (!cards.length) {
        return;
    }

    if (getContainerCardLimit(container, cards.length) >= cards.length) {
        clearAutoExpandTimer(container);
        return;
    }

    const step = getEffectiveExpandStep(container, cards.length);
    const runExpand = deadline => {
        autoExpandTimers.delete(container);

        if (!container.isConnected || !shouldProcessContainer(container)) {
            return;
        }

        if (deadline && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 6) {
            scheduleAutoExpand(container);
            return;
        }

        const currentCards = getLayoutCards(container);
        if (!currentCards.length) {
            return;
        }

        if (increaseContainerCardLimit(container, currentCards.length, step)) {
            scheduleContainer(container);
            scheduleAutoExpand(container);
        }
    };

    if (isSmallLibrary(cards.length)) {
        const id = window.setTimeout(() => runExpand(null), 0);
        autoExpandTimers.set(container, { type: "timeout", id });
        return;
    }

    if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(runExpand, { timeout: AUTO_EXPAND_DELAY_MS * 2 });
        autoExpandTimers.set(container, { type: "idle", id });
        return;
    }

    const id = window.setTimeout(() => runExpand(null), AUTO_EXPAND_DELAY_MS);
    autoExpandTimers.set(container, { type: "timeout", id });
}

function getContainerKey(container) {
    if (container.dataset.parentid) {
        return container.dataset.parentid;
    }

    if (!container.dataset.masonrySearchKey) {
        searchContainerCounter += 1;
        container.dataset.masonrySearchKey = `search-${searchContainerCounter}`;
    }

    return container.dataset.masonrySearchKey;
}

function isSearchContainer(container) {
    return shouldProcessContainer(container) && !container.dataset.parentid;
}

function isPhotoLikeCard(card) {
    const type = (card?.dataset?.type || "").toLowerCase();
    const mediaType = (card?.dataset?.mediatype || "").toLowerCase();
    return type === "photo" || mediaType === "photo";
}

function normalizeRatioForContainer(ratio, container, card) {
    const numericRatio = Number(ratio);
    const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
        ? numericRatio
        : DEFAULT_RATIO;

    if (!isSearchContainer(container)) {
        return safeRatio;
    }

    if (isPhotoLikeCard(card)) {
        const photoRatio = Math.min(Math.max(safeRatio, SEARCH_PHOTO_RATIO_MIN), SEARCH_PHOTO_RATIO_MAX);
        return (photoRatio * (1 - SEARCH_PHOTO_RATIO_BLEND)) + (1 * SEARCH_PHOTO_RATIO_BLEND);
    }

    const clampedRatio = Math.min(Math.max(safeRatio, SEARCH_RATIO_MIN), SEARCH_RATIO_MAX);
    let targetRatio = 1;

    if (clampedRatio < 0.95) {
        targetRatio = 0.9;
    } else if (clampedRatio > 1.12) {
        targetRatio = 1.18;
    }

    return (clampedRatio * (1 - SEARCH_RATIO_BLEND)) + (targetRatio * SEARCH_RATIO_BLEND);
}

function needsMasonryUpdate(card, ratio) {
    const ratioKey = getRatioKey(ratio);
    return card.dataset.masonryDone !== "1"
        || card.dataset.masonryId !== (card.dataset.id || "")
        || card.dataset.masonryAppliedRatio !== ratioKey;
}

function getLayoutInfoValue(layoutInfo, ...keys) {
    if (!layoutInfo) {
        return undefined;
    }

    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(layoutInfo, key)) {
            return layoutInfo[key];
        }
    }

    return undefined;
}

function getPreferredRowSpan(layoutInfo, container) {
    if (!layoutInfo) {
        return null;
    }

    const rawSpan = isSearchContainer(container)
        ? getLayoutInfoValue(layoutInfo, "searchRowSpan", "SearchRowSpan")
        : getLayoutInfoValue(layoutInfo, "defaultRowSpan", "DefaultRowSpan");
    const numericSpan = Number(rawSpan);
    return Number.isFinite(numericSpan) && numericSpan > 0
        ? Math.max(1, Math.floor(numericSpan))
        : null;
}

function getCardLayoutData(card, container, layoutMap, ratioMap) {
    const layoutInfo = layoutMap?.[card.dataset.id];

    if (layoutInfo) {
        const rawRatio = isSearchContainer(container)
            ? (
                getLayoutInfoValue(layoutInfo, "searchAppliedRatio", "SearchAppliedRatio")
                ?? getLayoutInfoValue(layoutInfo, "appliedRatio", "AppliedRatio")
                ?? getLayoutInfoValue(layoutInfo, "ratio", "Ratio")
            )
            : (
                getLayoutInfoValue(layoutInfo, "appliedRatio", "AppliedRatio")
                ?? getLayoutInfoValue(layoutInfo, "ratio", "Ratio")
            );
        const numericRatio = Number(rawRatio);
        const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
            ? numericRatio
            : DEFAULT_RATIO;
        const preferredShape = isSearchContainer(container)
            ? (
                getLayoutInfoValue(layoutInfo, "searchShape", "SearchShape")
                || getLayoutInfoValue(layoutInfo, "shape", "Shape")
                || getShape(safeRatio)
            )
            : (
                getLayoutInfoValue(layoutInfo, "shape", "Shape")
                || getShape(safeRatio)
            );

        return {
            ratio: safeRatio,
            rowSpan: isLiteContainer(container) ? null : getPreferredRowSpan(layoutInfo, container),
            shape: preferredShape,
            fromServer: true
        };
    }

    const rawRatio = ratioMap?.[card.dataset.id] || card.dataset.masonryRatio || DEFAULT_RATIO;
    const normalizedRatio = normalizeRatioForContainer(rawRatio, container, card);
    return {
        ratio: normalizedRatio,
        rowSpan: estimateRowSpan(normalizedRatio, container),
        shape: getShape(normalizedRatio),
        fromServer: false
    };
}

function needsLayoutUpdate(card, layoutData) {
    if (!needsMasonryUpdate(card, layoutData.ratio)) {
        if (layoutData.rowSpan) {
            return card.dataset.masonryAppliedSpan !== String(layoutData.rowSpan);
        }

        return false;
    }

    return true;
}

function getCardsToProcess(cards, layoutMap, ratioMap, container) {
    return cards.filter(card => {
        const layoutData = getCardLayoutData(card, container, layoutMap, ratioMap);
        return needsLayoutUpdate(card, layoutData);
    });
}

function getContainerCardLimit(container, totalCards) {
    const effectiveInitialLimit = getEffectiveInitialLimit(totalCards);
    const rawLimit = Number(container.dataset.masonryLeftRightLimit || effectiveInitialLimit);
    const safeLimit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.floor(rawLimit)
        : effectiveInitialLimit;
    const normalizedLimit = Math.min(Math.max(safeLimit, effectiveInitialLimit), totalCards);
    container.dataset.masonryLeftRightLimit = String(normalizedLimit);
    return normalizedLimit;
}

function increaseContainerCardLimit(container, totalCards, increment = SCROLL_INCREMENT) {
    const currentLimit = getContainerCardLimit(container, totalCards);
    if (currentLimit >= totalCards) return false;

    const safeIncrement = Number.isFinite(increment) && increment > 0
        ? Math.floor(increment)
        : SCROLL_INCREMENT;
    const nextLimit = Math.min(currentLimit + safeIncrement, totalCards);
    if (nextLimit === currentLimit) return false;

    container.dataset.masonryLeftRightLimit = String(nextLimit);
    return true;
}

function hideCards(cards) {
    cards.forEach(card => setCardVisibility(card, false));
}

function showCards(cards) {
    cards.forEach(card => setCardVisibility(card, true));
}

function waitForNextFrame() {
    return new Promise(resolve => {
        requestAnimationFrame(() => resolve());
    });
}

async function waitForLayoutStabilization() {
    await waitForNextFrame();
    await waitForNextFrame();
}

function applyMasonryToCard(card, container, ratio, rowSpan = null, preferredShape = null) {
    const numericRatio = Number(ratio);
    const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
        ? numericRatio
        : DEFAULT_RATIO;
    const ratioKey = getRatioKey(safeRatio);
    const safeRowSpan = Number.isFinite(Number(rowSpan)) && Number(rowSpan) > 0
        ? Math.max(1, Math.floor(Number(rowSpan)))
        : null;
    const scalable = card.querySelector(".cardScalable");
    const overlay = card.querySelector(".cardOverlayContainer");
    const imageContainer = card.querySelector(".cardImageContainer");
    const image = card.querySelector(".cardImage");
    const cardBox = card.querySelector(".cardBox");
    const padder = card.querySelector(".cardPadder");

    if (!scalable && !imageContainer) return false;
    if (!needsLayoutUpdate(card, {
        ratio: safeRatio,
        rowSpan: safeRowSpan
    })) return false;

    card.dataset.masonryRatio = String(safeRatio);
    card.dataset.masonryShape = preferredShape || getShape(safeRatio);
    card.dataset.masonryDone = "1";
    card.dataset.masonryId = card.dataset.id || "";
    card.dataset.masonryAppliedRatio = ratioKey;
    card.dataset.masonryAppliedSpan = safeRowSpan ? String(safeRowSpan) : "";

    card.style.width = "100%";
    card.style.margin = "0";
    card.style.padding = "0";
    card.style.boxSizing = "border-box";
    card.style.borderRadius = "20px";

    if (cardBox) {
        cardBox.style.borderRadius = "20px";
        cardBox.style.overflow = "hidden";
    }

    if (scalable) {
        scalable.style.display = "block";
        scalable.style.position = "relative";
        scalable.style.width = "100%";
        scalable.style.height = "0";
        scalable.style.paddingBottom = `${100 / safeRatio}%`;
        scalable.style.overflow = "hidden";
        scalable.style.borderRadius = "20px 20px 0 0";
    }

    if (padder) {
        padder.style.display = "none";
        padder.style.height = "0";
        padder.style.paddingBottom = "0";
        padder.style.minHeight = "0";
    }

    if (imageContainer) {
        imageContainer.style.position = "relative";
        imageContainer.style.width = "100%";
        imageContainer.style.height = "auto";
        imageContainer.style.aspectRatio = String(safeRatio);
        imageContainer.style.overflow = "hidden";
        imageContainer.style.borderRadius = "20px 20px 0 0";
    }

    [overlay, imageContainer, image].forEach(element => {
        if (!element) return;
        element.style.position = "absolute";
        element.style.inset = "0";
        element.style.width = "100%";
        element.style.height = "100%";
    });

    if (imageContainer) {
        imageContainer.style.display = "block";
        imageContainer.style.opacity = "1";
        imageContainer.style.visibility = "visible";
        imageContainer.style.backgroundPosition = "center center";
        imageContainer.style.backgroundRepeat = "no-repeat";
        imageContainer.style.backgroundSize = "contain";
        imageContainer.style.backgroundColor = "transparent";
        imageContainer.style.borderRadius = "20px 20px 0 0";
        imageContainer.style.zIndex = "1";
    }

    if (overlay) {
        overlay.style.zIndex = "2";
    }

    if (image) {
        image.style.backgroundPosition = "center center";
        image.style.backgroundRepeat = "no-repeat";
        image.style.backgroundSize = "contain";
    }

    if (safeRowSpan && !isLiteContainer(container)) {
        card.style.gridRowEnd = `span ${safeRowSpan}`;
    }

    return true;
}

function layoutCardsInContainer(container, cards, layoutMap) {
    if (isLiteContainer(container)) {
        return;
    }

    const rowHeight = GRID_ROW_HEIGHT;
    const rowGap = GAP;

    cards.forEach(card => {
        const preferredRowSpan = getPreferredRowSpan(layoutMap?.[card.dataset.id], container);
        if (preferredRowSpan) {
            card.style.gridRowEnd = `span ${preferredRowSpan}`;
            card.dataset.masonryAppliedSpan = String(preferredRowSpan);
            return;
        }

        const measuredHeight = Math.max(card.offsetHeight, Math.ceil(card.getBoundingClientRect().height));
        const rowSpan = Math.max(1, Math.ceil((measuredHeight + rowGap) / (rowHeight + rowGap)));
        card.style.gridRowEnd = `span ${rowSpan}`;
        card.dataset.masonryAppliedSpan = String(rowSpan);
    });
}

function needsMeasuredLayout(container, cards, layoutMap) {
    if (isLiteContainer(container)) {
        return false;
    }

    return cards.some(card => !getPreferredRowSpan(layoutMap?.[card.dataset.id], container));
}

async function processContainer(container) {
    if (!container) return;

    const parentId = container.dataset.parentid || null;
    const containerKey = getContainerKey(container);
    if (runningParents.has(containerKey)) return;

    runningParents.add(containerKey);
    let shouldContinueAutoExpand = false;

    try {
        ensureStyles();
        ensureChunkWrappers(container, getLayoutCards(container));
        const allCards = getLayoutCards(container);
        if (!allCards.length) return;
        const useLiteMode = shouldUseLiteMode(container, allCards.length);
        container.dataset.masonryLeftRightActive = useLiteMode ? "0" : "1";
        container.dataset.masonryLeftRightLite = useLiteMode ? "1" : "0";
        container.dataset.masonryLeftRightSearch = isSearchContainer(container) ? "1" : "0";

        let layoutMap = ensureParentLayoutMap(containerKey);
        let ratioMap = ensureParentRatioMap(containerKey);
        const currentLimit = getContainerCardLimit(container, allCards.length);
        const reserveStep = getEffectiveExpandStep(container, allCards.length);
        const reserveLimit = Math.min(currentLimit + reserveStep, allCards.length);
        const visibleCards = allCards.slice(0, currentLimit);
        const preparedCards = allCards.slice(0, reserveLimit);
        syncCardVisibility(allCards, currentLimit, reserveLimit);
        updateMasonryStatus(container, currentLimit >= allCards.length, currentLimit, allCards.length);

        const cardsToProcess = getCardsToProcess(preparedCards, layoutMap, ratioMap, container);
        const idsToProcess = cardsToProcess
            .filter(isProcessableMediaCard)
            .map(card => card.dataset.id)
            .filter(Boolean);

        if (idsToProcess.length) {
            if (parentId) {
                layoutMap = await fetchLayoutForIds(parentId, idsToProcess);
            }

            const missingLayoutIds = idsToProcess.filter(id => !layoutMap?.[id]);
            if (missingLayoutIds.length) {
                if (parentId) {
                    ratioMap = await fetchRatiosForIds(parentId, missingLayoutIds);
                }

                ratioMap = await getRatiosFallback(containerKey, missingLayoutIds);
                ratioMap = await hydrateRatiosFromItemDetails(containerKey, missingLayoutIds, ratioMap);
            }
        }

        const effectiveBatchSize = getEffectiveBatchSize(allCards.length);
        for (let index = 0; index < cardsToProcess.length; index += effectiveBatchSize) {
            const batch = cardsToProcess.slice(index, index + effectiveBatchSize);

            for (const card of batch) {
                const layoutData = getCardLayoutData(card, container, layoutMap, ratioMap);
                applyMasonryToCard(card, container, layoutData.ratio, layoutData.rowSpan, layoutData.shape);
            }

            if (index + effectiveBatchSize < cardsToProcess.length) {
                await waitForNextFrame();
            }
        }

        visibleCards.forEach(card => {
            if (!isProcessableMediaCard(card) && !card.dataset.masonryDone) {
                applyMasonryToCard(card, container, normalizeRatioForContainer(DEFAULT_RATIO, container, card));
            }
        });

        if (needsMeasuredLayout(container, visibleCards, layoutMap)) {
            await waitForLayoutStabilization();
            layoutCardsInContainer(container, visibleCards, layoutMap);
        }

        updateMasonryStatus(container, currentLimit >= allCards.length, currentLimit, allCards.length);
        shouldContinueAutoExpand = currentLimit < allCards.length;
    } finally {
        runningParents.delete(containerKey);
        if (shouldContinueAutoExpand) {
            scheduleAutoExpand(container);
        }
    }
}

function triggerProcessLeftRight() {
    if (!getMasonryContainers().length) {
        return;
    }

    scheduleAllContainers();
}

new MutationObserver(mutations => {
    if (suppressedMutationBatches > 0) {
        return;
    }

    const containersToSchedule = new Set();

    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => collectRelevantContainersFromNode(node, containersToSchedule));
        mutation.removedNodes.forEach(node => {
            if (node.parentElement) {
                collectRelevantContainersFromNode(node.parentElement, containersToSchedule);
            }
        });
    });

    if (!containersToSchedule.size) {
        return;
    }

    containersToSchedule.forEach(scheduleContainer);
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener("resize", () => {
    clearTimeout(window._masonryLeftRightResizeTimer);
    window._masonryLeftRightResizeTimer = setTimeout(triggerProcessLeftRight, 200);
});

window.triggerProcessLeftRight = triggerProcessLeftRight;
setTimeout(triggerProcessLeftRight, 1000);
setTimeout(triggerProcessLeftRight, 2500);
