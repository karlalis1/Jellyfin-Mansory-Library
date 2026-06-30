(function () {
    "use strict";

    const BOTTOM_THRESHOLD_PX = 320;
    const CHECK_DEBOUNCE_MS = 120;
    const CLICK_LOCK_MS = 2000;
    const DEBUG_LOGS = false;
    const NEXT_ICON_NAMES = new Set([
        "navigate_next",
        "chevron_right",
        "keyboard_arrow_right",
        "arrow_forward_ios",
        "arrow_forward"
    ]);

    let checkTimer = null;
    let clickLockedUntil = 0;
    let lastActivatedHash = "";

    function debugLog(...args) {
        if (DEBUG_LOGS) {
            console.log("AutoNextPage:", ...args);
        }
    }

    function getHash() {
        return (window.location.hash || "").toLowerCase();
    }

    function isHomeLikeRoute() {
        const hash = getHash();
        return !hash
            || hash === "#"
            || hash === "#/"
            || hash.startsWith("#/home")
            || hash.startsWith("#/index")
            || hash.startsWith("#/details")
            || hash.startsWith("#/video")
            || hash.startsWith("#/mypreferences");
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

    function getVisibleControls() {
        return [...document.querySelectorAll("button, a")]
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
        if (!element) {
            return true;
        }

        return element.hasAttribute("disabled")
            || element.getAttribute("aria-disabled") === "true"
            || element.classList.contains("disabled");
    }

    function getElementText(element) {
        const text = [
            element.getAttribute("title"),
            element.getAttribute("aria-label"),
            element.textContent
        ]
            .filter(Boolean)
            .join(" ")
            .trim()
            .toLowerCase();

        return text;
    }

    function hasNextIcon(element) {
        return [...element.querySelectorAll(".material-icons, .material-icons-round, i")]
            .some(icon => NEXT_ICON_NAMES.has((icon.textContent || "").trim().toLowerCase()));
    }

    function scoreNextCandidate(element) {
        const text = getElementText(element);
        let score = 0;

        if (/next|weiter|nächste|naechste/.test(text)) {
            score += 20;
        }

        if (hasNextIcon(element)) {
            score += 15;
        }

        if (/page|seite/.test(text)) {
            score += 8;
        }

        const rect = element.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.5) {
            score += 6;
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

        return score;
    }

    function findNextPageControl() {
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
                    ".btnNextPage",
                    ".nextPage",
                    ".pageNext"
                ].join(",")
            )
        ];

        const iconMatches = getVisibleControls().filter(hasNextIcon);
        const candidates = [...new Set([...selectorMatches, ...iconMatches])]
            .filter(element => !isDisabled(element))
            .map(element => ({
                element,
                score: scoreNextCandidate(element)
            }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score);

        return candidates[0]?.element || null;
    }

    function isNearBottom() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const documentHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
        );

        return scrollTop + viewportHeight >= documentHeight - BOTTOM_THRESHOLD_PX;
    }

    function maybeGoToNextPage() {
        if (Date.now() < clickLockedUntil) {
            return;
        }

        if (isHomeLikeRoute()) {
            return;
        }

        const container = getPrimaryItemsContainer();
        if (!container || !container.querySelector(".card[data-id]")) {
            return;
        }

        if (!isNearBottom()) {
            return;
        }

        const nextControl = findNextPageControl();
        if (!nextControl) {
            debugLog("No next-page control found.");
            return;
        }

        const currentHash = getHash();
        if (currentHash === lastActivatedHash) {
            return;
        }

        clickLockedUntil = Date.now() + CLICK_LOCK_MS;
        lastActivatedHash = currentHash;
        debugLog("Activating next-page control.", nextControl);
        nextControl.click();
    }

    function scheduleCheck() {
        clearTimeout(checkTimer);
        checkTimer = window.setTimeout(maybeGoToNextPage, CHECK_DEBOUNCE_MS);
    }

    function resetRouteLock() {
        const currentHash = getHash();
        if (currentHash !== lastActivatedHash) {
            clickLockedUntil = 0;
        }
        scheduleCheck();
    }

    new MutationObserver(() => {
        scheduleCheck();
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener("scroll", scheduleCheck, true);
    window.addEventListener("resize", scheduleCheck);
    window.addEventListener("hashchange", resetRouteLock);
    window.addEventListener("popstate", resetRouteLock);
    window.addEventListener("load", scheduleCheck);

    scheduleCheck();
})();
