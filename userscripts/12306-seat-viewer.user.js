// ==UserScript==
// @name         12306 车次座位查看
// @name:zh-CN   12306 车次座位查看
// @author       ChangJin Wei (魏昌进)
// @website      https://wcj.plus/
// @namespace    https://github.com/galaxy-sea/12306-seat-viewer
// @version      2026.624.10041
// @description  12306 车次座位查看让你避免乘坐二手句的老动车，让你避免花动车的钱乘坐到绿皮的体验
// @description:zh-CN 12306 车次座位查看让你避免乘坐二手句的老动车，让你避免花动车的钱乘坐到绿皮的体验
// @license      Apache-2.0
// @homepageURL  https://github.com/galaxy-sea/12306-seat-viewer
// @supportURL   https://github.com/galaxy-sea/12306-seat-viewer/issues
// @icon         https://raw.githubusercontent.com/galaxy-sea/12306-seat-viewer/main/icons/icon16.png
// @downloadURL  https://raw.githubusercontent.com/galaxy-sea/12306-seat-viewer/main/userscripts/12306-seat-viewer.user.js
// @updateURL    https://raw.githubusercontent.com/galaxy-sea/12306-seat-viewer/main/userscripts/12306-seat-viewer.user.js
// @match        https://kyfw.12306.cn/otn/leftTicket/init*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

GM_addStyle(".seat-viewer-tooltip {\n  position: fixed;\n  z-index: 2147483647;\n  max-width: 1080px;\n  width: fit-content;\n  padding: 10px 12px;\n  background: rgba(15, 23, 42, 0.92);\n  color: #f8fafc;\n  border-radius: 10px;\n  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);\n  font-family: \"Segoe UI\", \"PingFang SC\", sans-serif;\n  font-size: 13px;\n  line-height: 1.5;\n  pointer-events: none;\n  transition: opacity 120ms ease;\n}\n\n.sv-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  margin-bottom: 6px;\n  align-items: center;\n}\n\n.sv-meta-item {\n  white-space: nowrap;\n}\n\n.sv-seats {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(288px, 1fr));\n  gap: 8px;\n  margin-top: 4px;\n}\n\n.sv-seats.cols-1 {\n  grid-template-columns: repeat(1, minmax(288px, 1fr));\n  max-width: 336px;\n}\n\n.sv-seats.cols-2 {\n  grid-template-columns: repeat(2, minmax(288px, 1fr));\n  max-width: 672px;\n}\n\n.sv-seats.cols-3 {\n  grid-template-columns: repeat(3, minmax(288px, 1fr));\n  max-width: 1008px;\n}\n\n.sv-seat {\n  margin: 0;\n  text-align: center;\n  color: #e2e8f0;\n  font-size: 12px;\n}\n\n.sv-seat img {\n  width: 100%;\n  max-height: 288px;\n  object-fit: contain;\n  border-radius: 8px;\n  background: #0f172a;\n}\n\n.t-list .train-type .train-type-item.item-ju {\n  border: 1px solid #c084fc;\n  color: #7c3aed;\n}\n\n.sv-price {\n  margin-top: 2px;\n  color: #fb7403;\n  font-size: 12px;\n  font-weight: 400;\n  line-height: 1.2;\n  white-space: nowrap;\n}\n\n.t-list tr[id^=\"price_\"] {\n  /*display: none !important;*/\n}");

