const COLUMN_WIDTH = 236;
const GAP = 14;
const DEFAULT_RATIO = 16 / 9;
const BATCH_SIZE = 24;
const RATIO_REQUEST_BATCH_SIZE = 150;
const INITIAL_CARD_LIMIT = 24;
const SCROLL_INCREMENT = 12;
const AUTO_EXPAND_STEPS = 0;
const AUTO_EXPAND_DELAY_MS = 350;
const DEBUG_LOGS = false;
const STYLE_ID = "jellyfin-masonry-plugin-styles";
const STATUS_CLASS = "jellyfin-masonry-status";
const ratioMaps = {};
const runningParents = new Set();
const itemDetailRatioAttempts = new Set();

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
        .itemsContainer[data-masonry-active="1"] {
            display: block !important;
            column-width: ${COLUMN_WIDTH}px !important;
            column-gap: ${GAP}px !important;
            width: 100% !important;
            padding: 6px 4px 24px !important;
            height: auto !important;
        }

        .itemsContainer[data-masonry-active="1"] > .card {
            display: inline-block !important;
            position: relative !important;
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
            transition: filter 180ms ease !important;
            filter: none !important;
        }

        .itemsContainer[data-masonry-active="1"] > .card:hover {
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
    const key = container.dataset.parentid || "default";
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

async function fetchRatiosForIds(parentId, ids) {
    const ratioMap = ensureParentRatioMap(parentId);
    const idsToLoad = ids.filter(id => id && !ratioMap[id]);

    if (!idsToLoad.length) {
        return ratioMap;
    }

    let fetchedCount = 0;

    for (let i = 0; i < idsToLoad.length; i += RATIO_REQUEST_BATCH_SIZE) {
        const batch = idsToLoad.slice(i, i + RATIO_REQUEST_BATCH_SIZE);

        try {
            const res = await fetch(
                buildUrl("/Masonry/Ratios/Lookup"),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Emby-Token": getToken()
                    },
                    body: JSON.stringify({
                        parentId,
                        itemIds: batch
                    })
                }
            );

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            Object.assign(ratioMap, data || {});
            fetchedCount += Object.keys(data || {}).length;
        } catch (e) {
            console.warn("Masonry ratio lookup failed, fallback to Jellyfin item API:", e);
        }
    }

    if (fetchedCount) {
        debugLog("Masonry: Ratios vom Server geladen:", fetchedCount, "Items");
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

    return ratioMap;
}

