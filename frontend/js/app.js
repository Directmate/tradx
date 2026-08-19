/* ============================================================
   TRADEX PAPER TRADING
   FRONTEND <-> EXPRESS <-> MONGODB
   ============================================================ */

const API_BASE_URL = "";

const state = {
    activeView: "watchlist",
    activeWatchlistTab: "My Stocks",
        watchlistSymbols: [],
    activeOrderFilter: "ALL",
    activePortfolioTab: "holdings",

    selectedStock: null,
    orderMode: "BUY",

    stocks: [],
    orders: [],
    portfolio: [],

    wallet: {
        cashBalance: 0,
        name: "",
        email: ""
    },

    privacyMode: false,
    searchTimer: null
};
function getWatchlistKey() {
    return `tradexWatchlist_${state.wallet.email || "guest"}`;
}

function getWatchlistSymbols() {
    return JSON.parse(
        localStorage.getItem(getWatchlistKey()) || "[]"
    );
}

/* ============================================================
   AUTH
   ============================================================ */

function getToken() {
    return localStorage.getItem("token");
}

function logoutAndRedirect() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
}


/* ============================================================
   API REQUEST
   ============================================================ */

async function apiRequest(endpoint, options = {}) {

    const token = getToken();

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {

        response = await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                ...options,
                headers
            }
        );

    } catch (error) {

        throw new Error(
            "Server connect nahi ho raha. Check karo node server.js running hai."
        );

    }

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401 || response.status === 403) {

        logoutAndRedirect();

        throw new Error(
            "Login session expire ho gaya."
        );
    }

    if (!response.ok) {

        throw new Error(
            data.message ||
            `API Error ${response.status}`
        );
    }

    return data;
}


/* ============================================================
   FORMATTERS
   ============================================================ */

function numberValue(value) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : 0;
}


function formatNumber(
    value,
    decimals = 2
) {

    return numberValue(value)
        .toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }
        );
}


function formatCurrency(value) {

    if (state.privacyMode) {
        return "••••••";
    }

    return `₹${formatNumber(value, 2)}`;
}


function formatCompactCurrency(value) {

    if (state.privacyMode) {
        return "••••";
    }

    const n = numberValue(value);

    if (n >= 10000000) {
        return `₹${(n / 10000000).toFixed(2)}Cr`;
    }

    if (n >= 100000) {
        return `₹${(n / 100000).toFixed(1)}L`;
    }

    if (n >= 1000) {
        return `₹${(n / 1000).toFixed(1)}K`;
    }

    return `₹${formatNumber(n, 0)}`;
}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* ============================================================
   CATEGORY DATA
   ============================================================ */

const NIFTY_SYMBOLS = new Set([
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "ITC",
    "LT",
    "BHARTIARTL",
    "ADANIENT",
    "AXISBANK",
    "MARUTI",
    "SUNPHARMA",
    "TATAMOTORS",
    "WIPRO",
    "HINDUNILVR",
    "KOTAKBANK",
    "BAJFINANCE",
    "HCLTECH",
    "M&M"
]);


const BANK_SYMBOLS = [
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "AXISBANK",
    "KOTAKBANK",
    "INDUSINDBK",
    "BANKBARODA",
    "PNB"
];


const IT_SYMBOLS = [
    "TCS",
    "INFY",
    "WIPRO",
    "HCLTECH",
    "TECHM",
    "LTIM",
    "MPHASIS"
];


function belongsToCategory(
    stock,
    category
) {

    if (category === "Nifty 50") {
        return NIFTY_SYMBOLS.has(
            stock.symbol
        );
    }

    if (category === "Bank Stocks") {
        return BANK_SYMBOLS.includes(
            stock.symbol
        );
    }

    if (category === "IT Stocks") {
        return IT_SYMBOLS.includes(
            stock.symbol
        );
    }
    if (category === "My Stocks") {
    const watchlist = getWatchlistSymbols();

    return watchlist.includes(
        stock.symbol
    );
}

    if (category === "Favorites") {

        const favorites =
            JSON.parse(
                localStorage.getItem(
                    "tradexFavorites"
                ) || "[]"
            );

        return favorites.includes(
            stock.symbol
        );
    }

    return true;
}


/* ============================================================
   WALLET
   ============================================================ */

async function loadWallet() {

    const data =
        await apiRequest(
            "/api/wallet"
        );

    const wallet =
        data.wallet || {};

    state.wallet = {

        cashBalance:
            numberValue(
                wallet.cashBalance
            ),

        name:
            wallet.name || "",

        email:
            wallet.email || ""
    };

    updateBalanceDisplay();
    updateAccountProfile();
}


function updateBalanceDisplay() {

    const balance =
        state.wallet.cashBalance;

    const desktop =
        document.getElementById(
            "desktop-balance"
        );

    const account =
        document.getElementById(
            "account-funds-val"
        );

    const mobile =
        document.getElementById(
            "mobile-balance"
        );

    if (desktop) {

        desktop.textContent =
            formatCurrency(balance);
    }

    if (account) {

        account.textContent =
            formatCurrency(balance);
    }

    if (mobile) {

        mobile.textContent =
            formatCompactCurrency(
                balance
            );
    }
}