(() => {
  const tooltip = document.createElement("div");
  tooltip.className = "seat-viewer-tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);

  const metaCache = new Map();
  const metaRequests = new Map();
  const seatCache = new Map();
  const seatRequests = new Map();
  let currentHover = null;
  let currentTooltipPoint = null;

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const getTrainAnchor = (tr) =>
    tr.querySelector('[id^="train_num_"] > div.train > div > a') ||
    tr.querySelector(".train > div > a");

  const getRawTrainCode = (tr) => {
    const anchor = getTrainAnchor(tr);
    return anchor?.textContent?.trim() || "";
  };

  const getTrainCode = (tr) => {
    const anchor = getTrainAnchor(tr);
    if (!anchor) return "";

    const rawText = getRawTrainCode(tr);
    const onclick = anchor.getAttribute("onclick") || "";

    if (!onclick || onclick.includes(rawText)) {
      return rawText;
    }

    // onclick 形如 myStopStation.open('58','5e0000G4420G','NGH','HGH','20251126','3');
    const match = onclick.match(/open\(\s*'[^']*'\s*,\s*'([^']*)'/);
    const encoded = match?.[1];
    if (!encoded || encoded.length < 3) return rawText;

    const withoutTail = encoded.slice(0, -2); // 去掉末尾随机两字符
    for (let i = withoutTail.length - 1; i >= 0; i -= 1) {
      const ch = withoutTail[i];
      if (/[A-Za-z]/.test(ch)) {
        return withoutTail.slice(i);
      }
    }

    return rawText;
  };

  const ensureAnchorStyle = (tr) => {
    const anchor =
      tr.querySelector('[id^="train_num_"] > div.train > div > a') ||
      tr.querySelector(".train > div > a");
    if (!anchor) return;
    const style = anchor.getAttribute("style") || "";
    const needsHeight = !/height\s*:/.test(style);
    const needsLineHeight = !/line-height\s*:/.test(style);
    if (!needsHeight && !needsLineHeight) return;
    const merged = `${style}${needsHeight ? "height: 18px;" : ""}${needsLineHeight ? "line-height: 18px;" : ""}`;
    anchor.setAttribute("style", merged.trim());
  };

  const fetchTrainMeta = (trainCode, rawTrainCode = trainCode) => {
    if (!trainCode) return Promise.resolve(null);
    const queryDate = getRunningDay();
    if (!queryDate) return Promise.resolve(null);
    const bureauTrainCode = rawTrainCode || trainCode;

    const key = `${queryDate}|${trainCode}`;
    if (metaCache.has(key)) return Promise.resolve(metaCache.get(key));
    if (metaRequests.has(key)) return metaRequests.get(key);

    const fetchDeptMeta = async () => {
      const url = `https://kyfw.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/qrCode/getDeptByTrainCode?trainCode=${encodeURIComponent(
        trainCode
      )}&reqType=form`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: ""
      });
      if (!response.ok) throw new Error("Request failed");

      const data = await response.json();
      const bureauName = data?.content?.data?.bureauName || null;
      const deptName = data?.content?.data?.deptName || null;
      const carType = data?.content?.data?.carInfo?.carType || null;
      const trainStyle = data?.content?.data?.carInfo?.trainStyle || null;
      const perHourSpeed = data?.content?.data?.carInfo?.perHourSpeed ?? null;
      return { bureauName, deptName, carType, trainStyle, perHourSpeed };
    };

    const fetchBureauMeta = async (bureauTrainCode) => {
      const url = `https://kyfw.12306.cn/wxxcx/wechat/bigScreen/queryTrainBureau?queryDate=${encodeURIComponent(
        queryDate
      )}&trainCode=${encodeURIComponent(
        bureauTrainCode
      )}`;

      const response = await fetch(url, {
        method: "GET"
      });
      if (!response.ok) throw new Error("Request failed");

      const data = await response.json();
      const bureauName = data?.data?.bureau_code_name || null;
      const bureauCode = data?.data?.bureau_code || null;
      return { bureauName, bureauCode };
    };

    const request = fetchDeptMeta()
      .then(async (meta) => {
        if (meta?.bureauName) return meta;
        return fetchBureauMeta(bureauTrainCode);
      })
      .catch(() => fetchBureauMeta(bureauTrainCode))
      .then((meta) => {
        metaCache.set(key, meta);
        return meta;
      })
      .catch(() => {
        metaCache.set(key, null);
        return null;
      })
      .finally(() => {
        metaRequests.delete(key);
      });

    metaRequests.set(key, request);
    return request;
  };

  const getRunningDay = () => {
    const raw = document.getElementById("train_date")?.value?.trim();
    if (!raw) return null;
    const match = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return null;
    return match[0].replace(/-/g, "");
  };

  const fetchSeatPics = (trainCode, runningDay) => {
    if (!trainCode || !runningDay) {
      return Promise.resolve(null);
    }

    const key = `${trainCode}|${runningDay}`;
    if (seatCache.has(key)) return Promise.resolve(seatCache.get(key));
    if (seatRequests.has(key)) return seatRequests.get(key);

    const url = `https://kyfw.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/trainStyleBatch/getCarDetail?carCode=&trainCode=${encodeURIComponent(
      trainCode
    )}&runningDay=${encodeURIComponent(runningDay)}&reqType=form`;

    const request = fetch(url, {
      method: "GET"
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        const pics = data?.content?.data?.coachDetailPicList || null;
        seatCache.set(key, pics);
        return pics;
      })
      .catch(() => {
        seatCache.set(key, null);
        return null;
      })
      .finally(() => {
        seatRequests.delete(key);
      });

    seatRequests.set(key, request);
    return request;
  };

  const bureauMap = {
    哈尔滨: "哈",
    哈尔滨局: "哈",
    沈阳: "沈",
    沈阳局: "沈",
    北京: "京",
    北京局: "京",
    呼和浩特: "呼",
    呼和浩特局: "呼",
    太原: "太",
    太原局: "太",
    上海: "上",
    上海局: "上",
    济南: "济",
    济南局: "济",
    南昌: "南",
    南昌局: "南",
    广州: "广",
    广州局: "广",
    南宁: "宁",
    南宁局: "宁",
    武汉: "武",
    武汉局: "武",
    郑州: "郑",
    郑州局: "郑",
    成都: "成",
    成都局: "成",
    昆明: "昆",
    昆明局: "昆",
    青藏: "青",
    兰州: "兰",
    兰州局: "兰",
    乌鲁木齐: "乌",
    乌鲁木齐局: "乌",
    西安: "西",
    西安局: "西"
  };

  const getMetaCacheKey = (trainCode) => {
    const queryDate = getRunningDay();
    return queryDate && trainCode ? `${queryDate}|${trainCode}` : null;
  };

  const applyBureauBadge = (tr, metaInfo) => {
    if (!metaInfo?.bureauName) return;
    const container = tr.querySelector(".train-type");
    if (!container) return;

    const shortName = bureauMap[metaInfo.bureauName] || metaInfo.bureauName;

    let badge = container.querySelector("[data-sv-bureau='1']");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "train-type-item item-ju";
      badge.dataset.svBureau = "1";
      container.appendChild(badge);
    }
    badge.textContent = shortName;
    badge.title = metaInfo.bureauName;
  };

  const applyVisibleBureauBadge = (tr) => {
    const trainCode = getTrainCode(tr);
    const rawTrainCode = getRawTrainCode(tr);
    if (!trainCode) return;

    const key = getMetaCacheKey(trainCode);
    if (key && metaCache.has(key)) {
      applyBureauBadge(tr, metaCache.get(key));
      return;
    }

    fetchTrainMeta(trainCode, rawTrainCode).then((meta) => {
      applyBureauBadge(tr, meta);
    });
  };

  const isNearViewport = (element) => {
    const margin = 120;
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
  };

  const observeVisibleRow = (tr) => {
    if (tr.dataset.svBureauObserved === "1") return;
    tr.dataset.svBureauObserved = "1";

    if (isNearViewport(tr)) {
      applyVisibleBureauBadge(tr);
      return;
    }

    if (!("IntersectionObserver" in window)) {
      applyVisibleBureauBadge(tr);
      return;
    }

    if (!observeVisibleRow.observer) {
      observeVisibleRow.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            observeVisibleRow.observer.unobserve(entry.target);
            applyVisibleBureauBadge(entry.target);
          });
        },
        {
          root: null,
          rootMargin: "120px 0px",
          threshold: 0.01
        }
      );
    }

    observeVisibleRow.observer.observe(tr);
  };

  const scanVisibleBureauRows = () => {
    const tbody = document.getElementById("queryLeftTable");
    if (!tbody) return;

    findRows(tbody).forEach((tr) => {
      if (!isNearViewport(tr)) return;
      if (tr.querySelector("[data-sv-bureau='1']")) return;

      applyVisibleBureauBadge(tr);
    });
  };

  const scheduleVisibleBureauScan = (() => {
    let timer = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        scanVisibleBureauRows();
        timer = null;
      }, 80);
    };
  })();

  const getPriceFromTicketCell = (ticketCell) => {
    const label = ticketCell.getAttribute("aria-label") || "";
    const match = label.match(/票价\s*([0-9]+(?:\.[0-9]+)?)\s*元/);
    return match ? `¥${match[1]}` : "";
  };

  const seatTypeMap = {
    SWZ: "9",
    ZY: "M",
    ZE: "O",
    WZ: "W"
  };

  const getSeatTypeCode = (ticketCell) => {
    const seatKey = ticketCell.id?.split("_")[0] || "";
    return seatTypeMap[seatKey] || "";
  };

  const getDiscountMap = (ticketRow) => {
    const raw = ticketRow.getAttribute("seat_discount_info") || "";
    const discounts = new Map();
    raw.replace(/([A-Z0-9])(\d{4})/g, (_, seatTypeCode, discountCode) => {
      const discountValue = Number(discountCode) / 10;
      if (discountValue > 0) {
        const discountText = Number.isInteger(discountValue)
          ? `${discountValue}`
          : discountValue.toFixed(1);
        discounts.set(seatTypeCode, discountText);
      }
      return "";
    });
    return discounts;
  };

  const getDiscountFromTicketCell = (ticketCell, discountMap) => {
    const seatTypeCode = getSeatTypeCode(ticketCell);
    return seatTypeCode ? discountMap.get(seatTypeCode) || "" : "";
  };

  const setPriceBadge = (ticketCell, priceText, discountText = "") => {
    let priceBadge = ticketCell.querySelector(":scope > .sv-price");
    if (!priceText || !priceText.includes("¥")) {
      priceBadge?.remove();
      return;
    }

    if (!priceBadge) {
      priceBadge = document.createElement("div");
      priceBadge.className = "sv-price";
      ticketCell.appendChild(priceBadge);
    }
    const html = discountText
      ? `${escapeHtml(priceText)} <span style="color:grey;">${escapeHtml(discountText)}</span>`
      : escapeHtml(priceText);
    if (priceBadge.innerHTML !== html) {
      priceBadge.innerHTML = html;
    }
  };

  const syncTicketCellPrices = (tbody) => {
    tbody.querySelectorAll('tr[id^="ticket_"]').forEach((ticketRow) => {
      const discountMap = getDiscountMap(ticketRow);
      Array.from(ticketRow.children)
        .filter((cell) => cell.tagName === "TD")
        .forEach((ticketCell) => {
          setPriceBadge(
            ticketCell,
            getPriceFromTicketCell(ticketCell),
            getDiscountFromTicketCell(ticketCell, discountMap)
          );
        });
    });
  };

  const syncPrices = (tbody) => {
    syncTicketCellPrices(tbody);
  };

  const renderTooltip = (trainCode, metaInfo, seatPics) => {
    const safeTrain = escapeHtml(trainCode);
    const metaParts = [`<span class="sv-meta-item"><strong>车次:</strong> ${safeTrain}</span>`];
    if (metaInfo?.bureauName || metaInfo?.deptName) {
      const bureauText = [metaInfo.bureauName, metaInfo.deptName].filter(Boolean).join("-");
      metaParts.push(`<span class="sv-meta-item"><strong>局属:</strong> ${escapeHtml(bureauText)}</span>`);
    }
    if (metaInfo?.perHourSpeed) {
      metaParts.push(`<span class="sv-meta-item"><strong>时速:</strong> ${escapeHtml(metaInfo.perHourSpeed)} </span>`);
    }
    if (metaInfo?.carType) {
      const styleText = metaInfo.trainStyle ? `：${escapeHtml(metaInfo.trainStyle)}` : "";
      metaParts.push(`<span class="sv-meta-item"> ${escapeHtml(metaInfo.carType)}${styleText}</span>`);
    }

    const parts = [`<div class="sv-meta">${metaParts.join("")}</div>`];

    if (seatPics && seatPics.length) {
      const prefix = "https://wifi.12306.cn/resourcecenter/cateringimages/";
      const cols = Math.min(3, seatPics.length);
      const colsClass = `cols-${cols}`;
      const images = seatPics
        .slice()
        .sort((a, b) => (a?.picOrder || 0) - (b?.picOrder || 0))
        .map((pic) => {
          const url = pic?.pictureUrl?.startsWith("http")
            ? pic.pictureUrl
            : `${prefix}${pic?.pictureUrl || ""}`;
          const rawName = pic?.pictureName || "座位";
          const baseName = rawName.split("#")[0] || rawName;
          const name = escapeHtml(baseName);
          return `<figure class="sv-seat"><img src="${escapeHtml(url)}" alt="${name}"><figcaption>${name}</figcaption></figure>`;
        })
        .join("");
      parts.push(`<div class="sv-seats ${colsClass}">${images}</div>`);
    }

    return parts.join("");
  };

  const setTooltipPosition = (point) => {
    const offsetY = 30;
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 8;
    const maxTop = window.innerHeight - tooltip.offsetHeight - offsetY;
    const centeredLeft = (window.innerWidth - tooltip.offsetWidth) / 2;
    const left = Math.max(8, Math.min(maxLeft, centeredLeft));
    const belowTop = point.clientY + offsetY;
    const aboveTop = point.clientY - tooltip.offsetHeight - offsetY;
    const top = belowTop <= maxTop ? belowTop : Math.max(8, aboveTop);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const scheduleTooltipPosition = (tr) => {
    requestAnimationFrame(() => {
      if (currentHover !== tr || !currentTooltipPoint) return;
      setTooltipPosition(currentTooltipPoint);
      tooltip.style.visibility = "visible";
    });
  };

  const handleEnter = (event) => {
    const tr = event.currentTarget;
    currentHover = tr;
    currentTooltipPoint = { clientY: event.clientY };
    ensureAnchorStyle(tr);

    const trainCode = getTrainCode(tr);
    const rawTrainCode = getRawTrainCode(tr);
    const runningDay = getRunningDay();

    const metaKey = getMetaCacheKey(trainCode);
    const metaCached = metaKey && metaCache.has(metaKey) ? metaCache.get(metaKey) : undefined;
    const seatKey = runningDay ? `${trainCode}|${runningDay}` : null;
    const seatCached = seatKey && seatCache.has(seatKey) ? seatCache.get(seatKey) : undefined;

    tooltip.innerHTML = renderTooltip(trainCode, metaCached || undefined, seatCached || undefined);
    if (metaCached) applyBureauBadge(tr, metaCached);
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    scheduleTooltipPosition(tr);

    if (metaCached === undefined) {
      fetchTrainMeta(trainCode, rawTrainCode).then((meta) => {
        applyBureauBadge(tr, meta);
        if (currentHover === tr) {
          tooltip.innerHTML = renderTooltip(trainCode, meta || undefined, seatKey ? seatCache.get(seatKey) || undefined : undefined);
          scheduleTooltipPosition(tr);
        }
      });
    }

    if (runningDay && seatCached === undefined) {
      fetchSeatPics(trainCode, runningDay).then((pics) => {
        if (currentHover === tr) {
          const meta = metaKey && metaCache.has(metaKey) ? metaCache.get(metaKey) : undefined;
          tooltip.innerHTML = renderTooltip(trainCode, meta || undefined, pics || undefined);
          scheduleTooltipPosition(tr);
        }
      });
    }
  };

  const handleLeave = () => {
    tooltip.style.display = "none";
    tooltip.style.visibility = "hidden";
    currentHover = null;
    currentTooltipPoint = null;
  };

  const handleMove = (event) => {
    const tr = event.currentTarget;
    if (currentHover !== tr || tooltip.style.display !== "block") return;

    currentTooltipPoint = { clientY: event.clientY };
    scheduleTooltipPosition(tr);
  };

  const bindRows = (rows) => {
    rows.forEach((tr) => {
      observeVisibleRow(tr);

      if (tr.dataset.svBound !== "1") {
        tr.dataset.svBound = "1";
        tr.addEventListener("mouseenter", handleEnter, { passive: true });
        tr.addEventListener("mouseleave", handleLeave, { passive: true });
        tr.addEventListener("mousemove", handleMove, { passive: true });
      }
    });
  };

  const findRows = (tbody) =>
    Array.from(tbody.querySelectorAll("tr")).filter((tr) => {
      if (tr.id?.startsWith("price_")) return false;
      const hasCells = tr.querySelectorAll("td").length > 0;
      const text = tr.innerText.trim();
      return hasCells && text.length > 0;
    });

  const init = () => {
    const dateInput = document.getElementById("train_date");
    const tbody = document.getElementById("queryLeftTable");
    if (!dateInput || !tbody) return;

    const dateValue = dateInput.value?.trim();
    if (!dateValue) return;

    syncPrices(tbody);

    const rows = findRows(tbody);
    if (!rows.length) return;

    bindRows(rows);
    scanVisibleBureauRows();
  };

  const observeTable = () => {
    const tbody = document.getElementById("queryLeftTable");
    if (!tbody) return;

    if (observeTable.currentTbody === tbody) {
      return;
    }

    if (observeTable.observer && observeTable.currentTbody) {
      observeTable.observer.disconnect();
    }
    if (observeVisibleRow.observer) {
      observeVisibleRow.observer.disconnect();
      observeVisibleRow.observer = null;
    }

    observeTable.currentTbody = tbody;
    observeTable.observer = new MutationObserver(() => {
      scheduleInit();
    });
    observeTable.observer.observe(tbody, {
      attributes: true,
      attributeFilter: ["style", "class"],
      childList: true,
      subtree: true
    });
  };

  const scheduleInit = (() => {
    let timer = null;
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        init();
        timer = null;
      }, 60);
    };
  })();

  const observeRoot = () => {
    if (observeRoot.observer) return;
    observeRoot.observer = new MutationObserver(() => {
      observeTable();
      scheduleInit();
    });
    observeRoot.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  const observeScroll = () => {
    if (observeScroll.bound) return;
    observeScroll.bound = true;
    window.addEventListener("scroll", scheduleVisibleBureauScan, { passive: true, capture: true });
    window.addEventListener("resize", scheduleVisibleBureauScan, { passive: true });
  };

  const start = () => {
    init();
    observeTable();
    observeRoot();
    observeScroll();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