function getShape(ratio) {
    if (ratio < 0.9) return "portrait";
    if (ratio > 1.2) return "landscape";
    return "square";
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

function getProcessableMediaCards(container) {
    return [...container.querySelectorAll(".card[data-id]")].filter(isProcessableMediaCard);
}

function getLayoutCards(container) {
    return [...container.querySelectorAll(".card[data-id]")];
}

function needsMasonryUpdate(card, ratio) {
    const ratioKey = getRatioKey(ratio);
    return card.dataset.masonryDone !== "1"
        || card.dataset.masonryId !== (card.dataset.id || "")
        || card.dataset.masonryAppliedRatio !== ratioKey;
}

function getCardsToProcess(cards, ratioMap) {
    return cards.filter(card => {
        const ratio = ratioMap?.[card.dataset.id] || card.dataset.masonryRatio || DEFAULT_RATIO;
        return needsMasonryUpdate(card, ratio);
    });
}

function getContainerCardLimit(container, totalCards) {
    const rawLimit = Number(container.dataset.masonryProcessLimit || INITIAL_CARD_LIMIT);
    const safeLimit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.floor(rawLimit)
        : INITIAL_CARD_LIMIT;
    const normalizedLimit = Math.min(Math.max(safeLimit, INITIAL_CARD_LIMIT), totalCards);
    container.dataset.masonryProcessLimit = String(normalizedLimit);
    return normalizedLimit;
}

function increaseContainerCardLimit(container, totalCards) {
    const currentLimit = getContainerCardLimit(container, totalCards);
    if (currentLimit >= totalCards) return false;

    const nextLimit = Math.min(currentLimit + SCROLL_INCREMENT, totalCards);
    if (nextLimit === currentLimit) return false;

    container.dataset.masonryProcessLimit = String(nextLimit);
    return true;
}

function hideCards(cards) {
    cards.forEach(card => {
        card.style.display = "none";
        card.style.visibility = "hidden";
        card.style.pointerEvents = "none";
    });
}

function showCards(cards) {
    cards.forEach(card => {
        card.style.display = "";
        card.style.visibility = "visible";
        card.style.pointerEvents = "";
        card.style.position = "";
        card.style.left = "";
        card.style.top = "";
        card.style.transform = "";
        card.style.width = "";
    });
}

function scheduleAutoExpand() {
    if (AUTO_EXPAND_STEPS <= 0) {
        return;
    }

    clearTimeout(window._masonryAutoExpandTimer);

    let step = 0;
    const run = () => {
        if (step >= AUTO_EXPAND_STEPS) return;
        step += 1;

        let expanded = false;
        document.querySelectorAll(".itemsContainer[data-parentid]").forEach(container => {
            const mediaCards = getProcessableMediaCards(container);
            if (!mediaCards.length) return;
            expanded = increaseContainerCardLimit(container, mediaCards.length) || expanded;
        });

        if (expanded) {
            triggerProcess();
            window._masonryAutoExpandTimer = setTimeout(run, AUTO_EXPAND_DELAY_MS);
        }
    };

    window._masonryAutoExpandTimer = setTimeout(run, AUTO_EXPAND_DELAY_MS);
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

function applyMasonryToCard(card, ratio) {
    const numericRatio = Number(ratio);
    const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0
        ? numericRatio
        : DEFAULT_RATIO;
    const ratioKey = getRatioKey(safeRatio);
    const scalable = card.querySelector(".cardScalable");
    const overlay = card.querySelector(".cardOverlayContainer");
    const imageContainer = card.querySelector(".cardImageContainer");
    const image = card.querySelector(".cardImage");
    const cardBox = card.querySelector(".cardBox");
    const padder = card.querySelector(".cardPadder");

    if (!scalable && !imageContainer) return false;
    if (!needsMasonryUpdate(card, safeRatio)) return false;

    card.dataset.masonryRatio = String(safeRatio);
    card.dataset.masonryShape = getShape(safeRatio);
    card.dataset.masonryDone = "1";
    card.dataset.masonryId = card.dataset.id || "";
    card.dataset.masonryAppliedRatio = ratioKey;

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

        const allCards = getLayoutCards(container);
        if (!allCards.length) return;

        let ratioMap = ensureParentRatioMap(parentId);
        const currentLimit = getContainerCardLimit(container, allCards.length);
        const visibleCards = allCards.slice(0, currentLimit);
        const hiddenCards = allCards.slice(currentLimit);
        hideCards(hiddenCards);
        showCards(visibleCards);
        updateMasonryStatus(container, currentLimit >= allCards.length, currentLimit, allCards.length);

        const visibleMediaCards = visibleCards.filter(isProcessableMediaCard);
        const cardsToProcess = getCardsToProcess(visibleCards, ratioMap);

        const idsToProcess = cardsToProcess
            .filter(isProcessableMediaCard)
            .map(card => card.dataset.id)
            .filter(Boolean);

        if (idsToProcess.length) {
            ratioMap = await fetchRatiosForIds(parentId, idsToProcess);
            ratioMap = await getRatiosFallback(parentId, idsToProcess);
            ratioMap = await hydrateRatiosFromItemDetails(parentId, idsToProcess, ratioMap);
        }

        let changedCount = 0;
        for (let index = 0; index < cardsToProcess.length; index += BATCH_SIZE) {
            const batch = cardsToProcess.slice(index, index + BATCH_SIZE);

            for (const card of batch) {
                const ratio = ratioMap?.[card.dataset.id] || card.dataset.masonryRatio || DEFAULT_RATIO;
                if (await applyMasonryToCard(card, ratio)) {
                    changedCount += 1;
                }
            }

            if (index + BATCH_SIZE < cardsToProcess.length) {
                await waitForNextFrame();
            }
        }

        if (changedCount) {
            debugLog("Masonry: Container verarbeitet:", changedCount, "Karten");
        }

        visibleCards.forEach(card => {
            if (!isProcessableMediaCard(card) && !card.dataset.masonryDone) {
                applyMasonryToCard(card, DEFAULT_RATIO);
            }
        });
        container.style.height = "";
        updateMasonryStatus(container, currentLimit >= allCards.length, currentLimit, allCards.length);
    } finally {
        runningParents.delete(parentId);
    }
}

function expandProcessingWindow() {
    document.querySelectorAll(".itemsContainer[data-parentid]").forEach(container => {
        const cards = getLayoutCards(container);
        if (!cards.length) return;
        increaseContainerCardLimit(container, cards.length);
    });
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
    window._masonryScrollTimer = setTimeout(() => {
        expandProcessingWindow();
        triggerProcess();
    }, 120);
}, true);

window.addEventListener("resize", () => {
    clearTimeout(window._masonryResizeTimer);
    window._masonryResizeTimer = setTimeout(triggerProcess, 200);
});

window.triggerProcess = triggerProcess;
setTimeout(triggerProcess, 1000);
setTimeout(triggerProcess, 2500);
setTimeout(scheduleAutoExpand, 1400);