function normalizeStock(stock) {

    const currentPrice = numberValue(
        stock.currentPrice ?? stock.ltp
    );

    const previousClose = numberValue(
        stock.previousClose ?? stock.close
    );

    const change =
        stock.change !== undefined
            ? numberValue(stock.change)
            : currentPrice - previousClose;

    const changePercent =
        stock.changePercent !== undefined
            ? numberValue(stock.changePercent)
            : (
                previousClose > 0
                    ? (change / previousClose) * 100
                    : 0
            );

    return {

        symbol:
            String(
                stock.symbol || ""
            ).toUpperCase(),

        exchange:
            stock.exchange || "NSE",

        name:
            stock.companyName ||
            stock.name ||
            stock.symbol ||
            "",

        ltp:
            currentPrice,

        previousClose:
            previousClose,

        change:
            change,

        changePercent:
            changePercent
    };
}

async function loadStocks() {

    const data =
        await apiRequest(
            "/api/stocks"
        );

    state.stocks =
        Array.isArray(
            data.stocks
        )
            ? data.stocks.map(
                normalizeStock
            )
            : [];

    // User watchlist initially empty
   state.watchlistSymbols = getWatchlistSymbols();

    renderWatchlist();
}


async function searchStocks(query) {

    const clean =
        String(query || "")
            .trim();

    if (!clean) {

        renderWatchlist();

        return;
    }

    try {

        const data =
            await apiRequest(
                `/api/stocks/search?query=${encodeURIComponent(clean)}`
            );

        const results =
            Array.isArray(
                data.stocks
            )
                ? data.stocks.map(
                    normalizeStock
                )
                : [];

        renderWatchlist(
            clean,
            results
        );

    } catch (error) {

        showToast(
            error.message,
            true
        );
    }
}


/* ============================================================
   WATCHLIST
   ============================================================ */

function filterWatchlistTab(
    tabName,
    element
) {

    state.activeWatchlistTab =
        tabName;

    document
        .querySelectorAll(
            "#watchlist-tabs .tab-item"
        )
        .forEach(
            tab =>
                tab.classList.remove(
                    "active"
                )
        );

    if (element) {

        element.classList.add(
            "active"
        );
    }

    const search =
        document.getElementById(
            "watchlist-search"
        );

    renderWatchlist(
        search?.value || ""
    );
}


function renderWatchlist(
    query = "",
    customStocks = null
) {

    const container =
        document.getElementById(
            "stock-list-container"
        );

    if (!container) {
        return;
    }

    const source =
        customStocks ||
        state.stocks;

    const cleanQuery =
        String(query)
            .toLowerCase()
            .trim();

    let filtered =
        source.filter(stock => {

            const categoryMatch =
                belongsToCategory(
                    stock,
                    state.activeWatchlistTab
                );

            const searchMatch =
                !cleanQuery ||
                stock.symbol
                    .toLowerCase()
                    .includes(
                        cleanQuery
                    ) ||
                stock.name
                    .toLowerCase()
                    .includes(
                        cleanQuery
                    );

            return (
                categoryMatch &&
                searchMatch
            );
        });

    if (customStocks) {

        filtered =
            source.filter(stock => {

                return (
                    !cleanQuery ||
                    stock.symbol
                        .toLowerCase()
                        .includes(
                            cleanQuery
                        ) ||
                    stock.name
                        .toLowerCase()
                        .includes(
                            cleanQuery
                        )
                );
            });
    }

    const count =
        document.getElementById(
            "watchlist-count"
        );

    if (count) {

        count.textContent =
            `${filtered.length}/${state.stocks.length}`;
    }

    container.innerHTML = "";

   if (!filtered.length) {

    if (
        state.activeWatchlistTab === "My Stocks" &&
        !cleanQuery
    ) {

        container.innerHTML = `
            <li class="empty-state" style="
                text-align:center;
                padding:40px 20px;
                color:var(--text-muted);
            ">
                <div style="
                    font-size:16px;
                    font-weight:700;
                    color:var(--text-main);
                    margin-bottom:6px;
                ">
                    Your watchlist is empty
                </div>

                <div style="
                    font-size:13px;
                ">
                    Search for a stock above to add it to your watchlist.
                </div>
            </li>
        `;

    } else {

        container.innerHTML = `
            <li class="empty-state">
                No stocks found.
            </li>
        `;
    }

    return;
}

    filtered.forEach(
        stock => {

            const li =
                document.createElement(
                    "li"
                );

            li.className =
                "stock-row";
                let pressTimer;

li.addEventListener("pointerdown", () => {
    pressTimer = setTimeout(() => {

        const watchlist = getWatchlistSymbols();

        if (!watchlist.includes(stock.symbol)) {
            return;
        }

        const remove = confirm(
            `${stock.symbol} ko Watchlist se remove karna hai?`
        );

        if (remove) {
            const updated = watchlist.filter(
                symbol => symbol !== stock.symbol
            );

            localStorage.setItem(
    getWatchlistKey(),
    JSON.stringify(updated)
    );

            state.watchlistSymbols = updated;

            renderWatchlist();

            showToast(
                `${stock.symbol} removed from Watchlist`
            );
        }

    }, 700);
});

li.addEventListener("pointerup", () => {
    clearTimeout(pressTimer);
});

li.addEventListener("pointerleave", () => {
    clearTimeout(pressTimer);
});



//swipe
let touchStartX = 0;

li.addEventListener("touchstart", (event) => {
    touchStartX = event.touches[0].clientX;
});

li.addEventListener("touchend", (event) => {

    const touchEndX = event.changedTouches[0].clientX;
    const swipeDistance = touchEndX - touchStartX;

    // Left swipe
    if (swipeDistance < -100) {

        const watchlist = getWatchlistSymbols();

        if (!watchlist.includes(stock.symbol)) {
            return;
        }

        const remove = confirm(
            `${stock.symbol} ko Watchlist se remove karna hai?`
        );

        if (!remove) {
            return;
        }

        const updated = watchlist.filter(
            symbol => symbol !== stock.symbol
        );

        localStorage.setItem(
    getWatchlistKey(),
    JSON.stringify(updated)
);

        state.watchlistSymbols = updated;

        renderWatchlist();

        showToast(
            `${stock.symbol} removed from Watchlist`
        );
    }
});




            const positive =
                stock.change >= 0;

            const sign =
                positive
                    ? "+"
                    : "";

            li.innerHTML = `

                <div>

                    <div class="stock-symbol">

                        ${escapeHtml(
                            stock.symbol
                        )}

                        <span class="stock-exchange">

                            ${escapeHtml(
                                stock.exchange
                            )}

                        </span>

                    </div>

                    <div class="stock-sub">

                        ${escapeHtml(
                            stock.name
                        )}

                    </div>

                </div>

                <div class="stock-price-col">

                    <div
                        class="stock-ltp ${
                            positive
                                ? "pos"
                                : "neg"
                        }"
                    >

                        ${formatCurrency(
                            stock.ltp
                        )}

                    </div>

                    <div
                        class="stock-change ${
                            positive
                                ? "pos"
                                : "neg"
                        }"
                    >

                        ${sign}${formatNumber(
                            stock.change
                        )}

                        (${sign}${formatNumber(
                            stock.changePercent
                        )}%)

                    </div>

                </div>
            `;

           li.addEventListener("click", () => {

    let watchlist = getWatchlistSymbols();

    if (!watchlist.includes(stock.symbol)) {
        watchlist.push(stock.symbol);

        localStorage.setItem(
    getWatchlistKey(),
    JSON.stringify(watchlist)
);

        state.watchlistSymbols = watchlist;

        showToast(
            `${stock.symbol} added to Watchlist`
        );
    }

    openStockDetail(stock);
});

            container.appendChild(
                li
            );
        }
    );
}


