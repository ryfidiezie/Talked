const RATES_TO_USD = {
  usd: 1.0,
  eur: 1.08,
  gbp: 1.28,
  jpy: 0.0065,
  cad: 0.74,
  aud: 0.65,
  chf: 1.13,
  cny: 0.14
};

const LENGTH_TO_METERS = {
  m: 1,
  meter: 1,
  meters: 1,
  km: 1000,
  cm: 0.01,
  mm: 0.001,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  ft: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254
};

const WEIGHT_TO_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  lb: 453.592,
  lbs: 453.592,
  oz: 28.3495,
  ounce: 28.3495
};

function tryConvert(query) {
  const q = query.trim().toLowerCase();
  const match = q.match(/^([\d.,]+)\s*([a-zA-Z\$\€\£\¥\/]+)\s*(?:to|in)\s*([a-zA-Z\$\€\£\¥\/]+)$/i);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(val)) return null;
  let from = match[2].toLowerCase();
  let to = match[3].toLowerCase();

  if (from === "c" && to === "f") return `${val} C = ${parseFloat(((val * 9) / 5 + 32).toFixed(2))} F`;
  if (from === "f" && to === "c") return `${val} F = ${parseFloat((((val - 32) * 5) / 9).toFixed(2))} C`;

  if (RATES_TO_USD[from] && RATES_TO_USD[to]) {
    const usd = val * RATES_TO_USD[from];
    const converted = usd / RATES_TO_USD[to];
    return `${val} ${from.toUpperCase()} = ${converted.toFixed(2)} ${to.toUpperCase()}`;
  }

  if (LENGTH_TO_METERS[from] && LENGTH_TO_METERS[to]) {
    const meters = val * LENGTH_TO_METERS[from];
    const converted = meters / LENGTH_TO_METERS[to];
    return `${val} ${from} = ${parseFloat(converted.toFixed(4))} ${to}`;
  }

  if (WEIGHT_TO_GRAMS[from] && WEIGHT_TO_GRAMS[to]) {
    const grams = val * WEIGHT_TO_GRAMS[from];
    const converted = grams / WEIGHT_TO_GRAMS[to];
    return `${val} ${from} = ${parseFloat(converted.toFixed(4))} ${to}`;
  }

  return null;
}

function tryCalc(query) {
  let q = query.trim();
  if (q.toLowerCase().startsWith("/calc ")) {
    q = q.slice(6).trim();
  }
  const mathRe = /^[\d\s\+\-\*\/\^\%\(\)\.\,a-zA-Z]{2,}$/;
  if (!mathRe.test(q) || !/[\+\-\*\/\^\%]/.test(q) || !/\d/.test(q)) return null;
  const safe = q
    .replace(/\^/g, "**")
    .replace(/\bsqrt\b/g, "Math.sqrt")
    .replace(/\babs\b/g, "Math.abs")
    .replace(/\bround\b/g, "Math.round")
    .replace(/\bPI\b|\bpi\b/g, "Math.PI")
    .replace(/\bsin\b/g, "Math.sin")
    .replace(/\bcos\b/g, "Math.cos");
  try {
    const fn = new Function("Math", `"use strict"; return (${safe})`);
    const res = fn(Math);
    if (typeof res === "number" && isFinite(res)) {
      return Number(parseFloat(res.toPrecision(12))).toString();
    }
  } catch (_) {}
  return null;
}

const SAMPLE_CLIPS = [
  { text: "git clone https://github.com/developer/talked.git", time: "10:14 AM" },
  { text: "npm install", time: "09:50 AM" },
  { text: "const host = '127.0.0.1';", time: "09:15 AM" }
];

