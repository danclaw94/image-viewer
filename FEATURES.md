# vDiscovery Image Viewer — Feature Reference

> **For documentation teams / AI:** This document describes every feature of the vDiscovery Image Viewer in detail. Use it to generate polished end-user documentation, help articles, or a user guide.

---

## Overview

The vDiscovery Image Viewer is a standalone, browser-based eDiscovery image review tool. It loads:
- An **OPT file** (Opticon image load file) — defines the document/page structure
- A **DAT file** (optional, Concordance/Relativity metadata) — provides searchable fields
- An **image folder** — the directory containing the production images (TIFF, JPEG, PNG, PDF)

Everything runs 100% in the browser. No data is uploaded to any server. Files never leave the user's machine. This is a critical privacy feature for legal clients handling confidential litigation materials.

**Browser requirement:** Chrome or Edge on desktop (requires the File System Access API). Not supported on mobile or Firefox.

**Live URL:** https://danclaw94.github.io/image-viewer/

---

## Getting Started

### Loading Files

1. Open the app in Chrome or Edge.
2. On the landing screen, click **OPT File** to load the image load file (required).
3. Click **DAT File** to load the metadata file (optional — enables the metadata grid).
4. Click **Image Folder** to select the root folder containing your production images (required). The app indexes the entire folder tree automatically.
5. Once the OPT and image folder are loaded, the **Open Viewer →** button activates. Click it to enter the viewer.

### OPT File Format

The app supports the standard Opticon format:
```
DOCID,VOLUME,.\IMAGES\001\DOC001.TIF,Y,,3
DOCID,VOLUME,.\IMAGES\001\DOC001_002.TIF,,,
```
- Column 1: Document ID (Bates number)
- Column 3: Relative image path
- Column 4: `Y` = first page of a new document; blank = continuation page

### DAT File Format

Standard Concordance/Relativity format using `þ` (0xFE) as the field delimiter and `\x14` as the column separator. UTF-8, UTF-16LE, UTF-16BE, and Windows-1252 (ANSI) encodings are all supported and round-tripped correctly on export.

---

## Session Resume

When you return to the app after closing or refreshing, a **Resume Previous Session** card appears on the landing screen showing the filenames from your last session.

- Click **Resume →** to reload the same files. The browser will prompt for permission to re-access each file (one click per file).
- If the DAT file was loaded previously, you will be prompted to re-select it.
- Click **Start fresh** to dismiss the resume card and start a new session.
- All tags, column visibility, column widths, tag filters, and the last-selected document are automatically restored.

---

## Main Layout

The viewer is split into two panels:

### Left Panel — Document Grid

A scrollable data grid showing all documents from the OPT file. If a DAT file was loaded, all metadata columns are displayed. The grid uses virtual scrolling and renders smoothly with tens of thousands of documents.

**Columns:**
- **#** — Row number
- **Tag** — Shows R (green) or NR (red) if the document has been tagged
- **DOCID** — The Bates number / document ID
- **DAT columns** — All columns from the metadata file
- **Pages** — Page count per document from the OPT

**Sorting:** Click any column header to sort ascending. Click again to sort descending. An arrow (↑/↓) indicates the active sort.

**Resizing:** Hover over the right edge of any column header until the cursor changes to a resize arrow, then drag to resize.

### Right Panel — Image Viewer

Appears when a document is selected. Shows the current page image with navigation and annotation controls.

---

## Tag Filter Bar

Located above the grid. Filter the document list by tag status:

| Filter | Shows |
|--------|-------|
| **All** | All documents (default) |
| **Responsive** | Documents tagged Responsive |
| **Not Responsive** | Documents tagged Not Responsive |
| **Untagged** | Documents with no tag applied |

Each filter shows a count in parentheses. The count updates in real time as you tag documents.

### Show/Hide Columns

The **Columns** button (column icon) is on the right side of the tag filter bar. Click it to open a dropdown with a scrollable list of all columns. Toggle any column on or off with a checkbox. Use **All** to show all columns or **None** to hide all.

Column visibility is saved in the session and restored on resume.

---

## Tagging Documents

### Tag Buttons

The tag bar above the image panel contains:
- **⚡ Auto-advance** — When enabled, automatically jumps to the next document after tagging
- **Responsive** — Tag the current document as Responsive (click again to remove)
- **Not Responsive** — Tag the current document as Not Responsive (click again to remove)
- **✕ Clear** — Remove the tag from the current document

Tags are mutually exclusive: applying one removes the other.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Toggle Responsive tag |
| `N` | Toggle Not Responsive tag |
| `U` | Clear tag |
| `→` or `↓` | Next page (or next document if on last page) |
| `←` or `↑` | Previous page (or previous document if on first page) |

Keyboard shortcuts are disabled when focus is in a text input (search, jump-to).

### Auto-Advance

When enabled (⚡ button highlighted blue), tagging a document automatically moves to the next document. The next document's pages are prefetched in the background for instant loading. Configure the prefetch depth in Settings.