function handleSearch(query) {

    clearTimeout(
        state.searchTimer
    );

    const clean =
        String(query || "")
            .trim();

    if (!clean) {

        renderWatchlist();

        return;
    }

    state.searchTimer =
        setTimeout(
            () =>
                searchStocks(
                    clean
                ),
            300
        );
}


/* ============================================================
   FAVORITES
   ============================================================ */

function toggleFavorite(
    symbol
) {

    const key =
        "tradexFavorites";

    let favorites =
        JSON.parse(
            localStorage.getItem(
                key
            ) || "[]"
        );

    if (
        favorites.includes(
            symbol
        )
    ) {

        favorites =
            favorites.filter(
                item =>
                    item !== symbol
            );

        showToast(
            `${symbol} removed from Favorites`
        );

    } else {

        favorites.push(
            symbol
        );

        showToast(
            `${symbol} added to Favorites`
        );
    }

    localStorage.setItem(
        key,
        JSON.stringify(
            favorites
        )
    );

    if (
        state.activeWatchlistTab ===
        "Favorites"
    ) {

        renderWatchlist();
    }
}


/* ============================================================
   STOCK ORDER MODAL
   ============================================================ */
function openStockDetail(stock, openSellMode = false) {

    state.selectedStock = stock;

    const symbol = String(stock.symbol || "").toUpperCase();

    // Find user's current holding
    const holding = (state.portfolio || []).find(
        item =>
            String(item.symbol || "").toUpperCase() === symbol
    );

    const availableQuantity = holding
        ? Number(holding.quantity || 0)
        : 0;

    // Stock details
    const symbolElement =
        document.getElementById("modal-stock-symbol");

    const priceElement =
        document.getElementById("modal-stock-price");

    const changeElement =
        document.getElementById("modal-stock-change");

    if (symbolElement) {
        symbolElement.textContent = symbol;
    }

    if (priceElement) {
        priceElement.textContent =
            formatCurrency(numberValue(stock.ltp));
    }

    if (changeElement) {

        const positive =
            numberValue(stock.change) >= 0;

        changeElement.className =
            positive ? "pos" : "neg";

        changeElement.textContent =
            `${positive ? "+" : ""}${formatNumber(stock.change)}
            (${positive ? "+" : ""}${formatNumber(stock.changePercent)}%)`;
    }

    // Limit price
    const limit =
        document.getElementById("order-limit-price");

    if (limit) {
        limit.value =
            numberValue(stock.ltp).toFixed(2);
    }

    // Quantity
    const qty =
        document.getElementById("order-qty");

    if (qty) {
        qty.value = 1;

        if (availableQuantity > 0) {
            qty.max = availableQuantity;
        } else {
            qty.removeAttribute("max");
        }
    }

    // Open requested mode
    if (openSellMode) {
        setOrderMode("SELL");
    } else {
        setOrderMode("BUY");
    }

    // Limit price handling
    toggleLimitPrice(
        document.getElementById("order-type")?.value || "MARKET"
    );

    recalculateOrderEst();

    // Open modal
    document
        .getElementById("order-modal-overlay")
        ?.classList.add("active");

    drawCanvasChart();
}

function closeStockModal() {

    document
        .getElementById(
            "order-modal-overlay"
        )
        ?.classList.remove(
            "active"
        );
}


/* ============================================================
   CHART
   ============================================================ */

function updateChartTimeframe(
    timeframe,
    button
) {

    document
        .querySelectorAll(
            ".tf-btn"
        )
        .forEach(
            btn =>
                btn.classList.remove(
                    "active"
                )
        );

    if (button) {

        button.classList.add(
            "active"
        );
    }

    drawCanvasChart();
}


