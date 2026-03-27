const APP_VERSION = 'v1.2.0 · 2026-03-27';

// ── OPT parser ──────────────────────────────────────────────────────────────
// Format: DOCID,VOLUME,.\PATH\TO\FILE.TIF,Y,,PAGECOUNT
function parseOpt(text) {
  const lines = text.split('\n').map(l => l.replace(/[\r]+$/, '')).filter(l => l.trim());
  const pages = [];
  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 3) continue;
    const docId    = cols[0]?.trim();
    const imgPath  = cols[2]?.trim();
    const isFirst  = cols[3]?.trim().toUpperCase() === 'Y';
    if (!docId || !imgPath) continue;
    pages.push({ docId, imgPath, isFirst });
  }
  // Group into documents
  const docs = [];
  let current = null;
  for (const p of pages) {
    if (p.isFirst || !current) {
      current = { docId: p.docId, pages: [p.imgPath] };
      docs.push(current);
    } else {
      current.pages.push(p.imgPath);
    }
  }
  return docs;
}

// ── DAT parser (same as dat-tool) ────────────────────────────────────────────
const DELIMITER = "\x14";
const QUOTE     = "\xFE";

function parseRow(line) {
  const sep = QUOTE + DELIMITER + QUOTE;
  let t = line.replace(/[\r\n]+$/, '');
  if (t.startsWith(QUOTE)) t = t.slice(1);
  if (t.endsWith(QUOTE))   t = t.slice(0, -1);
  return t.split(sep);
}

function detectEncoding(buffer) {
  const b = new Uint8Array(buffer.slice(0, 4));
  if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
  if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return 'utf-8';
  return 'utf-8';
}

// ── Normalise OPT image path for filesystem lookup ────────────────────────────
// Strips leading .\ or ./ and normalises slashes
function normPath(p) {
  return p.replace(/^\.[\\/]/, '').replace(/\\/g, '/').toLowerCase();
}

// ── Palette ──────────────────────────────────────────────────────────────────
const P = {
  bg:          '#0E1117',
  surface:     '#161B22',
  surfaceHov:  '#1C2129',
  border:      '#30363D',
  text:        '#E6EDF3',
  dim:         '#8B949E',
  accent:      '#58A6FF',
  accentGlow:  'rgba(88,166,255,0.15)',
  green:       '#3FB950',
  orange:      '#D29922',
  red:         '#F85149',
  tag:         '#21262D',
};
const mono = "'JetBrains Mono','Fira Code','SF Mono',monospace";
const sans = "'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif";

