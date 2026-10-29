const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const fileTitle = document.querySelector("#file-title");
const fileSubtitle = document.querySelector("#file-subtitle");
const fileLimit = document.querySelector(".file-limit");
const latSelect = document.querySelector("#lat-column");
const lngSelect = document.querySelector("#lng-column");
const convertButton = document.querySelector("#convert-button");
const summary = document.querySelector("#conversion-summary");
const feedback = document.querySelector("#feedback");
const sampleButton = document.querySelector("#sample-button");
const sampleStatus = document.querySelector("#sample-status");

const sampleCsv = `name,latitude,longitude,category
Central Park,40.7829,-73.9654,Park
Times Square,40.7580,-73.9855,Landmark
Brooklyn Bridge,40.7061,-73.9969,Landmark
High Line,40.7480,-74.0048,Park`;

let currentRows = [];
let currentHeaders = [];
let currentFilename = "locations.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (quoted) throw new Error("This CSV has an unclosed quoted field.");
  if (rows.length < 2) throw new Error("Add a header row and at least one location.");

  const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
  const data = rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
  return { headers, data };
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
}

function showRows(rows) {
  const body = document.querySelector("#sample-rows");
  body.replaceChildren();
  rows.slice(0, 3).forEach((record) => {
    const tr = document.createElement("tr");
    Object.values(record).slice(0, 4).forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    body.append(tr);
  });
}

function fillSelect(select, headers, selectedIndex) {
  select.replaceChildren();
  headers.forEach((header, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = header;
    select.append(option);
  });
  select.value = selectedIndex >= 0 ? String(selectedIndex) : "0";
  select.disabled = false;
}

function loadCsv(text, filename) {
  const parsed = parseCsv(text);
  currentHeaders = parsed.headers;
  currentRows = parsed.data;
  currentFilename = filename;

  const latIndex = findColumn(currentHeaders, ["lat", "latitude", "y"]);
  const lngIndex = findColumn(currentHeaders, ["lon", "lng", "long", "longitude", "x"]);
  fillSelect(latSelect, currentHeaders, latIndex);
  fillSelect(lngSelect, currentHeaders, lngIndex);
  fileTitle.textContent = filename;
  fileSubtitle.textContent = `${currentRows.length.toLocaleString()} rows · ${currentHeaders.length} columns`;
  fileLimit.textContent = "Ready to preview";
  sampleStatus.textContent = "Your file";
  showRows(currentRows);
  convertButton.disabled = false;
  feedback.classList.remove("error");
  setFeedback("");
  updateSummary();
}

function updateSummary() {
  if (!currentRows.length) return;
  const latHeader = currentHeaders[Number(latSelect.value)];
  const lngHeader = currentHeaders[Number(lngSelect.value)];
  const valid = currentRows.filter((row) => {
    const lat = Number(row[latHeader]);
    const lng = Number(row[lngHeader]);
    return row[latHeader] !== "" && row[lngHeader] !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }).length;
  summary.innerHTML = `<span class="summary-mark">◎</span><span><strong>${valid.toLocaleString()}</strong> valid locations · <strong>${currentRows.length.toLocaleString()}</strong> rows detected</span>`;
}

function convertToGeoJson() {
  const latHeader = currentHeaders[Number(latSelect.value)];
  const lngHeader = currentHeaders[Number(lngSelect.value)];
  if (latHeader === lngHeader) {
    setFeedback("Choose a different column for latitude and longitude.", true);
    return;
  }

  const features = [];
  let skipped = 0;
  currentRows.forEach((row, index) => {
    const latValue = row[latHeader];
    const lngValue = row[lngHeader];
    const latitude = Number(latValue);
    const longitude = Number(lngValue);
    if (latValue === "" || lngValue === "" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      skipped += 1;
      return;
    }
    const properties = { ...row };
    delete properties[latHeader];
    delete properties[lngHeader];
    features.push({
      type: "Feature",
      id: index + 1,
      properties,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
    });
  });

  if (!features.length) {
    setFeedback("No valid coordinate rows found. Check the selected columns and make sure coordinates use decimal degrees.", true);
    return;
  }

  const geojson = { type: "FeatureCollection", features };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = currentFilename.replace(/\.csv$/i, "") + ".geojson";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  const skippedText = skipped ? ` ${skipped} invalid ${skipped === 1 ? "row was" : "rows were"} skipped.` : "";
  setFeedback(`Done — ${features.length.toLocaleString()} ${features.length === 1 ? "location is" : "locations are"} in your GeoJSON file.${skippedText}`);
}

function readFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
    setFeedback("Choose a .csv file to get started.", true);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setFeedback("This file is larger than 10 MB. Try a smaller CSV export.", true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try { loadCsv(String(reader.result), file.name); }
    catch (error) { setFeedback(error.message || "This file could not be read as CSV.", true); }
  };
  reader.onerror = () => setFeedback("We couldn't read this file. Try choosing it again.", true);
  reader.readAsText(file);
}

fileInput.addEventListener("change", (event) => readFile(event.target.files[0]));
latSelect.addEventListener("change", updateSummary);
lngSelect.addEventListener("change", updateSummary);
convertButton.addEventListener("click", convertToGeoJson);
sampleButton.addEventListener("click", () => {
  try {
    loadCsv(sampleCsv, "sample-locations.csv");
    document.querySelector("#converter").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setFeedback(error.message || "Unable to load the sample data.", true);
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
  });
}
dropzone.addEventListener("drop", (event) => readFile(event.dataTransfer.files[0]));