function drawCanvasChart() {

    const canvas =
        document.getElementById(
            "stockCanvasChart"
        );

    if (
        !canvas ||
        !state.selectedStock
    ) {
        return;
    }

    const parent =
        canvas.parentElement;

    const width =
        Math.max(
            260,
            parent.clientWidth - 20
        );

    const height = 150;

    const dpr =
        window.devicePixelRatio ||
        1;

    canvas.width =
        width * dpr;

    canvas.height =
        height * dpr;

    canvas.style.width =
        `${width}px`;

    canvas.style.height =
        `${height}px`;

    const ctx =
        canvas.getContext(
            "2d"
        );

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    const basePrice =
        numberValue(
            state.selectedStock.ltp
        );

    const positive =
        state.selectedStock.change >=
        0;

    const lineColor =
        positive
            ? "#00B386"
            : "#DF514C";

    const points = 48;

    const values = [];

    let value =
        basePrice;

    for (
        let i = 0;
        i < points;
        i++
    ) {

        const volatility =
            basePrice * 0.0025;

        value +=
            (
                Math.random() -
                0.5
            ) *
            volatility;

        values.push(
            value
        );
    }

    values[
        values.length - 1
    ] = basePrice;

    const min =
        Math.min(
            ...values
        );

    const max =
        Math.max(
            ...values
        );

    const range =
        Math.max(
            max - min,
            basePrice * 0.003
        );

    const padding = 10;

    const mapY =
        price => {

            return (
                height -
                padding -
                (
                    (price - min) /
                    range
                ) *
                (
                    height -
                    padding * 2
                )
            );
        };

    ctx.strokeStyle =
        "#E5E7EB";

    ctx.lineWidth = 1;

    for (
        let i = 1;
        i < 4;
        i++
    ) {

        const y =
            (
                height / 4
            ) * i;

        ctx.beginPath();

        ctx.moveTo(
            0,
            y
        );

        ctx.lineTo(
            width,
            y
        );

        ctx.stroke();
    }

    ctx.beginPath();

    values.forEach(
        (
            current,
            index
        ) => {

            const x =
                (
                    index /
                    (points - 1)
                ) *
                width;

            const y =
                mapY(
                    current
                );

            if (
                index === 0
            ) {

                ctx.moveTo(
                    x,
                    y
                );

            } else {

                ctx.lineTo(
                    x,
                    y
                );
            }
        }
    );

    ctx.strokeStyle =
        lineColor;

    ctx.lineWidth = 2;

    ctx.stroke();
}


/* ============================================================
   ORDER FORM
   ============================================================ */
function setOrderMode(mode) {

    state.orderMode = mode;

    const buy =
        document.getElementById("btn-mode-buy");

    const sell =
        document.getElementById("btn-mode-sell");

    const submit =
        document.getElementById("btn-order-submit");

    const qty =
        document.getElementById("order-qty");

    if (!buy || !sell || !submit) {
        return;
    }

    const symbol =
        String(state.selectedStock?.symbol || "").toUpperCase();

    const holding =
        (state.portfolio || []).find(
            item =>
                String(item.symbol || "").toUpperCase() === symbol
        );

    const availableQuantity =
        holding
            ? Number(holding.quantity || 0)
            : 0;


    // =========================================================
    // BUY
    // =========================================================

    if (mode === "BUY") {

        buy.className =
            "order-toggle-btn buy-active";

        sell.className =
            "order-toggle-btn";

        submit.className =
            "btn-submit-order btn-buy";

        submit.textContent =
            "VIRTUAL BUY";

        submit.disabled =
            false;

        if (qty) {

            qty.removeAttribute("max");

            if (
                !Number.isInteger(Number(qty.value)) ||
                Number(qty.value) <= 0
            ) {
                qty.value = 1;
            }
        }
    }


    // =========================================================
    // SELL
    // =========================================================

    else {

        buy.className =
            "order-toggle-btn";

        sell.className =
            "order-toggle-btn sell-active";


        // User does NOT own this stock
        if (availableQuantity <= 0) {

            submit.className =
                "btn-submit-order btn-sell";

            submit.textContent =
                "SHORT SELL NOT AVAILABLE";

            submit.disabled =
                true;

            if (qty) {
                qty.value = 0;
                qty.removeAttribute("max");
            }

            showToast(
                `You do not have ${symbol} in your portfolio. Short selling is not available.`,
                true
            );

        }

        // User owns this stock
        else {

            submit.className =
                "btn-submit-order btn-sell";

            submit.textContent =
                "VIRTUAL SELL";

            submit.disabled =
                false;

            if (qty) {

                qty.max =
                    availableQuantity;

                let currentQuantity =
                    Number(qty.value);

                if (
                    !Number.isInteger(currentQuantity) ||
                    currentQuantity <= 0
                ) {
                    currentQuantity = 1;
                }

                if (
                    currentQuantity > availableQuantity
                ) {
                    currentQuantity =
                        availableQuantity;
                }

                qty.value =
                    currentQuantity;
            }
        }
    }

    recalculateOrderEst();
}

function toggleLimitPrice(
    type
) {

    const input =
        document.getElementById(
            "order-limit-price"
        );

    if (!input) {
        return;
    }

    input.disabled =
        type === "MARKET";
}


function recalculateOrderEst() {

    if (
        !state.selectedStock
    ) {
        return;
    }

    const quantity =
        Math.max(
            1,
            parseInt(
                document.getElementById(
                    "order-qty"
                )?.value
            ) || 1
        );

    const type =
        document.getElementById(
            "order-type"
        )?.value ||
        "MARKET";

    const limit =
        numberValue(
            document.getElementById(
                "order-limit-price"
            )?.value
        );

    const price =
        type === "LIMIT" &&
        limit > 0
            ? limit
            : state.selectedStock.ltp;

    const total =
        quantity * price;

    const output =
        document.getElementById(
            "order-est-val"
        );

    if (output) {

        output.textContent =
            formatCurrency(
                total
            );
    }
}


