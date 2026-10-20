// SEVENTEEN Members - loads members.json and builds the page.
var members = [];
var selectedId = "";
var activeUnit = "All";

var elStack = document.getElementById("folderStack");
var elCard = document.getElementById("idCard");
var elStatus = document.getElementById("status");
var elHome = document.getElementById("homeView");
var elDetail = document.getElementById("detailView");
var elTitle = document.getElementById("detailTitle");
var elCrumb = document.getElementById("crumb");
var elBack = document.getElementById("backBtn");
var elFilter = document.getElementById("unitFilter");

// Respect the visitor's "reduce motion" setting.
var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) {
  document.body.classList.add("reduce-motion");
}

// Escape text from the JSON before it goes into innerHTML.
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fileNumber(i) {
  return String(1000 + i + 1).slice(1); // 0 -> "001"
}

function showError(message) {
  elStatus.className = "archive-status alert alert-danger";
  elStatus.setAttribute("role", "alert");
  elStatus.textContent = message;
  elHome.hidden = true;
  elDetail.hidden = true;
}

function findMember(id) {
  for (var i = 0; i < members.length; i++) {
    if (members[i].id === id) {
      return i;
    }
  }
  return -1;
}

function renderFolders() {
  var html = "";
  var shown = 0;
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    if (activeUnit !== "All" && m.unit !== activeUnit) {
      continue;
    }
    html += `<button type="button" class="folder tone-${shown % 7} p-${shown % 4}" data-id="${escapeHTML(m.id)}" aria-pressed="false" aria-label="Open archive profile: ${escapeHTML(m.stageName)}">
      <span class="folder-tab"><span class="tab-text">FILE ${fileNumber(i)} <span aria-hidden="true">·</span> ${escapeHTML(m.stageName)}</span></span>
      <span class="folder-meta"><span>${escapeHTML(m.realName)} &middot; ${escapeHTML(m.unit)}</span><span>${escapeHTML(m.birthday)}</span></span>
    </button>`;
    shown++;
  }
  // the front folder: a full folder that closes the stack
  html += `<div class="cover-folder">
    <span class="folder-tab cover-tab p-0"><span class="tab-text">THE COMPLETE COLLECTION</span></span>
    <div class="cover-text">
      <p class="cover-big">Seventeen</p>
      <p class="cover-sub">${members.length} profiles <span aria-hidden="true">·</span> ${getUnits().length} units</p>
    </div>
  </div>`;
  elStack.innerHTML = html;
  updateSelection();
  // stagger the entrance animation of the folders
  var folders = elStack.querySelectorAll(".folder");
  for (var j = 0; j < folders.length; j++) {
    folders[j].style.setProperty("--i", j);
  }
}

// Collect each unit once (in the order they appear in the JSON).
function getUnits() {
  var units = [];
  for (var i = 0; i < members.length; i++) {
    if (units.indexOf(members[i].unit) === -1) {
      units.push(members[i].unit);
    }
  }
  return units;
}

function countUnit(unit) {
  var total = 0;
  for (var i = 0; i < members.length; i++) {
    if (members[i].unit === unit) {
      total++;
    }
  }
  return total;
}

function renderFilters() {
  var units = getUnits();
  var html = `<button type="button" class="pill" data-unit="All" aria-pressed="true">All members<span class="count">${members.length}</span></button>`;
  for (var i = 0; i < units.length; i++) {
    html += `<button type="button" class="pill" data-unit="${escapeHTML(units[i])}" aria-pressed="false">${escapeHTML(units[i])}<span class="count">${countUnit(units[i])}</span></button>`;
  }
  elFilter.innerHTML = html;
}

function handleFilterClick(event) {
  var button = event.target.closest("button[data-unit]");
  if (!button) {
    return;
  }
  activeUnit = button.getAttribute("data-unit");
  var pills = elFilter.querySelectorAll("button[data-unit]");
  for (var i = 0; i < pills.length; i++) {
    pills[i].setAttribute("aria-pressed", pills[i] === button ? "true" : "false");
  }
  renderFolders();
}

// Age and days until the next birthday, worked out from the birthday text in the JSON.
function birthdayInfo(text) {
  var born = new Date(text);
  if (isNaN(born.getTime())) {
    return "";
  }
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var next = new Date(now.getFullYear(), born.getMonth(), born.getDate());
  var age = now.getFullYear() - born.getFullYear();
  if (today < next) {
    age--;
  } else if (today > next) {
    next = new Date(now.getFullYear() + 1, born.getMonth(), born.getDate());
  }
  var days = Math.round((next - today) / 86400000);
  if (days === 0) {
    return "Turns " + age + " today";
  }
  return "Age " + age + " \u00b7 birthday in " + days + " days";
}

function goNeighbor(step) {
  var index = findMember(selectedId);
  if (index === -1) {
    return;
  }
  showDetail(members[(index + step + members.length) % members.length].id);
}

function handleKey(event) {
  if (elDetail.hidden) {
    return;
  }
  if (event.key === "Escape") {
    showHome();
  } else if (event.key === "ArrowLeft") {
    goNeighbor(-1);
  } else if (event.key === "ArrowRight") {
    goNeighbor(1);
  }
}

// Mark the last opened member on the folder (aria-pressed + outline).
function updateSelection() {
  var buttons = document.querySelectorAll("button[data-id]");
  for (var i = 0; i < buttons.length; i++) {
    var isSelected = buttons[i].getAttribute("data-id") === selectedId;
    buttons[i].setAttribute("aria-pressed", isSelected ? "true" : "false");
    if (isSelected) {
      buttons[i].classList.add("is-selected");
    } else {
      buttons[i].classList.remove("is-selected");
    }
  }
}