// ── Main App ─────────────────────────────────────────────────────────────────
function App() {
  // Files
  const [optFile,   setOptFile]   = React.useState(null);
  const [datFile,   setDatFile]   = React.useState(null);
  const [imgDir,    setImgDir]    = React.useState(null);  // FileSystemDirectoryHandle
  const [error,     setError]     = React.useState(null);
  const [loading,   setLoading]   = React.useState(false);
  const [launched,  setLaunched]  = React.useState(false); // true = leave landing screen

  // Parsed data
  const [docs,      setDocs]      = React.useState([]);     // [{docId, pages:[path]}]
  const [meta,      setMeta]      = React.useState({});     // {docId: {col:val}}
  const [metaCols,  setMetaCols]  = React.useState([]);     // column names for display
  const [fileIndex, setFileIndex] = React.useState({});     // {normPath: FileHandle}

  // View state
  const [selDoc,    setSelDoc]    = React.useState(null);   // index into docs
  const [selPage,   setSelPage]   = React.useState(0);
  const [imgSrc,    setImgSrc]    = React.useState(null);
  const [imgLoading,setImgLoading]= React.useState(false);
  const [search,    setSearch]    = React.useState('');
  // zoom: number = explicit scale factor, or 'fit-page' / 'fit-width'
  const [zoom,      setZoom]      = React.useState('fit-page');
  const imgAreaRef  = React.useRef(null);
  const imgElRef    = React.useRef(null);

  const optRef  = React.useRef();
  const datRef  = React.useRef();
  const prevUrl = React.useRef(null);

  // ── Load OPT ──
  const loadOpt = async (file) => {
    const buf = await file.arrayBuffer();
    const enc = detectEncoding(buf);
    const text = new TextDecoder(enc).decode(buf);
    const parsed = parseOpt(text);
    setDocs(parsed);
    setOptFile(file.name);
    setSelDoc(null);
    setSelPage(0);
    setImgSrc(null);
  };

  // ── Load DAT ──
  const loadDat = async (file) => {
    const buf = await file.arrayBuffer();
    const enc = detectEncoding(buf);
    const text = new TextDecoder(enc).decode(buf);
    const lines = text.split('\n').map(l => l.replace(/[\r]+$/, '')).filter(l => l.trim());
    if (lines.length < 1) return;
    const headers = parseRow(lines[0]);
    // Pick useful columns to display (up to 6)
    const SHOW_COLS = ['DOCID','BEGDOC','ENDDOC','CUSTODIAN','FROM','TO','DATE','SUBJECT','DOCTYPE'];
    const colMap = {};
    headers.forEach((h, i) => { colMap[h.toUpperCase()] = i; });
    const displayCols = SHOW_COLS.filter(c => colMap[c] !== undefined).slice(0, 6);
    if (displayCols.length === 0) {
      // fallback: first 6 cols
      headers.slice(0, 6).forEach(h => displayCols.push(h.toUpperCase()));
    }
    setMetaCols(displayCols.map(c => ({ key: c, idx: colMap[c] })));
    // First col is assumed to be the docId key — find DOCID or BEGDOC or col 0
    const idIdx = colMap['DOCID'] ?? colMap['BEGDOC'] ?? 0;
    const metaMap = {};
    for (const line of lines.slice(1)) {
      const row = parseRow(line);
      const id = row[idIdx]?.trim();
      if (id) {
        const obj = {};
        headers.forEach((h, i) => { obj[h.toUpperCase()] = row[i] ?? ''; });
        metaMap[id] = obj;
      }
    }
    setMeta(metaMap);
    setDatFile(file.name);
  };

  // ── Index image directory ──
  const indexDir = async (dirHandle) => {
    setLoading(true);
    const idx = {};
    async function walk(handle, prefix) {
      for await (const [name, entry] of handle.entries()) {
        const path = prefix ? (prefix + '/' + name) : name;
        if (entry.kind === 'file') {
          idx[path.toLowerCase()] = entry;
          // Also index by filename only for loose matching
          idx[name.toLowerCase()] = entry;
        } else {
          await walk(entry, path);
        }
      }
    }
    await walk(dirHandle, '');
    setFileIndex(idx);
    setImgDir(dirHandle.name);
    setLoading(false);
  };

  // ── Resolve image file from OPT path ──
  const resolveImage = async (optPath) => {
    const norm = normPath(optPath);
    // Try full normalised path first, then filename only
    const filename = norm.split('/').pop();
    const handle = fileIndex[norm] || fileIndex[filename];
    if (!handle) return null;
    return handle.getFile();
  };

  // ── Load image for current selection ──
  React.useEffect(() => {
    if (selDoc === null || !docs[selDoc]) { setImgSrc(null); return; }
    const pages = docs[selDoc].pages;
    const path = pages[selPage];
    if (!path) { setImgSrc(null); return; }
    if (Object.keys(fileIndex).length === 0) { setImgSrc(null); return; }

    let cancelled = false;
    setImgLoading(true);
    setImgSrc(null);

    resolveImage(path).then(async file => {
      if (cancelled) return;
      if (!file) { setImgLoading(false); setError('Image not found: ' + path); return; }
      setError(null);
      const name = file.name.toLowerCase();
      if (name.endsWith('.tif') || name.endsWith('.tiff')) {
        // Decode TIFF via UTIF
        const buf = await file.arrayBuffer();
        const ifds = UTIF.decode(buf);
        UTIF.decodeImage(buf, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);
        const w = ifds[0].width, h = ifds[0].height;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const idata = ctx.createImageData(w, h);
        idata.data.set(rgba);
        ctx.putImageData(idata, 0, 0);
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        canvas.toBlob(blob => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          prevUrl.current = url;
          setImgSrc(url);
          setImgLoading(false);
        });
      } else {
        // Native browser format (JPG, PNG, PDF)
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        const url = URL.createObjectURL(file);
        prevUrl.current = url;
        setImgSrc(url);
        setImgLoading(false);
      }
    }).catch(e => { if (!cancelled) { setError(e.message); setImgLoading(false); } });

    return () => { cancelled = true; };
  }, [selDoc, selPage, fileIndex, docs]);

  // ── Keyboard nav ──
  React.useEffect(() => {
    const handler = e => {
      if (selDoc === null) return;
      const pages = docs[selDoc]?.pages || [];
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (selPage < pages.length - 1) { setSelPage(p => p + 1); }
        else if (selDoc < filteredDocs.length - 1) { setSelDoc(d => d + 1); setSelPage(0); }
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (selPage > 0) { setSelPage(p => p - 1); }
        else if (selDoc > 0) { setSelDoc(d => d - 1); setSelPage(0); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selDoc, selPage, docs]);

  const filteredDocs = React.useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter(d => {
      if (d.docId.toLowerCase().includes(q)) return true;
      const m = meta[d.docId];
      if (!m) return false;
      return Object.values(m).some(v => v.toLowerCase().includes(q));
    });
  }, [docs, meta, search]);

  // ── Landing screen ──
  if (!launched) {
    return (
      <div style={{ minHeight: '100vh', background: P.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, fontFamily: sans }}>
        <a href="https://vdiscovery.com" target="_blank" rel="noopener noreferrer" style={{ lineHeight: 0 }}>
          <img src="vdiscovery-white.png" alt="vDiscovery" style={{ height: 64 }} />
        </a>
        <div style={{ fontSize: 22, fontWeight: 700, color: P.text }}>Image Viewer</div>
        <div style={{ fontSize: 13, color: P.dim }}>Load an OPT file to begin</div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* OPT — required */}
          <FileCard
            label="OPT File" hint="Required" color={P.accent}
            loaded={optFile} onSelect={async f => { try { await loadOpt(f); } catch(e) { setError(e.message); } }}
            accept=".opt,.OPT,.txt"
          />
          {/* DAT — optional */}
          <FileCard
            label="DAT File" hint="Optional — adds metadata" color={P.green}
            loaded={datFile} onSelect={async f => { try { await loadDat(f); } catch(e) { setError(e.message); } }}
            accept=".dat,.DAT,.txt"
          />
          {/* Image folder */}
          <DirCard
            label="Image Folder" hint="Required — select root image folder"
            loaded={imgDir} loading={loading}
            onSelect={async () => {
              try {
                const h = await window.showDirectoryPicker({ mode: 'read' });
                await indexDir(h);
              } catch(e) { if (e.name !== 'AbortError') setError(e.message); }
            }}
          />
        </div>

        {/* Launch button — requires OPT + image folder */}
        <button
          disabled={docs.length === 0 || Object.keys(fileIndex).length === 0}
          onClick={() => setLaunched(true)}
          style={{
            padding: '12px 40px', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 700, cursor: docs.length > 0 && Object.keys(fileIndex).length > 0 ? 'pointer' : 'not-allowed',
            background: docs.length > 0 && Object.keys(fileIndex).length > 0 ? P.accent : P.border,
            color: docs.length > 0 && Object.keys(fileIndex).length > 0 ? '#fff' : P.dim,
            transition: 'background 0.2s',
          }}
        >
          {docs.length === 0 ? 'Load an OPT file to continue' : Object.keys(fileIndex).length === 0 ? 'Select image folder to continue' : 'Open Viewer →'}
        </button>

        {error && <div style={{ color: P.red, fontFamily: mono, fontSize: 12, maxWidth: 480, textAlign: 'center' }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: mono, fontSize: 11, color: P.green, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', padding: '6px 14px', borderRadius: 6 }}>
          <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
            <rect x="1" y="5" width="9" height="7" rx="1.5" stroke={P.green} strokeWidth="1.4"/>
            <path d="M3 5V3.5a2.5 2.5 0 015 0V5" stroke={P.green} strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          100% local — files never leave your browser
        </div>
      </div>
    );
  }

  // ── Main viewer ──
  const currentDoc  = selDoc !== null ? docs[selDoc] : null;
  const currentMeta = currentDoc ? meta[currentDoc.docId] : null;
  const totalPages  = currentDoc ? currentDoc.pages.length : 0;

  return (
    <div style={{ height: '100vh', background: P.bg, display: 'flex', flexDirection: 'column', fontFamily: sans, color: P.text, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid ' + P.border, flexShrink: 0 }}>
        <a href="https://vdiscovery.com" target="_blank" rel="noopener noreferrer" style={{ lineHeight: 0 }}>
          <img src="v-outline.png" alt="vDiscovery" style={{ height: 26 }} />
        </a>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Image Viewer</span>
        <div style={{ flex: 1 }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search docs…"
          style={{ background: P.surface, border: '1px solid ' + P.border, color: P.text, borderRadius: 6, padding: '5px 10px', fontFamily: mono, fontSize: 12, outline: 'none', width: 200 }}
        />
        <span style={{ fontFamily: mono, fontSize: 11, color: P.dim }}>{filteredDocs.length.toLocaleString()} docs</span>
        <button onClick={() => { setDocs([]); setMeta({}); setMetaCols([]); setFileIndex({}); setOptFile(null); setDatFile(null); setImgDir(null); setSelDoc(null); setImgSrc(null); setError(null); setLaunched(false); }}
          style={{ background: 'transparent', border: '1px solid ' + P.border, color: P.dim, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
          ← Back
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Document list */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid ' + P.border, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid ' + P.border, fontFamily: mono, fontSize: 11, color: P.dim }}>
            {optFile}{datFile ? ' + ' + datFile : ''}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredDocs.map((doc, i) => {
              const m = meta[doc.docId];
              const isSelected = selDoc === i;
              return (
                <div
                  key={doc.docId}
                  onClick={() => { setSelDoc(i); setSelPage(0); setZoom('fit-page'); }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid ' + P.border,
                    background: isSelected ? P.accentGlow : 'transparent',
                    borderLeft: '3px solid ' + (isSelected ? P.accent : 'transparent'),
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 12, color: isSelected ? P.accent : P.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.docId}
                  </div>
                  <div style={{ fontSize: 11, color: P.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.pages.length} page{doc.pages.length !== 1 ? 's' : ''}
                    {m && m.DATE ? ' · ' + m.DATE : ''}
                    {m && (m.FROM || m.CUSTODIAN) ? ' · ' + (m.FROM || m.CUSTODIAN) : ''}
                  </div>
                  {m && m.SUBJECT && (
                    <div style={{ fontSize: 11, color: P.dim, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.SUBJECT}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Image panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Doc toolbar */}
          {currentDoc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderBottom: '1px solid ' + P.border, flexShrink: 0, background: P.surface }}>
              <span style={{ fontFamily: mono, fontSize: 13, color: P.accent, fontWeight: 600 }}>{currentDoc.docId}</span>
              <div style={{ flex: 1 }} />
              {/* Page nav */}
              <button onClick={() => setSelPage(p => Math.max(0, p - 1))} disabled={selPage === 0}
                style={{ background: 'transparent', border: '1px solid ' + P.border, color: selPage > 0 ? P.text : P.dim, borderRadius: 5, padding: '3px 10px', cursor: selPage > 0 ? 'pointer' : 'default', fontSize: 14 }}>‹</button>
              <span style={{ fontFamily: mono, fontSize: 12, color: P.dim }}>Page {selPage + 1} / {totalPages}</span>
              <button onClick={() => setSelPage(p => Math.min(totalPages - 1, p + 1))} disabled={selPage >= totalPages - 1}
                style={{ background: 'transparent', border: '1px solid ' + P.border, color: selPage < totalPages - 1 ? P.text : P.dim, borderRadius: 5, padding: '3px 10px', cursor: selPage < totalPages - 1 ? 'pointer' : 'default', fontSize: 14 }}>›</button>
              {/* Zoom */}
              <button onClick={() => setZoom(z => Math.max(0.25, (typeof z === 'number' ? z : 1) - 0.25))} style={{ background: 'transparent', border: '1px solid ' + P.border, color: P.text, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontFamily: mono, fontSize: 11, color: P.dim, minWidth: 52, textAlign: 'center' }}>
                {zoom === 'fit-page' ? 'fit page' : zoom === 'fit-width' ? 'fit width' : Math.round(zoom * 100) + '%'}
              </span>
              <button onClick={() => setZoom(z => Math.min(4, (typeof z === 'number' ? z : 1) + 0.25))} style={{ background: 'transparent', border: '1px solid ' + P.border, color: P.text, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 14 }}>+</button>
              <button onClick={() => setZoom('fit-page')} style={{ background: zoom === 'fit-page' ? P.accentGlow : 'transparent', border: '1px solid ' + (zoom === 'fit-page' ? P.accent : P.border), color: zoom === 'fit-page' ? P.accent : P.dim, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>fit page</button>
              <button onClick={() => setZoom('fit-width')} style={{ background: zoom === 'fit-width' ? P.accentGlow : 'transparent', border: '1px solid ' + (zoom === 'fit-width' ? P.accent : P.border), color: zoom === 'fit-width' ? P.accent : P.dim, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>fit width</button>
            </div>
          )}

          {/* Metadata strip */}
          {currentMeta && metaCols.length > 0 && (
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid ' + P.border, flexShrink: 0, overflowX: 'auto', background: P.bg }}>
              {metaCols.map(col => (
                <div key={col.key} style={{ padding: '4px 12px', borderRight: '1px solid ' + P.border, minWidth: 80, flexShrink: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 9, color: P.dim, textTransform: 'uppercase', letterSpacing: 1 }}>{col.key}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                    {currentMeta[col.key] || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image area */}
          <div ref={imgAreaRef} style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: zoom === 'fit-page' ? 'center' : 'flex-start', justifyContent: 'center', padding: zoom === 'fit-page' ? 8 : 16, background: '#080C10' }}>
            {selDoc === null && (
              <div style={{ color: P.dim, fontFamily: mono, fontSize: 13, marginTop: 80 }}>← Select a document</div>
            )}
            {selDoc !== null && imgLoading && (
              <div style={{ color: P.dim, fontFamily: mono, fontSize: 13, marginTop: 80 }}>Loading…</div>
            )}
            {selDoc !== null && !imgLoading && error && (
              <div style={{ color: P.red, fontFamily: mono, fontSize: 12, marginTop: 80, maxWidth: 400, textAlign: 'center' }}>{error}</div>
            )}
            {selDoc !== null && !imgLoading && !error && imgSrc && (
              <img
                ref={imgElRef}
                src={imgSrc}
                alt={currentDoc.pages[selPage]}
                style={{
                  display: 'block',
                  boxShadow: '0 4px 30px rgba(0,0,0,0.6)',
                  maxWidth: zoom === 'fit-page' ? '100%' : zoom === 'fit-width' ? '100%' : 'none',
                  maxHeight: zoom === 'fit-page' ? '100%' : 'none',
                  width: typeof zoom === 'number' ? (zoom * 100) + '%' : undefined,
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            )}
            {selDoc !== null && !imgLoading && !error && !imgSrc && Object.keys(fileIndex).length === 0 && (
              <div style={{ color: P.orange, fontFamily: mono, fontSize: 12, marginTop: 80, textAlign: 'center' }}>
                No image folder loaded.<br/>Go back and select the image folder.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── File card (landing) ───────────────────────────────────────────────────────
function FileCard({ label, hint, color, loaded, onSelect, accept }) {
  const ref = React.useRef();
  return (
    <div
      onClick={() => ref.current && ref.current.click()}
      style={{
        width: 200, padding: '24px 20px', borderRadius: 12, border: '2px dashed ' + (loaded ? color : '#30363D'),
        background: loaded ? 'rgba(88,166,255,0.06)' : '#161B22',
        textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{loaded ? '✅' : '📄'}</div>
      <div style={{ fontWeight: 600, color: loaded ? color : '#E6EDF3', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#8B949E' }}>{loaded || hint}</div>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onSelect(e.target.files[0])} />
    </div>
  );
}

// ── Directory card (landing) ──────────────────────────────────────────────────
function DirCard({ label, hint, loaded, loading, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        width: 200, padding: '24px 20px', borderRadius: 12, border: '2px dashed ' + (loaded ? '#3FB950' : '#30363D'),
        background: loaded ? 'rgba(63,185,80,0.06)' : '#161B22',
        textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{loading ? '⏳' : loaded ? '✅' : '📁'}</div>
      <div style={{ fontWeight: 600, color: loaded ? '#3FB950' : '#E6EDF3', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#8B949E' }}>{loading ? 'Indexing…' : (loaded || hint)}</div>
    </div>
  );
}

// ── Version badge ─────────────────────────────────────────────────────────────
function VersionBadge() {
  return (
    <div style={{ position: 'fixed', bottom: 8, right: 12, zIndex: 9999, fontFamily: 'monospace', fontSize: 10, color: '#30363d', pointerEvents: 'none', userSelect: 'none' }}>
      {APP_VERSION}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  React.createElement(React.Fragment, null,
    React.createElement(App, null),
    React.createElement(VersionBadge, null)
  )
);