/* ============================================================
   EXECUTE BUY / SELL
   ============================================================ */

async function executeOrder(
    event
) {

    event.preventDefault();

    if (
        !state.selectedStock
    ) {

        showToast(
            "Stock select karo.",
            true
        );

        return;
    }

    const quantity =
        Number(
            document.getElementById(
                "order-qty"
            )?.value
        );

    if (
        !Number.isInteger(
            quantity
        ) ||
        quantity <= 0
    ) {

        showToast(
            "Quantity positive whole number honi chahiye.",
            true
        );

        return;
    }

    const symbol =
        state.selectedStock.symbol;

    const button =
        document.getElementById(
            "btn-order-submit"
        );

    if (button) {

        button.disabled = true;

        button.textContent =
            "Processing...";
    }

    try {

        const endpoint =
            state.orderMode === "BUY"
                ? "/api/orders/buy"
                : "/api/orders/sell";

        const data =
            await apiRequest(
                endpoint,
                {
                    method: "POST",

                    body:
                        JSON.stringify(
                            {
                                symbol,
                                quantity
                            }
                        )
                }
            );

        closeStockModal();

        await refreshTradingData();

        const order =
            data.order || {};

        showToast(
            `${state.orderMode} successful: ${quantity} × ${symbol} @ ${formatCurrency(order.price)}`
        );

    } catch (error) {

        showToast(
            error.message,
            true
        );

    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                state.orderMode === "BUY"
                    ? "VIRTUAL BUY"
                    : "VIRTUAL SELL";
        }
    }
}


/* ============================================================
   ORDERS
   ============================================================ */

async function loadOrders() {

    const data =
        await apiRequest(
            "/api/orders"
        );

    state.orders =
        Array.isArray(
            data.orders
        )
            ? data.orders
            : [];

    renderOrders(
        state.activeOrderFilter
    );
}


function normalizeOrderStatus(
    status
) {

    const value =
        String(
            status || ""
        ).toUpperCase();

    if (
        value === "COMPLETED"
    ) {
        return "COMPLETE";
    }

    return (
        value ||
        "UNKNOWN"
    );
}


function filterOrders(
    filter,
    element
) {

    state.activeOrderFilter =
        filter;

    document
        .querySelectorAll(
            "#view-orders .tab-item"
        )
        .forEach(
            tab =>
                tab.classList.remove(
                    "active"
                )
        );

    if (element) {

        element.classList.add(
            "active"
        );
    }

    renderOrders(
        filter
    );
}


function renderOrders(
    filter = "ALL"
) {

    const container =
        document.getElementById(
            "orders-list-container"
        );

    if (!container) {
        return;
    }

    const orders =
        state.orders || [];

    const filtered =
        filter === "ALL"
            ? orders
            : orders.filter(
                order =>
                    normalizeOrderStatus(
                        order.status
                    ) === filter
            );

    const all =
        document.getElementById(
            "cnt-all"
        );

    const open =
        document.getElementById(
            "cnt-open"
        );

    const executed =
        document.getElementById(
            "cnt-executed"
        );

    const cancelled =
        document.getElementById(
            "cnt-cancelled"
        );

    if (all) {
        all.textContent =
            orders.length;
    }

    if (open) {

        open.textContent =
            orders.filter(
                o =>
                    normalizeOrderStatus(
                        o.status
                    ) === "OPEN"
            ).length;
    }

    if (executed) {

        executed.textContent =
            orders.filter(
                o =>
                    normalizeOrderStatus(
                        o.status
                    ) === "COMPLETE"
            ).length;
    }

    if (cancelled) {

        cancelled.textContent =
            orders.filter(
                o =>
                    normalizeOrderStatus(
                        o.status
                    ) === "CANCELLED"
            ).length;
    }

    container.innerHTML = "";

    if (!filtered.length) {

    if (
        state.activeWatchlistTab === "My Stocks" &&
        !cleanQuery
    ) {
        container.innerHTML = `
            <li class="empty-state">
                Your Watchlist is empty.
                <br>
                <span style="font-size:12px; color:var(--text-muted);">
                    Search a stock to add it to your Watchlist.
                </span>
            </li>
        `;
    } else {
        container.innerHTML = `
            <li class="empty-state">
                No stocks found.
            </li>
        `;
    }

    return;
}

    filtered.forEach(
        order => {

            const type =
                String(
                    order.orderType ||
                    order.type ||
                    ""
                ).toUpperCase();

            const status =
                normalizeOrderStatus(
                    order.status
                );

            const quantity =
                numberValue(
                    order.quantity ??
                    order.qty
                );

            const price =
                numberValue(
                    order.price ??
                    order.avgPrice
                );

            const product =
                order.product ||
                "CNC";

            const time =
                order.createdAt
                    ? new Date(
                        order.createdAt
                    ).toLocaleTimeString(
                        "en-IN",
                        {
                            hour:
                                "2-digit",
                            minute:
                                "2-digit",
                            second:
                                "2-digit"
                        }
                    )
                    : "-";

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "order-card";

            card.innerHTML = `

                <div class="order-header">

                    <div>

                        <span
                            class="order-type-badge ${
                                type === "BUY"
                                    ? "bg-buy"
                                    : "bg-sell"
                            }"
                        >

                            ${escapeHtml(
                                type
                            )}

                            ${quantity}/${quantity}

                        </span>

                        <span
                            class="order-symbol"
                            style="margin-left:8px;"
                        >

                            ${escapeHtml(
                                order.symbol
                            )}

                        </span>

                    </div>

                    <span
                        class="badge badge-${status.toLowerCase()}"
                    >

                        ${escapeHtml(
                            status
                        )}

                    </span>

                </div>

                <div class="order-details-grid">

                    <div class="order-detail-item">

                        <span class="order-detail-label">
                            Avg. Price
                        </span>

                        <span class="order-detail-val">
                            ${formatCurrency(
                                price
                            )}
                        </span>

                    </div>

                    <div class="order-detail-item">

                        <span class="order-detail-label">
                            Product
                        </span>

                        <span class="order-detail-val">
                            ${escapeHtml(
                                product
                            )}
                        </span>

                    </div>

                    <div class="order-detail-item">

                        <span class="order-detail-label">
                            Time
                        </span>

                        <span class="order-detail-val">
                            ${time}
                        </span>

                    </div>

                </div>
            `;

            container.appendChild(
                card
            );
        }
    );
}