function photoPlaceholder(m) {
  return `<div class="photo-placeholder" role="img" aria-label="Photo placeholder for ${escapeHTML(m.stageName)}"><span>MEMBER PHOTO</span></div>`;
}

function renderIdCard() {
  var index = findMember(selectedId);
  if (index === -1) {
    return;
  }
  var m = members[index];
  var prev = members[(index - 1 + members.length) % members.length];
  var next = members[(index + 1) % members.length];
  var photoHTML = photoPlaceholder(m);
  if (m.photo) {
    photoHTML = `<img src="${escapeHTML(m.photo)}" alt="Portrait of ${escapeHTML(m.stageName)}">`;
  }

  elCard.innerHTML = `<div class="open-folder tone-${index % 7}">
    <span class="folder-tab open-tab p-1"><span class="tab-text">ARCHIVE FILE ${fileNumber(index)} <span aria-hidden="true">·</span> ${escapeHTML(m.stageName)}</span></span>
    <div class="side-tabs">
      <button type="button" class="side-tab" data-go="${escapeHTML(prev.id)}" aria-label="Previous file: ${escapeHTML(prev.stageName)}">&lsaquo; ${escapeHTML(prev.stageName)}</button>
      <button type="button" class="side-tab" data-go="${escapeHTML(next.id)}" aria-label="Next file: ${escapeHTML(next.stageName)}">${escapeHTML(next.stageName)} &rsaquo;</button>
    </div>
    <article class="paper" aria-labelledby="realName">
      <span class="file-tag">Profile ${fileNumber(index)}</span>
      <div class="row g-3">
        <div class="col-5 col-md-4 col-lg-3 min-w-0"><div class="photo-frame" id="photoFrame">${photoHTML}</div></div>
        <div class="col-7 col-md-8 col-lg-9 min-w-0">
          <p class="mono mb-0">Full name</p>
          <h3 id="realName" class="paper-name">${escapeHTML(m.realName)}</h3>
          <dl class="id-fields mb-0">
            <dt>Stage name</dt><dd>${escapeHTML(m.stageName)}</dd>
            <dt>Birthday</dt><dd>${escapeHTML(m.birthday)}<span class="bday-note">${birthdayInfo(m.birthday)}</span></dd>
            <dt>Nationality</dt><dd>${escapeHTML(m.nationality)}</dd>
            <dt>Unit</dt><dd>${escapeHTML(m.unit)}</dd>
            <dt>Position</dt><dd>${escapeHTML(m.position)}</dd>
          </dl>
        </div>
      </div>
    </article>
    <div class="scraps d-flex flex-wrap gap-3">
      <div class="excerpt"><p class="excerpt-title">From the archive</p><p class="mb-0">${escapeHTML(m.funFact)}</p></div>
      <div class="receipt" aria-hidden="true">
        <p class="mono mb-1">Archive record</p>
        <p class="receipt-line mb-1">No. ${fileNumber(index)}</p>
        <div class="barcode"></div>
        <span class="stamp">Seventeen</span>
      </div>
    </div>
  </div>`;

  // If a photo path is wrong, swap in the placeholder instead of a broken image icon.
  var img = elCard.querySelector(".photo-frame img");
  if (img) {
    img.addEventListener("error", function () {
      document.getElementById("photoFrame").innerHTML = photoPlaceholder(m);
    });
  }
}

function showDetail(id) {
  var index = findMember(id);
  if (index === -1) {
    return;
  }
  selectedId = id;
  updateSelection();
  renderIdCard();
  elTitle.textContent = members[index].stageName;
  elCrumb.hidden = true;
  elHome.hidden = true;
  elDetail.hidden = false;
  window.scrollTo(0, 0);
  elTitle.focus();
}

function showHome() {
  elDetail.hidden = true;
  elHome.hidden = false;
  elCrumb.hidden = false;
  var current = elStack.querySelector(".is-selected");
  if (current) {
    current.focus();
  }
}

// Folder click: other folders drop away, the clicked one rises to the top, then the detail opens.
function openFolder(button) {
  var id = button.getAttribute("data-id");
  if (reduceMotion) {
    showDetail(id);
    return;
  }
  var first = elStack.querySelector(".folder");
  button.style.setProperty("--rise", first.offsetTop - button.offsetTop + "px");
  elStack.classList.add("is-opening");
  button.classList.add("is-opening");
  setTimeout(function () {
    elStack.classList.remove("is-opening");
    button.classList.remove("is-opening");
    button.style.removeProperty("--rise");
    showDetail(id);
  }, 600);
}

function handleFolderClick(event) {
  var button = event.target.closest("button[data-id]");
  if (button) {
    openFolder(button);
  }
}

function handleCardClick(event) {
  var button = event.target.closest("button[data-go]");
  if (button) {
    showDetail(button.getAttribute("data-go"));
  }
}

function loadMembers() {
  fetch("members.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("The server answered with status " + response.status + ".");
      }
      return response.json();
    })
    .then(function (data) {
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("members.json must be a list with at least one member.");
      }
      members = data;
      renderFilters();
      renderFolders();
      elStatus.className = "visually-hidden";
      elStatus.textContent = "Archive ready · " + members.length + " member profiles";
    })
    .catch(function (error) {
      showError("Could not show the members. " + error.message + " If this is a loading problem, open the site with VS Code Live Server (not by double-clicking index.html) and check that members.json exists.");
    });
}

elStack.addEventListener("click", handleFolderClick);
elCard.addEventListener("click", handleCardClick);
elBack.addEventListener("click", showHome);
elFilter.addEventListener("click", handleFilterClick);
document.addEventListener("keydown", handleKey);

loadMembers();
