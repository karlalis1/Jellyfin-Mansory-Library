(function () {
    "use strict";

    const DEBUG_LOGS = false;
    const RENDER_DEBOUNCE_MS = 120;
    const SCROLL_OFFSET_PX = 120;
    const STORAGE_PREFIX = "jfm-append-pages:";
    const PENDING_SCROLL_KEY = `${STORAGE_PREFIX}pending-scroll`;
    const STYLE_ID = "jfm-append-pages-style";
    const ROOT_CLASS = "jfm-append-pages-root";
    const SECTION_CLASS = "jfm-append-pages-section";
    const NEXT_ICON_NAMES = new Set([
        "navigate_next",
        "chevron_right",
        "keyboard_arrow_right",
        "arrow_forward_ios",
        "arrow_forward"
    ]);

    let renderTimer = null;

    function debugLog(...args) {
        if (DEBUG_LOGS) {
            console.log("AppendPages:", ...args);
        }
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .${ROOT_CLASS} {
                display: block;
                width: 100%;
                margin: 0;
                padding: 0;
            }

            .${ROOT_CLASS} > .${SECTION_CLASS} {
                display: block;
                width: 100%;
                margin: 0;
                padding: 0;
            }
        `;

        document.head.appendChild(style);
    }

    function getHash() {
        return window.location.hash || "";
    }

    function normalizePath(path) {
        return (path || "")
            .replace(/^!/, "")
            .replace(/^\//, "")
            .toLowerCase();
    }

    function parseRouteInfo() {
        const hash = getHash();
        if (!/^#!?\//.test(hash)) {
            return null;
        }

        const hashBody = hash.replace(/^#!?\//, "");
        const [pathPart, queryPart = ""] = hashBody.split("?");
        const params = new URLSearchParams(queryPart);
        const pageNumber = Number(params.get("Page") || params.get("page") || params.get("PageNumber") || params.get("pageNumber") || 0);
        let startIndex = Number(params.get("StartIndex") || params.get("startIndex") || 0);
        if (!Number.isFinite(startIndex) || startIndex < 0) {
            startIndex = 0;
        }

        const baseParams = new URLSearchParams(params);
        [
            "StartIndex",
            "startIndex",
            "Page",
            "page",
            "PageNumber",
            "pageNumber"
        ].forEach(key => baseParams.delete(key));

        const normalizedPath = normalizePath(pathPart);
        const baseQuery = baseParams.toString();
        const baseKey = `${normalizedPath}?${baseQuery}`;
        const normalizedStartIndex = Number.isFinite(startIndex) && startIndex > 0
            ? startIndex
            : 0;
        const pageKey = `${baseKey}|start=${normalizedStartIndex}|page=${Number.isFinite(pageNumber) ? pageNumber : 0}`;

        return {
            hash,
            normalizedPath,
            startIndex: normalizedStartIndex,
            pageNumber: Number.isFinite(pageNumber) ? pageNumber : 0,
            baseKey,
            pageKey
        };
    }

    function isIgnoredRoute(routeInfo) {
        if (!routeInfo) {
            return true;
        }

        return routeInfo.normalizedPath.startsWith("home")
            || routeInfo.normalizedPath.startsWith("index")
            || routeInfo.normalizedPath.startsWith("details")
            || routeInfo.normalizedPath.startsWith("video")
            || routeInfo.normalizedPath.startsWith("mypreferences");
    }

    function getPrimaryItemsContainer() {
        const containers = [...document.querySelectorAll(".itemsContainer")];
        if (!containers.length) {
            return null;
        }

        return containers
            .map(container => ({
                container,
                cardCount: container.querySelectorAll(".card[data-id]").length
            }))
            .sort((a, b) => b.cardCount - a.cardCount)[0]
            ?.container || null;
    }

    function isNavMenuControl(element) {
        if (!element) {
            return true;
        }

        return element.classList.contains("navMenuOption")
            || element.classList.contains("lnkMediaFolder")
            || Boolean(element.closest(".navMenuItems, .skinHeader, .mainDrawer"));
    }

    function getVisibleControls() {
        return [...document.querySelectorAll("button, a, [role='button'], paper-icon-button-light")]
            .filter(element => {
                if (!element || !element.isConnected) {
                    return false;
                }

                const rect = element.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                return style.display !== "none" && style.visibility !== "hidden";
            });
    }

    function isDisabled(element) {
        return !element
            || element.hasAttribute("disabled")
            || element.getAttribute("aria-disabled") === "true"
            || element.classList.contains("disabled");
    }

    function getElementText(element) {
        return [
            element.getAttribute("title"),
            element.getAttribute("aria-label"),
            element.textContent
        ]
            .filter(Boolean)
            .join(" ")
            .trim()
            .toLowerCase();
    }

    function isHomeLikeControl(element, text) {
        const href = (element.getAttribute("href") || "").toLowerCase();
        return href === "#/home"
            || href === "#!/home"
            || /startseite|^home$/.test(text || "")
            || isNavMenuControl(element);
    }

    function hasNextIcon(element) {
        return [...element.querySelectorAll(".material-icons, .material-icons-round, i")]
            .some(icon => NEXT_ICON_NAMES.has((icon.textContent || "").trim().toLowerCase()));
    }

    function scoreNextCandidate(element, container = null) {
        if (!element || isDisabled(element)) {
            return 0;
        }

        const text = getElementText(element);
        if (isHomeLikeControl(element, text)) {
            return 0;
        }

        let score = 0;
        const rect = element.getBoundingClientRect();
        const containerRect = container?.getBoundingClientRect?.() || null;

        if (/next|weiter|nächste|naechste/.test(text)) {
            score += 20;
        }

        if (/\b(page|seite)\b/.test(text)) {
            score += 10;
        }

        if (hasNextIcon(element)) {
            score += 15;
        }

        if (element.className && /next|page/i.test(String(element.className))) {
            score += 10;
        }

        if (element.dataset?.action && /next/i.test(element.dataset.action)) {
            score += 15;
        }

        if (element.href && /startindex|page/i.test(element.href.toLowerCase())) {
            score += 5;
        }

        if (element.closest(".listPaging, .pagingContainer, .pagination, .sectionFooter, .itemsContainerFooter")) {
            score += 30;
        }

        if (containerRect) {
            if (rect.top >= containerRect.bottom - 120) {
                score += 12;
            }

            if (Math.abs(rect.left - containerRect.left) < containerRect.width * 0.5) {
                score += 6;
            }
        }

        return score;
    }

    function findNextPageControl() {
        const container = getPrimaryItemsContainer();
        const selectorMatches = [
            ...document.querySelectorAll(
                [
                    "button[data-action*='next' i]",
                    "a[data-action*='next' i]",
                    "button[title*='next' i]",
                    "a[title*='next' i]",
                    "button[aria-label*='next' i]",
                    "a[aria-label*='next' i]",
                    "button[title*='weiter' i]",
                    "a[title*='weiter' i]",
                    "button[aria-label*='weiter' i]",
                    "a[aria-label*='weiter' i]",
                    "[role='button'][title*='next' i]",
                    "[role='button'][aria-label*='next' i]",
                    "[role='button'][title*='weiter' i]",
                    "[role='button'][aria-label*='weiter' i]",
                    "paper-icon-button-light[title*='next' i]",
                    "paper-icon-button-light[aria-label*='next' i]",
                    "paper-icon-button-light[title*='weiter' i]",
                    "paper-icon-button-light[aria-label*='weiter' i]",
                    ".btnNextPage",
                    ".nextPage",
                    ".pageNext"
                ].join(",")
            )
        ];

        const iconMatches = getVisibleControls()
            .filter(element => hasNextIcon(element) && !isHomeLikeControl(element, getElementText(element)));
        const candidates = [...new Set([...selectorMatches, ...iconMatches])]
            .map(element => ({
                element,
                score: scoreNextCandidate(element, container)
            }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score);

        return candidates[0]?.element || null;
    }

    function isNextControl(target) {
        if (!target) {
            return false;
        }

        const clickable = target.closest("button, a, [role='button'], paper-icon-button-light, .btnNextPage, .nextPage, .pageNext");
        if (!clickable) {
            return false;
        }

        const nextControl = findNextPageControl();
        return clickable === nextControl || clickable.contains(nextControl) || nextControl?.contains(clickable);
    }

    function getStorageKey(baseKey) {
        return `${STORAGE_PREFIX}${baseKey}`;
    }

    function loadModel(baseKey) {
        try {
            const raw = sessionStorage.getItem(getStorageKey(baseKey));
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.pages)) {
                return null;
            }

            return parsed;
        } catch (error) {
            console.warn("AppendPages: failed to load session model", error);
            return null;
        }
    }

    function saveModel(baseKey, model) {
        try {
            sessionStorage.setItem(getStorageKey(baseKey), JSON.stringify(model));
        } catch (error) {
            console.warn("AppendPages: failed to save session model", error);
        }
    }

    function upsertPage(model, pageEntry) {
        const existingIndex = model.pages.findIndex(entry => entry.pageKey === pageEntry.pageKey);
        if (existingIndex >= 0) {
            model.pages[existingIndex] = pageEntry;
        } else {
            model.pages.push(pageEntry);
        }

        model.pages.sort((a, b) => a.startIndex - b.startIndex);
    }

    function rememberPendingScroll(routeInfo) {
        try {
            sessionStorage.setItem(PENDING_SCROLL_KEY, JSON.stringify({
                baseKey: routeInfo.baseKey
            }));
        } catch (error) {
            console.warn("AppendPages: failed to save pending scroll", error);
        }
    }

    function consumePendingScroll(routeInfo) {
        try {
            const raw = sessionStorage.getItem(PENDING_SCROLL_KEY);
            if (!raw) {
                return false;
            }

            const pending = JSON.parse(raw);
            sessionStorage.removeItem(PENDING_SCROLL_KEY);
            return pending?.baseKey === routeInfo.baseKey;
        } catch (error) {
            sessionStorage.removeItem(PENDING_SCROLL_KEY);
            return false;
        }
    }

    function captureCurrentPageBeforePaging() {
        const routeInfo = parseRouteInfo();
        if (!routeInfo || isIgnoredRoute(routeInfo)) {
            return;
        }

        const container = getPrimaryItemsContainer();
        if (!container || !container.querySelector(".card[data-id]")) {
            return;
        }

        const model = loadModel(routeInfo.baseKey) || {
            baseKey: routeInfo.baseKey,
            pages: []
        };

        upsertPage(model, {
            pageKey: routeInfo.pageKey,
            startIndex: routeInfo.startIndex,
            html: container.outerHTML
        });

        saveModel(routeInfo.baseKey, model);
        rememberPendingScroll(routeInfo);
        debugLog("Captured page before paging.", routeInfo);
    }

    function getOrCreateRoot(container, routeInfo) {
        const previousSibling = container.previousElementSibling;
        if (previousSibling?.classList?.contains(ROOT_CLASS)) {
            previousSibling.dataset.appendPagesBaseKey = routeInfo.baseKey;
            return previousSibling;
        }

        const root = document.createElement("div");
        root.className = ROOT_CLASS;
        root.dataset.appendPagesBaseKey = routeInfo.baseKey;
        container.parentNode.insertBefore(root, container);
        return root;
    }

    function cleanupInjectedRoot(container) {
        const previousSibling = container?.previousElementSibling;
        if (previousSibling?.classList?.contains(ROOT_CLASS)) {
            previousSibling.remove();
        }
    }

    function injectStoredPages() {
        const routeInfo = parseRouteInfo();
        if (!routeInfo || isIgnoredRoute(routeInfo)) {
            return;
        }

        const container = getPrimaryItemsContainer();
        if (!container || !container.querySelector(".card[data-id]")) {
            return;
        }

        ensureStyles();

        const model = loadModel(routeInfo.baseKey);
        const previousPages = model?.pages?.filter(entry => entry.startIndex < routeInfo.startIndex) || [];

        if (!previousPages.length) {
            cleanupInjectedRoot(container);
            return;
        }

        const root = getOrCreateRoot(container, routeInfo);
        root.innerHTML = previousPages
            .map(entry => `<section class="${SECTION_CLASS}" data-append-start-index="${entry.startIndex}">${entry.html}</section>`)
            .join("");

        if (consumePendingScroll(routeInfo)) {
            window.requestAnimationFrame(() => {
                const top = container.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET_PX;
                window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
            });
        }

        debugLog("Injected stored pages.", previousPages.length, routeInfo);
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = window.setTimeout(injectStoredPages, RENDER_DEBOUNCE_MS);
    }

    document.addEventListener("click", event => {
        if (isNextControl(event.target)) {
            captureCurrentPageBeforePaging();
        }
    }, true);

    new MutationObserver(() => {
        scheduleRender();
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener("hashchange", scheduleRender);
    window.addEventListener("popstate", scheduleRender);
    window.addEventListener("load", scheduleRender);

    scheduleRender();
})();