/* ============================================================
   PORTFOLIO
   ============================================================ */

async function loadPortfolio() {

    const data =
        await apiRequest(
            "/api/portfolio/pnl"
        );

    state.portfolio =
        Array.isArray(
            data.portfolio
        )
            ? data.portfolio
            : [];

    renderPortfolio(
        state.activePortfolioTab
    );
}


function switchPortfolioTab(
    tab,
    element
) {

    state.activePortfolioTab =
        tab;

    document
        .querySelectorAll(
            "#view-portfolio .tab-item"
        )
        .forEach(
            item =>
                item.classList.remove(
                    "active"
                )
        );

    if (element) {

        element.classList.add(
            "active"
        );
    }

    renderPortfolio(
        tab
    );
}


function renderPortfolio(
    type = "holdings"
) {

    const container =
        document.getElementById(
            "portfolio-list-container"
        );

    if (!container) {
        return;
    }

    const items =
        state.portfolio || [];

    let totalPnl = 0;
    let totalCurrent = 0;
    let totalInvested = 0;

    container.innerHTML = "";

    if (!items.length) {

        container.innerHTML = `
            <div class="empty-state">
                No holdings yet.
            </div>
        `;
    }

    items.forEach(
        item => {

            const quantity =
                numberValue(
                    item.quantity
                );

            const currentPrice =
                numberValue(
                    item.currentPrice
                );

            const averagePrice =
                numberValue(
                    item.averagePrice
                );

            const currentValue =
                numberValue(
                    item.currentValue ??
                    quantity *
                    currentPrice
                );

            const invested =
                numberValue(
                    item.investedAmount ??
                    quantity *
                    averagePrice
                );

            const pnl =
                numberValue(
                    item.unrealizedPnL ??
                    (
                        currentValue -
                        invested
                    )
                );

            totalPnl += pnl;
            totalCurrent +=
                currentValue;
            totalInvested +=
                invested;

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "portfolio-row";
row.style.cursor = "pointer";

row.addEventListener("click", () => {

    const portfolioStock = {
        symbol:
            String(item.symbol || "").toUpperCase(),

        exchange:
            item.exchange || "NSE",

        name:
            item.companyName ||
            item.name ||
            item.symbol ||
            "",

        ltp:
            numberValue(item.currentPrice),

        previousClose:
            numberValue(item.previousClose),

        change:
            numberValue(item.change),

        changePercent:
            numberValue(item.changePercent)
    };

    // Open normal stock details
    openStockDetail(portfolioStock, false);
});
            row.innerHTML = `

                <div>

                    <div
                        style="
                            font-weight:700;
                            font-size:14px;
                        "
                    >

                        ${escapeHtml(
                            item.symbol
                        )}

                        <span class="badge badge-tag">
                            CNC
                        </span>

                    </div>

                    <div
                        style="
                            font-size:11px;
                            color:var(--text-muted);
                            margin-top:2px;
                        "
                    >

                        Qty:
                        ${quantity}

                        • Avg:
                        ${formatCurrency(
                            averagePrice
                        )}

                    </div>

                </div>

                <div style="text-align:right;">

                    <div style="font-weight:600;">

                        ${formatCurrency(
                            currentPrice
                        )}

                    </div>

                    <div
                        class="${
                            pnl >= 0
                                ? "pos"
                                : "neg"
                        }"
                        style="
                            font-size:12px;
                            font-weight:600;
                            margin-top:2px;
                        "
                    >

                        ${
                            pnl >= 0
                                ? "+"
                                : ""
                        }

                        ${formatCurrency(
                            pnl
                        )}

                    </div>

                </div>
            `;

            container.appendChild(
                row
            );
        }
    );

    const pnlElement =
        document.getElementById(
            "portfolio-total-pnl"
        );

    if (pnlElement) {

        pnlElement.className =
            `summary-pnl-val ${
                totalPnl >= 0
                    ? "pos"
                    : "neg"
            }`;

        pnlElement.textContent =
            `${
                totalPnl >= 0
                    ? "+"
                    : ""
            }${formatCurrency(
                totalPnl
            )}`;
    }

    const current =
        document.getElementById(
            "portfolio-current-val"
        );

    const invested =
        document.getElementById(
            "portfolio-invested-val"
        );

    if (current) {

        current.textContent =
            formatCurrency(
                totalCurrent
            );
    }

    if (invested) {

        invested.textContent =
            formatCurrency(
                totalInvested
            );
    }
}


