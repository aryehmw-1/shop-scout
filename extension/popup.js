const $ = (id) => document.getElementById(id);

async function getBaseUrl() {
  const data = await chrome.storage.sync.get(["shopScoutBaseUrl"]);
  return (data.shopScoutBaseUrl || "http://localhost:3000").replace(/\/$/, "");
}

async function scrapeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");

  const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PAGE" });
  if (!response?.url) {
    return {
      url: tab.url || "",
      title: tab.title || "Product",
    };
  }
  return response;
}

function renderPage(ctx) {
  const lines = [
    `<strong>${escapeHtml(ctx.title || "Product")}</strong>`,
    `<span class="muted">${escapeHtml(ctx.url || "")}</span>`,
  ];
  if (ctx.price) lines.push(`On-page price: <strong>$${ctx.price.toFixed(2)}</strong>`);
  if (ctx.asin) lines.push(`ASIN: ${escapeHtml(ctx.asin)}`);
  $("page").innerHTML = lines.join("<br/>");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function proxyImage(base, url) {
  if (!url?.startsWith("https://")) return "";
  return `${base}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function renderOffers(base, data) {
  const list = $("offers");
  list.innerHTML = "";

  for (const o of data.offers || []) {
    const li = document.createElement("li");
    const img = o.imageUrl
      ? `<img src="${proxyImage(base, o.imageUrl)}" alt="" />`
      : `<div style="width:48px;height:48px;background:#f5f5f4;border-radius:6px"></div>`;
    li.innerHTML = `
      ${img}
      <div class="meta">
        <div class="store">${escapeHtml(o.retailerName || o.retailer)}</div>
        <div class="price">$${Number(o.landedCost ?? o.price).toFixed(2)}</div>
        <div class="muted">${escapeHtml(o.priceNote || "")}</div>
        <a href="${escapeHtml(o.productUrl)}" target="_blank" rel="noopener">View store</a>
      </div>
    `;
    list.appendChild(li);
  }
}

async function init() {
  const base = await getBaseUrl();
  $("baseUrl").value = base;
  $("openChat").href = `${base}/chat`;

  try {
    const page = await scrapeActiveTab();
    renderPage(page);
    $("compare").onclick = () => runCompare(base, page);
  } catch (e) {
    $("page").textContent =
      "Open a supported store tab (Amazon, Walmart, Target, …) and try again.";
    $("compare").disabled = true;
  }

  $("saveUrl").onclick = async () => {
    const url = $("baseUrl").value.trim().replace(/\/$/, "");
    await chrome.storage.sync.set({ shopScoutBaseUrl: url || "http://localhost:3000" });
    $("status").textContent = "Server URL saved.";
    $("openChat").href = `${url || "http://localhost:3000"}/chat`;
  };
}

async function runCompare(base, page) {
  const status = $("status");
  const btn = $("compare");
  status.className = "status";
  status.textContent = "Comparing…";
  btn.disabled = true;

  try {
    const res = await fetch(`${base}/api/extension/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: page.url,
        title: page.title,
        price: page.price,
        asin: page.asin,
        retailer: page.retailer,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Compare failed");
    }

    renderOffers(base, data);
    status.textContent = data.amazonPaapi
      ? "Amazon price from PA-API when configured."
      : "Catalog + store links — add Amazon PA-API keys for live Amazon prices.";
    $("openChat").href = `${base}${data.chatUrl || "/chat"}`;
  } catch (e) {
    status.className = "status error";
    status.textContent =
      e.message ||
      "Could not reach Shop Scout. Is the dev server running on the URL above?";
  } finally {
    btn.disabled = false;
  }
}

init();
