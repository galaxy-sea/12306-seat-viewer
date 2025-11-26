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

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const getTrainCode = (tr) => {
    const anchor =
      tr.querySelector('[id^="train_num_"] > div.train > div > a') ||
      tr.querySelector(".train > div > a");
    if (!anchor) return "未知";

    const rawText = anchor.textContent?.trim() || "未知";
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

  const fetchTrainMeta = (trainCode) => {
    if (!trainCode || trainCode === "未知") return Promise.resolve(null);
    if (metaCache.has(trainCode)) return Promise.resolve(metaCache.get(trainCode));
    if (metaRequests.has(trainCode)) return metaRequests.get(trainCode);

    const url = `https://kyfw.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/appFrontEnd/v2/lounge/open-smooth-common/qrCode/getDeptByTrainCode?trainCode=${encodeURIComponent(
      trainCode
    )}&reqType=form`;

    const request = fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: ""
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        const bureauName = data?.content?.data?.bureauName || null;
        const carType = data?.content?.data?.carInfo?.carType || null;
        const trainStyle = data?.content?.data?.carInfo?.trainStyle || null;
        const meta = { bureauName, carType, trainStyle };
        metaCache.set(trainCode, meta);
        return meta;
      })
      .catch(() => {
        metaCache.set(trainCode, null);
        return null;
      })
      .finally(() => {
        metaRequests.delete(trainCode);
      });

    metaRequests.set(trainCode, request);
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
    if (!trainCode || trainCode === "未知" || !runningDay) {
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

  const renderTooltip = (trainCode, metaInfo, seatPics) => {
    const safeTrain = escapeHtml(trainCode);
    const metaParts = [`<span class="sv-meta-item"><strong>车次:</strong> ${safeTrain}</span>`];
    if (metaInfo?.bureauName) {
      metaParts.push(`<span class="sv-meta-item"><strong>局属:</strong> ${escapeHtml(metaInfo.bureauName)}</span>`);
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

  const setTooltipPosition = (event) => {
    const offset = 12;
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 8;
    const maxTop = window.innerHeight - tooltip.offsetHeight - 8;
    const left = Math.min(maxLeft, event.clientX + offset);
    const top = Math.min(maxTop, event.clientY + offset);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const handleEnter = (event) => {
    const tr = event.currentTarget;
    currentHover = tr;

    const trainCode = getTrainCode(tr);
    const runningDay = getRunningDay();

    const metaCached = metaCache.has(trainCode) ? metaCache.get(trainCode) : undefined;
    const seatKey = runningDay ? `${trainCode}|${runningDay}` : null;
    const seatCached = seatKey && seatCache.has(seatKey) ? seatCache.get(seatKey) : undefined;

    tooltip.innerHTML = renderTooltip(trainCode, metaCached || undefined, seatCached || undefined);
    tooltip.style.display = "block";
    setTooltipPosition(event);

    if (metaCached === undefined) {
      fetchTrainMeta(trainCode).then((meta) => {
        if (currentHover === tr) {
          tooltip.innerHTML = renderTooltip(trainCode, meta || undefined, seatKey ? seatCache.get(seatKey) || undefined : undefined);
        }
      });
    }

    if (runningDay && seatCached === undefined) {
      fetchSeatPics(trainCode, runningDay).then((pics) => {
        if (currentHover === tr) {
          const meta = metaCache.has(trainCode) ? metaCache.get(trainCode) : undefined;
          tooltip.innerHTML = renderTooltip(trainCode, meta || undefined, pics || undefined);
        }
      });
    }
  };

  const handleLeave = () => {
    tooltip.style.display = "none";
    currentHover = null;
  };

  const handleMove = (event) => {
    if (tooltip.style.display !== "block") return;
    setTooltipPosition(event);
  };

  const bindRows = (rows) => {
    rows.forEach((tr) => {
      if (tr.dataset.svBound === "1") return;
      tr.dataset.svBound = "1";
      tr.addEventListener("mouseenter", handleEnter, { passive: true });
      tr.addEventListener("mouseleave", handleLeave, { passive: true });
      tr.addEventListener("mousemove", handleMove, { passive: true });
    });
  };

  const findRows = (tbody) =>
    Array.from(tbody.querySelectorAll("tr")).filter((tr) => {
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

    const rows = findRows(tbody);
    if (!rows.length) return;

    bindRows(rows);
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

    observeTable.currentTbody = tbody;
    observeTable.observer = new MutationObserver(() => {
      scheduleInit();
    });
    observeTable.observer.observe(tbody, { childList: true, subtree: true });
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

  const start = () => {
    init();
    observeTable();
    observeRoot();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