---

## Document Navigation

### Page Navigation

Use the **‹** and **›** buttons in the image toolbar to move between pages of a multi-page document. The current page position is shown as `p.X/Y`.

The **‹** and **›** buttons in the tag bar navigate between documents in the filtered list, showing position as `X / Y`.

### Jump to Document

Click **Go to…** in the header to open a jump input. Type:
- A **row number** (e.g. `47`) to jump to row 47 in the current filtered view
- A **Bates number** (e.g. `ABC00247`) for an exact match
- A **partial prefix** (e.g. `ABC002`) for the first match starting with that prefix

Press `Enter` to jump. Press `Escape` to close. Typing in the jump input does not trigger keyboard navigation.

---

## Image Controls

### Zoom

| Control | Action |
|---------|--------|
| **−** | Zoom out (−25% per click) |
| **+** | Zoom in (+25% per click) |
| **fit page** | Fit the entire image within the visible viewport (default) |
| **fit width** | Stretch to full panel width; scroll vertically for tall pages |

### Rotation

Click **↻** to rotate the image 90° clockwise. Cycles through 0° → 90° → 180° → 270° → 0°. The button shows the current rotation angle when non-zero. Rotation resets automatically when navigating to a different document.

### Thumbnail Strip

A horizontal strip of page thumbnails appears below the image for multi-page documents. Click any thumbnail to jump to that page. The active thumbnail is highlighted with a blue border. The strip auto-scrolls to keep the current page in view. Thumbnails are decoded lazily as they scroll into view.

Can be disabled in Settings.

---

## Multi-Select

Hold **Ctrl** (or **Cmd** on Mac) and click rows to toggle individual documents in and out of the selection. Hold **Shift** and click to select a range from the current document to the clicked row.

The header shows "N selected" when a multi-selection is active. Multi-selected rows are displayed with a subtle blue tint.

Multi-select is used with **Print to PDF** to print a specific subset of documents.

---

## Copy Document ID

Click **⧉** next to the document ID in the image toolbar to copy the Bates number to the clipboard. Brief "✓ Copied" feedback confirms the copy. Resets when navigating to a different document.

---

## Print to PDF

Click the **🖨 ▾** button in the image toolbar to open the print menu:

| Option | Prints |
|--------|--------|
| **Current Document** | All pages of the selected document |
| **Selected Documents** | All pages of all Ctrl/Shift-selected documents |
| **All Documents** | All pages of every document in the current filtered view |

A confirmation dialog appears before printing more than 50 documents. A progress indicator shows during PDF generation.

Each page is auto-detected as portrait or landscape based on image dimensions. Pages are centered within 0.5" margins. The PDF opens in a new browser tab.

---

## Search

The search box in the header filters the document grid in real time. Searches across the document ID and all metadata fields.

The count `X / Y` shows filtered results vs. total. Search combines with the tag filter — both apply simultaneously.

---

## Export DAT

After tagging documents, click **Export DAT** in the header (greyed out until at least one document is tagged).

A modal lets you configure the export:
- **Tag Column Name** — The column header for the responsiveness field (default: "Responsiveness")
- A summary shows how many documents are tagged and their breakdown

The exported DAT:
- Appends a new column to the existing metadata (if a DAT was loaded), or creates a minimal 2-column DAT (DOCID + tag column) if no DAT was loaded
- Tag values: `"Responsive"`, `"Not Responsive"`, or blank for untagged
- Preserves the original encoding (UTF-8, UTF-16LE, UTF-16BE) with BOM

---

## Save & Load Session

### Auto-Save (Session Restore)

The app automatically saves your session state to browser storage every time something changes. On reload, the Resume card appears and restores:
- All tags (Responsive / Not Responsive)
- Tag filter selection
- Last-selected document
- Search text
- Column visibility
- Column widths

### Manual Save (💾)

Click the **💾** button in the header to export a `.json` session file. The file contains all tags and can be loaded on any machine reviewing the same production.

### Load Session

On the landing screen, click **Load Review Session** to import a previously saved `.json` file. Tags are applied immediately; load the same OPT/DAT/folder to view them in context.

---

## QC Dashboard

The QC scanner automatically runs when the viewer opens (configurable in Settings). Results appear as a banner below the header.

### QC Checks

| Check | What it detects |
|-------|-----------------|
| **Missing Image Files** | Pages listed in the OPT with no corresponding file in the image folder |
| **OPT / DAT Mismatches** | Documents in OPT but not in DAT, or in DAT but not in OPT |
| **Bates Sequence Gaps** | Gaps in the numeric sequence of Bates numbers |
| **Duplicate Document IDs** | The same Bates number appearing more than once in the OPT |
| **Zero-Page Documents** | Documents with no image pages |

### QC Banner

