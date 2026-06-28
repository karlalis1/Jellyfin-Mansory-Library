const COLUMN_WIDTH = 236;
const GAP = 14;
const DEFAULT_RATIO = 16 / 9;
const STYLE_ID = "jellyfin-masonry-plugin-styles";
const ratioMaps = {};
const runningParents = new Set();
const ratioDetailHydratedParents = new Set();

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
        .itemsContainer[data-masonry-active="1"] {
            display: block !important;
            column-width: ${COLUMN_WIDTH}px !important;
            column-gap: ${GAP}px !important;
            width: 100% !important;
            padding: 6px 4px 24px !important;
        }

        .itemsContainer[data-masonry-active="1"] > .card {
            display: inline-block !important;
            width: 100% !important;
            margin: 0 0 ${GAP}px !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            vertical-align: top !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
            border-radius: 20px !important;
            transition: transform 180ms ease, filter 180ms ease !important;
            filter: none !important;
        }

        .itemsContainer[data-masonry-active="1"] > .card:hover {
            transform: translateY(-2px) !important;
            filter: brightness(1.03) !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardBox,
        .itemsContainer[data-masonry-active="1"] .cardText,
        .itemsContainer[data-masonry-active="1"] .cardOverlayText {
            width: 100% !important;
            height: auto !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardBox {
            border-radius: 20px !important;
            overflow: hidden !important;
            background: rgba(26, 26, 30, 0.92) !important;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22) !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardScalable {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            height: 0 !important;
            overflow: hidden !important;
            border-radius: 20px 20px 0 0 !important;
            background: rgba(0, 0, 0, 0.18) !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardPadder {
            display: none !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardOverlayContainer,
        .itemsContainer[data-masonry-active="1"] .cardImageContainer,
        .itemsContainer[data-masonry-active="1"] .cardImage {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardImageContainer {
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

        .itemsContainer[data-masonry-active="1"] .cardOverlayContainer {
            z-index: 2 !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardOverlayButton {
            background: rgba(15, 15, 18, 0.72) !important;
            backdrop-filter: blur(8px) !important;
            border-radius: 999px !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardPadder .cardImageIcon {
            display: none !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardImage {
            background-position: center center !important;
            background-repeat: no-repeat !important;
            background-size: contain !important;
        }

        .itemsContainer[data-masonry-active="1"] img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardText,
        .itemsContainer[data-masonry-active="1"] .cardTextCentered {
            display: block !important;
            text-align: left !important;
            padding: 10px 12px 0 !important;
            line-height: 1.35 !important;
            font-size: 0.95rem !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardText:last-child {
            padding-bottom: 12px !important;
        }

        .itemsContainer[data-masonry-active="1"] .cardText a,
        .itemsContainer[data-masonry-active="1"] .cardTextCentered a {
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: normal !important;
            font-weight: 600 !important;
        }

        .itemsContainer[data-masonry-active="1"] .card[data-masonry-shape="portrait"] .cardImageContainer {
            background-color: rgba(0, 0, 0, 0.3) !important;
        }

        .itemsContainer[data-masonry-active="1"] .card[data-masonry-shape="portrait"] .cardBox {
            background: rgba(24, 24, 28, 0.94) !important;
        }
    `;

    document.head.appendChild(style);
}

async function getRatios(parentId) {
    if (ratioMaps[parentId]) return ratioMaps[parentId];

    try {
        const res = await fetch(
            buildUrl(`/Masonry/Ratios/${parentId}`),
            { headers: { "X-Emby-Token": getToken() } }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        ratioMaps[parentId] = data;
        console.log("Masonry: Ratios vom Server geladen:", Object.keys(data).length, "Items");
        return data;
    } catch (e) {
        console.warn("Masonry Plugin nicht erreichbar, fallback auf Jellyfin Items API:", e);
        return null;
    }
}

async function getRatiosFallback(ids) {
    const ratioMap = {};
    const userId = getUserId();

    for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50).join(",");

        try {
            const query = userId
                ? `/Items?Ids=${batch}&Fields=PrimaryImageAspectRatio&UserId=${userId}`
                : `/Items?Ids=${batch}&Fields=PrimaryImageAspectRatio`;
            const res = await fetch(
                buildUrl(query),
                { headers: { "X-Emby-Token": getToken() } }
            );
            const data = await res.json();

            data.Items?.forEach(item => {
                if (item.PrimaryImageAspectRatio) {
                    ratioMap[item.Id] = item.PrimaryImageAspectRatio;
                }
            });
        } catch (e) {
            console.warn("Masonry fallback fetch error:", e);
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

async function hydrateRatiosFromItemDetails(parentId, cards, baseRatioMap) {
    if (ratioDetailHydratedParents.has(parentId)) {
        return baseRatioMap;
    }

    const userId = getUserId();
    if (!userId) {
        return baseRatioMap;
    }

    const ratioMap = { ...(baseRatioMap || {}) };
    const ids = cards
        .map(card => card.dataset.id)
        .filter(Boolean);

    for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50).join(",");

        try {
            const query = `/Users/${userId}/Items?Ids=${batch}&Fields=Width,Height,MediaSources,PrimaryImageAspectRatio`;
            const res = await fetch(
                buildUrl(query),
                { headers: { "X-Emby-Token": getToken() } }
            );

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
            console.warn("Masonry item detail ratio fetch error:", e);
        }
    }

    ratioMaps[parentId] = ratioMap;
    ratioDetailHydratedParents.add(parentId);
    return ratioMap;
}

function getShape(ratio) {
    if (ratio < 0.9) return "portrait";
    if (ratio > 1.2) return "landscape";
    return "square";
}

function applyMasonryToCard(card, ratio) {
    const numericRatio = Number(ratio);
    const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
        ? numericRatio
        : DEFAULT_RATIO;
    const scalable = card.querySelector(".cardScalable");
    const overlay = card.querySelector(".cardOverlayContainer");
    const imageContainer = card.querySelector(".cardImageContainer");
    const image = card.querySelector(".cardImage");
    const cardBox = card.querySelector(".cardBox");
    const padder = card.querySelector(".cardPadder");

    if (!scalable && !imageContainer) return false;

    card.dataset.masonryRatio = String(safeRatio);
    card.dataset.masonryShape = getShape(safeRatio);
    card.dataset.masonryDone = "1";
    card.dataset.masonryId = card.dataset.id || "";

    card.style.width = "100%";
    card.style.margin = `0 0 ${GAP}px 0`;
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
        padder.style.overflow = "hidden";
        padder.style.borderRadius = "20px 20px 0 0";
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

    return true;
}

async function processContainer(container) {
    if (!container) return;

    const parentId = container.dataset.parentid;
    if (!parentId) return;
    if (runningParents.has(parentId)) return;

    runningParents.add(parentId);

    try {
        ensureStyles();
        container.dataset.masonryActive = "1";

        const cards = [...container.querySelectorAll(".card[data-id]")];
        if (!cards.length) return;

        let ratioMap = ratioMaps[parentId] || null;
        if (!ratioMap) {
            ratioMap = await getRatios(parentId);
        }

        if (!ratioMap) {
            const ids = cards.map(card => card.dataset.id).filter(Boolean);
            ratioMap = await getRatiosFallback(ids);
        }

        ratioMap = await hydrateRatiosFromItemDetails(parentId, cards, ratioMap);

        let changedCount = 0;
        cards.forEach(card => {
            const ratio = ratioMap?.[card.dataset.id] || card.dataset.masonryRatio || DEFAULT_RATIO;
            if (applyMasonryToCard(card, ratio)) {
                changedCount += 1;
            }
        });

        if (changedCount) {
            console.log("Masonry: Container verarbeitet:", changedCount, "Karten");
        }
    } finally {
        runningParents.delete(parentId);
    }
}

function triggerProcess() {
    document.querySelectorAll(".itemsContainer[data-parentid]").forEach(processContainer);
}

new MutationObserver(() => {
    clearTimeout(window._masonryMutationTimer);
    window._masonryMutationTimer = setTimeout(triggerProcess, 200);
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener("scroll", () => {
    clearTimeout(window._masonryScrollTimer);
    window._masonryScrollTimer = setTimeout(triggerProcess, 120);
}, true);

window.addEventListener("resize", () => {
    clearTimeout(window._masonryResizeTimer);
    window._masonryResizeTimer = setTimeout(triggerProcess, 200);
});

window.triggerProcess = triggerProcess;
setTimeout(triggerProcess, 1000);
setTimeout(triggerProcess, 2500);