/* ============================================================
   NAVIGATION
   ============================================================ */

function switchTab(
    viewName
) {

    state.activeView =
        viewName;

    document
        .querySelectorAll(
            "main > section"
        )
        .forEach(
            section =>
                section.classList.add(
                    "hidden"
                )
        );

    document
        .getElementById(
            `view-${viewName}`
        )
        ?.classList.remove(
            "hidden"
        );

    document
        .querySelectorAll(
            ".sidebar-item"
        )
        .forEach(
            item =>
                item.classList.remove(
                    "active"
                )
        );

    const indexMap = {
        watchlist: 0,
        orders: 1,
        portfolio: 2,
        bids: 3,
        account: 4
    };

    const items =
        document.querySelectorAll(
            ".sidebar-item"
        );

    const index =
        indexMap[
            viewName
        ];

    if (items[index]) {

        items[index].classList.add(
            "active"
        );
    }

    const title =
        document.getElementById(
            "mobile-page-title"
        );

    const titles = {
        watchlist: "Watchlist",
        orders: "Orders",
        portfolio: "Portfolio",
        bids: "Bids / IPO",
        account: "Account"
    };

    if (title) {

        title.textContent =
            titles[viewName] ||
            "TRADEX";
    }

    if (
        viewName ===
        "watchlist"
    ) {
        renderWatchlist();
    }

    if (
        viewName ===
        "orders"
    ) {
        renderOrders(
            state.activeOrderFilter
        );
    }

    if (
        viewName ===
        "portfolio"
    ) {
        renderPortfolio(
            state.activePortfolioTab
        );
    }

    if (
        viewName ===
        "bids"
    ) {
        renderBids();
    }

    if (
        viewName ===
        "account"
    ) {
        updateAccountProfile();
    }
}


/* ============================================================
   IPO
   ============================================================ */

const DEMO_IPOS = [

    {
        name:
            "Nexus Select Trust",

        symbol:
            "NXST",

        priceRange:
            "₹95 - ₹100",

        dates:
            "9th - 11th May",

        status:
            "Ongoing"
    },

    {
        name:
            "Innovative India Limited",

        symbol:
            "INNOKAIZ",

        tag:
            "SME",

        priceRange:
            "₹76 - ₹78",

        dates:
            "28th Apr - 3rd May",

        status:
            "CLOSED"
    },

    {
        name:
            "Mankind Pharma Limited",

        symbol:
            "MANKIND",

        priceRange:
            "₹1026 - ₹1080",

        dates:
            "25th - 27th Apr",

        status:
            "CLOSED"
    }
];


function renderBids() {

    const container =
        document.getElementById(
            "ipo-list-container"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    DEMO_IPOS.forEach(
        ipo => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "ipo-card";

            card.innerHTML = `

                <div class="ipo-header">

                    <div>

                        <div class="ipo-title">

                            ${escapeHtml(
                                ipo.name
                            )}

                            ${
                                ipo.tag
                                    ? `
                                        <span class="badge badge-tag">
                                            ${escapeHtml(
                                                ipo.tag
                                            )}
                                        </span>
                                      `
                                    : ""
                            }

                        </div>

                        <div class="ipo-dates">

                            ${escapeHtml(
                                ipo.dates
                            )}

                        </div>

                    </div>

                    <span
                        class="badge ${
                            ipo.status ===
                            "Ongoing"
                                ? "badge-complete"
                                : "badge-cancelled"
                        }"
                    >

                        ${escapeHtml(
                            ipo.status
                        )}

                    </span>

                </div>

                <div class="ipo-price-range">

                    ${escapeHtml(
                        ipo.priceRange
                    )}

                </div>

                <div class="ipo-action-bar">

                    <span
                        style="
                            font-size:11px;
                            color:var(--text-muted);
                        "
                    >
                        Demo UI
                    </span>

                    <button
                        class="btn-apply ${
                            ipo.status ===
                            "CLOSED"
                                ? "closed"
                                : ""
                        }"
                        onclick="applyIPO(
                            '${escapeHtml(
                                ipo.name
                            )}',
                            '${escapeHtml(
                                ipo.status
                            )}'
                        )"
                    >

                        ${
                            ipo.status ===
                            "Ongoing"
                                ? "Apply"
                                : "Closed"
                        }

                    </button>

                </div>
            `;

            container.appendChild(
                card
            );
        }
    );
}


function applyIPO(
    name,
    status
) {

    if (
        status ===
        "CLOSED"
    ) {

        showToast(
            "This IPO is closed for bidding.",
            true
        );

        return;
    }

    showToast(
        `${name} IPO is demo-only.`
    );
}


/* ============================================================
   ACCOUNT
   ============================================================ */

function updateAccountProfile() {

    const name =
        state.wallet.name ||
        "TRADEX USER";

    const email =
        state.wallet.email ||
        "demo@tradex.com";

    const profileText =
        document.querySelector(
            "#view-account .account-profile-card div:nth-child(2) div:first-child"
        );

    const profileSub =
        document.querySelector(
            "#view-account .account-profile-card div:nth-child(2) div:nth-child(2)"
        );

    const avatar =
        document.querySelector(
            "#view-account .avatar-circle"
        );

    if (profileText) {

        profileText.textContent =
            name.toUpperCase();
    }

    if (profileSub) {

        profileSub.textContent =
            `${email} • Client ID from server`;
    }

    if (avatar) {

        const initials =
            name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map(
                    word =>
                        word[0]
                )
                .join("")
                .toUpperCase();

        avatar.textContent =
            initials ||
            "TX";
    }
}