const SIMPLE_COMMANDS = [
  { cmd: "/clip", desc: "Clipboard history", run: () => "Recent clipboard history opened" },
  { cmd: "/ip", desc: "Show IP addresses", run: () => "IP: 192.168.1.142 (Ethernet), 10.0.0.15" },
  { cmd: "/sysinfo", desc: "System details", run: () => "Windows 11 Pro x64 - 16 GB RAM" },
  { cmd: "/time", desc: "Current local time", run: () => new Date().toLocaleTimeString() },
  { cmd: "/date", desc: "Current date", run: () => new Date().toLocaleDateString() },
  { cmd: "/snap left", desc: "Snap window to left", run: () => "Window snapped to left half" },
  { cmd: "/snap right", desc: "Snap window to right", run: () => "Window snapped to right half" },
  { cmd: "/vol mute", desc: "Mute audio", run: () => "Audio muted" },
  { cmd: "/lock", desc: "Lock PC", run: () => "Workstation locked" }
];

document.addEventListener("DOMContentLoaded", () => {
  const inputEl = document.getElementById("simInput");
  const resultsContainer = document.getElementById("simResults");
  const outputBanner = document.getElementById("simOutputBanner");
  const outputText = document.getElementById("simOutputText");
  const copyBtn = document.getElementById("simCopyBtn");
  const modeSearchBtn = document.getElementById("modeSearchBtn");
  const modeGridBtn = document.getElementById("modeGridBtn");
  const simVoiceBtn = document.getElementById("simVoiceBtn");
  const actionGridWrap = document.getElementById("simActionGrid");

  let activeMode = "search";
  let selectedIndex = 0;
  let currentResults = [];
  let currentCopyValue = "";
  let isVoiceActive = false;

  function setMode(mode) {
    activeMode = mode;
    if (mode === "search") {
      modeSearchBtn.classList.add("active");
      modeGridBtn.classList.remove("active");
      actionGridWrap.style.display = "none";
      renderResults();
    } else {
      modeSearchBtn.classList.remove("active");
      modeGridBtn.classList.add("active");
      resultsContainer.style.display = "none";
      actionGridWrap.style.display = "grid";
    }
  }

  modeSearchBtn.addEventListener("click", () => setMode("search"));
  modeGridBtn.addEventListener("click", () => setMode("grid"));

  function showOutput(text, copyVal) {
    outputText.textContent = text;
    currentCopyValue = copyVal || text;
    outputBanner.style.display = "flex";
  }

  function hideOutput() {
    outputBanner.style.display = "none";
  }

  copyBtn.addEventListener("click", () => {
    if (!currentCopyValue) return;
    navigator.clipboard.writeText(currentCopyValue);
    const orig = copyBtn.textContent;
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = orig;
    }, 1200);
  });

  function buildResults(query) {
    const q = query.trim();
    if (!q) return [];
    const list = [];

    const calcVal = tryCalc(q);
    if (calcVal !== null) {
      list.push({
        title: calcVal,
        sub: `Result for ${q}`,
        badge: "calc",
        action: () => {
          showOutput(`${q} = ${calcVal}`, calcVal);
          navigator.clipboard.writeText(calcVal);
        }
      });
    }

    const convertVal = tryConvert(q);
    if (convertVal !== null) {
      list.push({
        title: convertVal,
        sub: "Converted value",
        badge: "convert",
        action: () => {
          showOutput(convertVal, convertVal);
          navigator.clipboard.writeText(convertVal);
        }
      });
    }

    if (/^\/(?:clip|clips)/i.test(q)) {
      SAMPLE_CLIPS.forEach(item => {
        list.push({
          title: item.text,
          sub: item.time,
          badge: "clip",
          action: () => {
            navigator.clipboard.writeText(item.text);
            showOutput(`Copied: ${item.text}`, item.text);
          }
        });
      });
    }

    if (q.startsWith("/")) {
      const match = SIMPLE_COMMANDS.filter(c => c.cmd.toLowerCase().startsWith(q.toLowerCase()));
      match.forEach(c => {
        list.push({
          title: c.cmd,
          sub: c.desc,
          badge: "cmd",
          action: () => {
            const out = c.run();
            showOutput(out);
          }
        });
      });
    } else {
      if (q.toLowerCase().includes("code") || q.toLowerCase().includes("vs")) {
        list.push({
          title: "Visual Studio Code",
          sub: "Open application",
          badge: "app",
          action: () => showOutput("Opening Visual Studio Code")
        });
      }
      if (q.toLowerCase().includes("term") || q.toLowerCase().includes("cmd")) {
        list.push({
          title: "Windows Terminal",
          sub: "Open terminal",
          badge: "app",
          action: () => showOutput("Opening Windows Terminal")
        });
      }

      list.push({
        title: `Search Google for "${q}"`,
        sub: "Open in browser",
        badge: "web",
        action: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank")
      });
    }

    return list;
  }

  function renderResults() {
    if (activeMode !== "search") return;
    const q = inputEl.value;
    currentResults = buildResults(q);

    if (currentResults.length === 0) {
      resultsContainer.style.display = "none";
      return;
    }

    resultsContainer.style.display = "flex";
    resultsContainer.innerHTML = "";

    currentResults.slice(0, 6).forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "result-item" + (idx === selectedIndex ? " selected" : "");

      const left = document.createElement("div");
      left.className = "result-left";

      const textBox = document.createElement("div");
      textBox.className = "result-text-box";

      const title = document.createElement("span");
      title.className = "result-title";
      title.textContent = item.title;

      const sub = document.createElement("span");
      sub.className = "result-sub";
      sub.textContent = item.sub;

      textBox.appendChild(title);
      textBox.appendChild(sub);
      left.appendChild(textBox);

      const badge = document.createElement("span");
      badge.className = "result-badge";
      badge.textContent = item.badge;

      row.appendChild(left);
      row.appendChild(badge);

      row.addEventListener("mouseenter", () => {
        selectedIndex = idx;
        updateSelectedRow();
      });

      row.addEventListener("click", () => {
        item.action();
      });

      resultsContainer.appendChild(row);
    });
  }

  function updateSelectedRow() {
    const rows = resultsContainer.querySelectorAll(".result-item");
    rows.forEach((r, i) => {
      if (i === selectedIndex) r.classList.add("selected");
      else r.classList.remove("selected");
    });
  }

  function handleQueryChange() {
    selectedIndex = 0;
    hideOutput();
    renderResults();
  }

  inputEl.addEventListener("input", handleQueryChange);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        updateSelectedRow();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
        updateSelectedRow();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentResults.length > 0 && currentResults[selectedIndex]) {
        currentResults[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      inputEl.value = "";
      hideOutput();
      renderResults();
    }
  });

  const chips = document.querySelectorAll(".s-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      setMode("search");
      const val = chip.getAttribute("data-query");
      inputEl.value = val;
      handleQueryChange();
      inputEl.focus();
    });
  });

  const gridButtons = document.querySelectorAll(".grid-button");
  gridButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-action");
      if (act === "snap-left") showOutput("Snapped active window left");
      else if (act === "snap-right") showOutput("Snapped active window right");
      else if (act === "maximize") showOutput("Window maximized");
      else if (act === "minimize") showOutput("Showing desktop");
      else if (act === "color") {
        showOutput("Color #7ca3f5 copied to clipboard", "#7ca3f5");
        navigator.clipboard.writeText("#7ca3f5");
      } else if (act === "screenshot") showOutput("Screenshot saved");
      else if (act === "clips") {
        setMode("search");
        inputEl.value = "/clip";
        handleQueryChange();
      } else if (act === "vol-mute") showOutput("Audio mute toggled");
    });
  });

  simVoiceBtn.addEventListener("click", () => {
    isVoiceActive = !isVoiceActive;
    if (isVoiceActive) {
      simVoiceBtn.classList.add("active");
      showOutput("Listening on mic. Talk naturally...");
    } else {
      simVoiceBtn.classList.remove("active");
      showOutput("Voice session ended.");
    }
  });

  const copyButtons = document.querySelectorAll(".cmd-copy");
  copyButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.getAttribute("data-copy");
      navigator.clipboard.writeText(val);
      const orig = btn.textContent;
      btn.textContent = "copied";
      setTimeout(() => {
        btn.textContent = orig;
      }, 1200);
    });
  });

  inputEl.value = "12 * 8.5";
  handleQueryChange();
});