- **Green banner (✓):** No issues found
- **Orange banner (⚠):** Issues detected — shows counts per category
- Click **View** to expand the detailed issue list. Each issue is clickable and jumps to the relevant document.
- Click **Re-scan** to run the scan again.
- Click **✕** to dismiss the banner. A small badge in the header shows the issue count and can be clicked to restore the banner.

### Export QC Report

Click **Export ▾** in the QC banner to choose the export format:

**📄 Export PDF** — A professionally formatted report that includes:
- Header with vDiscovery branding and generation timestamp
- File info row (OPT, DAT, image folder names)
- Summary stat cards: Documents, Total Images, Avg Pages/Doc, Max Pages/Doc, Missing Images, Total QC Issues
- Image format breakdown bar chart (TIFF/JPEG/PNG/etc. with counts and percentages)
- Page distribution bar chart (1-page, 2–5, 6–10, 11–50, 50+ documents)
- DAT column coverage — each column with a color-coded fill percentage dot
- Detailed issue sections with colored headers for each issue type
- Page footers with page numbers

**📊 Export CSV** — A flat CSV table with columns: Issue Type, Doc ID, Detail. Includes all issue types. Useful for importing into Excel or a review platform.

---

## Settings

Click **⚙** in the header to open Settings. All settings persist across sessions via browser localStorage.

| Setting | Default | Description |
|---------|---------|-------------|
| **Auto-advance on tag** | Off | Automatically jump to next document after tagging |
| **Thumbnail strip** | On | Show page thumbnails below the image for multi-page documents |
| **QC scan on launch** | On | Run QC checks automatically when the viewer opens |
| **Prefetch depth** | 3 | Number of pages to pre-decode from the next document (1–10) |
| **Default zoom** | fit-page | Zoom mode applied when opening a document (fit-page or fit-width) |

---

## Performance

The app is optimised for large productions:

- **Virtual scrolling:** Only visible rows are rendered — 50,000+ document grids scroll as smoothly as 50-row grids
- **LRU image cache:** The last 30 full-size decoded images are cached. Revisiting any recent document is instant.
- **Background prefetch:** When you view a document, the app immediately begins decoding the next document's pages in the background so navigation feels instantaneous
- **Lazy thumbnail decoding:** Thumbnails are decoded only as they scroll into view using `IntersectionObserver`, with a max 3 concurrent decode threads
- **Separate thumbnail cache:** 120 thumbnail blob URLs stored separately from full-size images
- **TIFF decoding:** TIFFs are decoded in-browser via [UTIF.js](https://github.com/photopea/UTIF.js) — no server required

---

## Technical Notes (for integration or maintenance)

### File Formats Supported

| Format | Full View | Thumbnails |
|--------|-----------|------------|
| TIFF / TIF | ✅ via UTIF.js | ✅ decoded at thumbnail resolution |
| JPEG / JPG | ✅ native | ✅ via `createImageBitmap` |
| PNG | ✅ native | ✅ via `createImageBitmap` |
| PDF | ✅ native browser PDF | ❌ not thumbnailed |

### OPT Path Resolution

The app normalises OPT paths by stripping leading `.\` or `./` and converting backslashes to forward slashes. It then tries to match against the indexed file tree using:
1. Full normalised path (e.g. `images/vol001/doc001.tif`)
2. Filename only (e.g. `doc001.tif`) as a fallback

### DAT Encoding Preservation

The DAT encoding (UTF-8, UTF-16LE, UTF-16BE, Windows-1252) is detected on load and preserved when exporting a tagged DAT. The output file will have the same BOM and encoding as the input.

### Stack

- React 18 (via CDN, UMD build)
- UTIF.js 3.1.0 (TIFF decoding, via CDN)
- jsPDF 2.5.1 (PDF export, via CDN)
- JSX pre-compiled at build time via `@babel/core` (no Babel CDN at runtime)
- All styles are inline `style={{}}` objects — no CSS files

### Build

```bash
cd /path/to/image-viewer
# Edit src/app.jsx — update APP_VERSION
node -e "
const fs=require('fs'), babel=require('./node_modules/@babel/core');
const code=fs.readFileSync('src/app.jsx','utf8');
const r=babel.transformSync(code,{
  presets:[
    ['./node_modules/@babel/preset-env',{targets:'>0.5%, not dead',modules:false}],
    './node_modules/@babel/preset-react'
  ],
  filename:'app.jsx'
});
let h=fs.readFileSync('index.html','utf8');
h=h.replace(/<script>[\s\S]*?<\/script>(\s*<\/body>)/,'<script>'+r.code+'<\/script>\$1');
fs.writeFileSync('index.html',h);
console.log('Built OK');
"

# Deploy (source branch → main branch for GitHub Pages)
git add -A && git commit -m "vX.X.X: description" && git push          # source branch
git checkout main && git merge source --no-edit && git push origin main # GitHub Pages
git checkout source
```

### Version

See `APP_VERSION` at the top of `src/app.jsx`. Format: `'vX.Y.Z · YYYY-MM-DD'`. Must be bumped on every push.