/* ============================================================
   PRIVACY MODE
   ============================================================ */

function togglePrivacyMode(
    enabled
) {

    state.privacyMode =
        Boolean(enabled);

    updateBalanceDisplay();

    if (
        state.activeView ===
        "portfolio"
    ) {

        renderPortfolio(
            state.activePortfolioTab
        );
    }

    showToast(
        enabled
            ? "Privacy Mode Enabled"
            : "Privacy Mode Disabled"
    );
}


/* ============================================================
   FUNDS
   ============================================================ */

function openFundsModal() {

    document
        .getElementById(
            "funds-modal-overlay"
        )
        ?.classList.add(
            "active"
        );
}


function closeFundsModal() {

    document
        .getElementById(
            "funds-modal-overlay"
        )
        ?.classList.remove(
            "active"
        );
}


async function addPaperFunds() {

    showToast(
        // "Add Virtual Cash ke liye server.js me /api/wallet/add-funds endpoint add karna hoga.",
            "Cant add virtual balance for compitition account",
        true
    );
}


/* ============================================================
   TOAST
   ============================================================ */

function showToast(
    message,
    isError = false
) {

    const toast =
        document.getElementById(
            "toast-alert"
        );

    const text =
        document.getElementById(
            "toast-message"
        );

    if (!toast || !text) {
        return;
    }

    text.textContent =
        message;

    const icon =
        toast.querySelector(
            "svg"
        );

    if (icon) {

        icon.style.fill =
            isError
                ? "var(--negative)"
                : "var(--positive)";
    }

    toast.classList.add(
        "show"
    );

    clearTimeout(
        showToast.timer
    );

    showToast.timer =
        setTimeout(
            () =>
                toast.classList.remove(
                    "show"
                ),
            3500
        );
}


/* ============================================================
   LOGOUT
   ============================================================ */

function confirmLogout() {

    if (
        confirm(
            "Are you sure you want to log out of TRADEX Paper Trading?"
        )
    ) {

        logoutAndRedirect();
    }
}


/* ============================================================
   MODALS
   ============================================================ */

function setupModalHandling() {

    document
        .querySelectorAll(
            ".modal-overlay"
        )
        .forEach(
            overlay => {

                overlay.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target ===
                            overlay
                        ) {

                            overlay.classList.remove(
                                "active"
                            );
                        }
                    }
                );
            }
        );
}


/* ============================================================
   INITIALIZATION
   ============================================================ */

async function initializeApp() {

    setupModalHandling();

    const token =
        getToken();

    if (!token) {

        showToast(
            "Login required. Login page se account login karo.",
            true
        );

        return;
    }

    try {

        await loadWallet();

        await loadStocks();

        await Promise.all([
            loadOrders(),
            loadPortfolio()
        ]);

        renderWatchlist();

        updateBalanceDisplay();

        updateAccountProfile();

    } catch (error) {

        console.error(
            "TRADEX initialization error:",
            error
        );

        showToast(
            error.message,
            true
        );
    }
}


/* ============================================================
   REFRESH ALL SERVER DATA
   ============================================================ */

async function refreshTradingData() {

    await Promise.all([
        loadWallet(),
        loadStocks(),
        loadOrders(),
        loadPortfolio()
    ]);
}


/* ============================================================
   SEARCH SETUP
   ============================================================ */

function setupSearch() {

    const input =
        document.getElementById(
            "watchlist-search"
        );

    if (!input) {
        return;
    }

    input.addEventListener(
        "input",
        event =>
            handleSearch(
                event.target.value
            )
    );
}


/* ============================================================
   RESIZE
   ============================================================ */

function setupResize() {

    window.addEventListener(
        "resize",
        () => {

            if (
                state.selectedStock &&
                document
                    .getElementById(
                        "order-modal-overlay"
                    )
                    ?.classList.contains(
                        "active"
                    )
            ) {

                drawCanvasChart();
            }
        }
    );
}


/* ============================================================
   AUTO REFRESH
   ============================================================ */

setInterval(
    async () => {

        if (
            !getToken()
        ) {
            return;
        }

        try {

            await refreshTradingData();

        } catch (error) {

            console.error(
                "Auto refresh error:",
                error
            );
        }

    },
    15000
);


/* ============================================================
   GLOBAL FUNCTIONS
   Required by index.html inline handlers
   ============================================================ */

window.switchTab =
    switchTab;

window.filterWatchlistTab =
    filterWatchlistTab;

window.handleSearch =
    handleSearch;

window.toggleFavorite =
    toggleFavorite;

window.openStockDetail =
    openStockDetail;

window.closeStockModal =
    closeStockModal;

window.updateChartTimeframe =
    updateChartTimeframe;

window.setOrderMode =
    setOrderMode;

window.toggleLimitPrice =
    toggleLimitPrice;

window.recalculateOrderEst =
    recalculateOrderEst;

window.executeOrder =
    executeOrder;

window.filterOrders =
    filterOrders;

window.switchPortfolioTab =
    switchPortfolioTab;

window.applyIPO =
    applyIPO;

window.togglePrivacyMode =
    togglePrivacyMode;

window.openFundsModal =
    openFundsModal;

window.closeFundsModal =
    closeFundsModal;

window.addPaperFunds =
    addPaperFunds;

window.confirmLogout =
    confirmLogout;

window.showToast =
    showToast;


/* ============================================================
   START
   ============================================================ */

window.addEventListener(
    "DOMContentLoaded",
    () => {

        setupSearch();

        setupResize();

        initializeApp();

    }
);