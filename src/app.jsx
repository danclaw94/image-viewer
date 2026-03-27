const APP_VERSION = 'v1.3.0 · 2026-03-27';

// ── OPT parser ──────────────────────────────────────────────────────────────
function parseOpt(text) {
  const lines = text.split('\n').map(l => l.replace(/[\r]+$/, '')).filter(l => l.trim());
  const pages = [];
  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 3) continue;
    const docId   = cols[0].trim();
    const imgPath = cols[2].trim();
    const isFirst = cols[3] && cols[3].trim().toUpperCase() === 'Y';
    if (!docId || !imgPath) continue;
    pages.push({ docId, imgPath, isFirst });
  }
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

// ── DAT parser ───────────────────────────────────────────────────────────────
const DELIM = "\x14", QUOTE = "\xFE";
function parseRow(line) {
  const sep = QUOTE + DELIM + QUOTE;
  let t = line.replace(/[\r\n]+$/, '');
  if (t.startsWith(QUOTE)) t = t.slice(1);
  if (t.endsWith(QUOTE))   t = t.slice(0, -1);
  return t.split(sep);
}
function detectEncoding(buffer) {
  const b = new Uint8Array(buffer.slice(0, 4));
  if (b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
  if (b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
  return 'utf-8';
}
function normPath(p) {
  return p.replace(/^\.[\\/]/, '').replace(/\\/g, '/').toLowerCase();
}

// ── Palette ──────────────────────────────────────────────────────────────────
const P = {
  bg: '#0E1117', surface: '#161B22', surfaceHov: '#1C2129',
  border: '#30363D', text: '#E6EDF3', dim: '#8B949E',
  accent: '#58A6FF', accentGlow: 'rgba(88,166,255,0.15)',
  green: '#3FB950', orange: '#D29922', red: '#F85149', tag: '#21262D',
  rowSel: 'rgba(88,166,255,0.18)', rowHov: '#1C2129',
};
const mono = "'JetBrains Mono','Fira Code','SF Mono',monospace";
const sans = "'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif";

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [optFile,    setOptFile]    = React.useState(null);
  const [datFile,    setDatFile]    = React.useState(null);
  const [imgDir,     setImgDir]     = React.useState(null);
  const [error,      setError]      = React.useState(null);
  const [loading,    setLoading]    = React.useState(false);
  const [launched,   setLaunched]   = React.useState(false);

  // Parsed
  const [docs,       setDocs]       = React.useState([]);
  const [allRows,    setAllRows]    = React.useState([]);  // flat array: {docId, fields:[]}
  const [headers,    setHeaders]    = React.useState([]);
  const [fileIndex,  setFileIndex]  = React.useState({});

  // View
  const [selDocId,   setSelDocId]   = React.useState(null);
  const [selPage,    setSelPage]    = React.useState(0);
  const [imgSrc,     setImgSrc]     = React.useState(null);
  const [imgLoading, setImgLoading] = React.useState(false);
  const [search,     setSearch]     = React.useState('');
  const [zoom,       setZoom]       = React.useState('fit-page');
  const [sortCol,    setSortCol]    = React.useState(null);
  const [sortDir,    setSortDir]    = React.useState(1);
  const [hovRow,     setHovRow]     = React.useState(null);

  const prevUrl    = React.useRef(null);
  const imgAreaRef = React.useRef(null);

  // ── Load OPT ──
  const loadOpt = async (file) => {
    const buf = await file.arrayBuffer();
    const text = new TextDecoder(detectEncoding(buf)).decode(buf);
    setDocs(parseOpt(text));
    setOptFile(file.name);
    setSelDocId(null); setSelPage(0); setImgSrc(null);
  };

  // ── Load DAT ──
  const loadDat = async (file) => {
    const buf = await file.arrayBuffer();
    const text = new TextDecoder(detectEncoding(buf)).decode(buf);
    const lines = text.split('\n').map(l => l.replace(/[\r]+$/, '')).filter(l => l.trim());
    if (!lines.length) return;
    const hdrs = parseRow(lines[0]);
    setHeaders(hdrs);
    const rows = lines.slice(1).map(l => ({ fields: parseRow(l) }));
    setAllRows(rows);
    setDatFile(file.name);
  };

  // ── Index image dir ──
  const indexDir = async (dirHandle) => {
    setLoading(true);
    const idx = {};
    async function walk(handle, prefix) {
      for await (const [name, entry] of handle.entries()) {
        const path = prefix ? prefix + '/' + name : name;
        if (entry.kind === 'file') {
          idx[path.toLowerCase()] = entry;
          idx[name.toLowerCase()] = entry;
        } else await walk(entry, path);
      }
    }
    await walk(dirHandle, '');
    setFileIndex(idx);
    setImgDir(dirHandle.name);
    setLoading(false);
  };

  // ── Resolve image ──
  const resolveImage = async (optPath) => {
    const norm = normPath(optPath);
    const filename = norm.split('/').pop();
    const handle = fileIndex[norm] || fileIndex[filename];
    return handle ? handle.getFile() : null;
  };

  // ── Merge docs + DAT rows → grid rows ──
  const gridRows = React.useMemo(() => {
    if (!docs.length) return [];
    // Build docId → dat row map using first column as key
    const datMap = {};
    if (allRows.length && headers.length) {
      for (const row of allRows) {
        const id = row.fields[0];
        if (id) datMap[id.trim()] = row.fields;
      }
    }
    return docs.map(doc => ({
      docId:  doc.docId,
      pages:  doc.pages,
      fields: datMap[doc.docId] || [],
    }));
  }, [docs, allRows, headers]);

  // ── Filtered + sorted rows ──
  const filteredRows = React.useMemo(() => {
    let rows = gridRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.docId.toLowerCase().includes(q) ||
        r.fields.some(f => f.toLowerCase().includes(q))
      );
    }
    if (sortCol !== null) {
      rows = [...rows].sort((a, b) => {
        const av = (sortCol === -1 ? a.docId : a.fields[sortCol]) || '';
        const bv = (sortCol === -1 ? b.docId : b.fields[sortCol]) || '';
        return av.localeCompare(bv) * sortDir;
      });
    }
    return rows;
  }, [gridRows, search, sortCol, sortDir]);

  // ── Selected row ──
  const selRow = selDocId ? filteredRows.find(r => r.docId === selDocId) : null;
  const totalPages = selRow ? selRow.pages.length : 0;

  // ── Load image ──
  React.useEffect(() => {
    if (!selRow || !Object.keys(fileIndex).length) { setImgSrc(null); return; }
    const path = selRow.pages[selPage];
    if (!path) { setImgSrc(null); return; }
    let cancelled = false;
    setImgLoading(true); setImgSrc(null); setError(null);
    resolveImage(path).then(async file => {
      if (cancelled || !file) { setImgLoading(false); if (!cancelled) setError('Not found: ' + path); return; }
      const name = file.name.toLowerCase();
      if (name.endsWith('.tif') || name.endsWith('.tiff')) {
        const buf = await file.arrayBuffer();
        const ifds = UTIF.decode(buf);
        UTIF.decodeImage(buf, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);
        const w = ifds[0].width, h = ifds[0].height;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const id = ctx.createImageData(w, h);
        id.data.set(rgba); ctx.putImageData(id, 0, 0);
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        canvas.toBlob(blob => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          prevUrl.current = url; setImgSrc(url); setImgLoading(false);
        });
      } else {
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        const url = URL.createObjectURL(file);
        prevUrl.current = url; setImgSrc(url); setImgLoading(false);
      }
    }).catch(e => { if (!cancelled) { setError(e.message); setImgLoading(false); } });
    return () => { cancelled = true; };
  }, [selDocId, selPage, fileIndex]);

  // ── Keyboard nav ──
  React.useEffect(() => {
    if (!selDocId) return;
    const handler = e => {
      const idx = filteredRows.findIndex(r => r.docId === selDocId);
      if (e.key === 'ArrowDown') {
        if (selPage < totalPages - 1) setSelPage(p => p + 1);
        else if (idx < filteredRows.length - 1) { setSelDocId(filteredRows[idx + 1].docId); setSelPage(0); }
      }
      if (e.key === 'ArrowUp') {
        if (selPage > 0) setSelPage(p => p - 1);
        else if (idx > 0) { setSelDocId(filteredRows[idx - 1].docId); setSelPage(0); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selDocId, selPage, filteredRows, totalPages]);

  // ── Sort toggle ──
  const toggleSort = (colIdx) => {
    if (sortCol === colIdx) setSortDir(d => -d);
    else { setSortCol(colIdx); setSortDir(1); }
  };

  const reset = () => {
    setDocs([]); setAllRows([]); setHeaders([]); setFileIndex({});
    setOptFile(null); setDatFile(null); setImgDir(null);
    setSelDocId(null); setImgSrc(null); setError(null); setLaunched(false);
  };

  // ── Landing ──────────────────────────────────────────────────────────────
  if (!launched) {
    const canLaunch = docs.length > 0 && Object.keys(fileIndex).length > 0;
    return (
      <div style={{ minHeight: '100vh', background: P.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, fontFamily: sans }}>
        <a href="https://vdiscovery.com" target="_blank" rel="noopener noreferrer" style={{ lineHeight: 0 }}>
          <img src="vdiscovery-white.png" alt="vDiscovery" style={{ height: 64 }} />
        </a>
        <div style={{ fontSize: 22, fontWeight: 700, color: P.text }}>Image Viewer</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <FileCard label="OPT File" hint="Required" color={P.accent} loaded={optFile}
            onSelect={async f => { try { await loadOpt(f); } catch(e) { setError(e.message); }}}
            accept=".opt,.OPT,.txt" />
          <FileCard label="DAT File" hint="Optional — metadata grid" color={P.green} loaded={datFile}
            onSelect={async f => { try { await loadDat(f); } catch(e) { setError(e.message); }}}
            accept=".dat,.DAT,.txt" />
          <DirCard label="Image Folder" hint="Required" loaded={imgDir} loading={loading}
            onSelect={async () => {
              try { const h = await window.showDirectoryPicker({ mode: 'read' }); await indexDir(h); }
              catch(e) { if (e.name !== 'AbortError') setError(e.message); }
            }} />
        </div>
        <button disabled={!canLaunch} onClick={() => setLaunched(true)} style={{
          padding: '12px 40px', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 700,
          cursor: canLaunch ? 'pointer' : 'not-allowed',
          background: canLaunch ? P.accent : P.border,
          color: canLaunch ? '#fff' : P.dim,
        }}>
          {docs.length === 0 ? 'Load an OPT file to continue' : Object.keys(fileIndex).length === 0 ? 'Select image folder to continue' : 'Open Viewer →'}
        </button>
        {error && <div style={{ color: P.red, fontFamily: mono, fontSize: 12, maxWidth: 480, textAlign: 'center' }}>{error}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: mono, fontSize: 11, color: P.green, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', padding: '6px 14px', borderRadius: 6 }}>
          🔒 100% local — files never leave your browser
        </div>
      </div>
    );
  }

  // ── Main viewer ───────────────────────────────────────────────────────────
  const GRID_W = selDocId ? '55%' : '100%';
  const IMG_W  = selDocId ? '45%' : '0';

  return (
    <div style={{ height: '100vh', background: P.bg, display: 'flex', flexDirection: 'column', fontFamily: sans, color: P.text, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid ' + P.border, flexShrink: 0, background: P.surface }}>
        <a href="https://vdiscovery.com" target="_blank" rel="noopener noreferrer" style={{ lineHeight: 0 }}>
          <img src="v-outline.png" alt="vDiscovery" style={{ height: 24 }} />
        </a>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Image Viewer</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: P.dim, background: P.tag, padding: '2px 8px', borderRadius: 4 }}>{optFile}</span>
        {datFile && <span style={{ fontFamily: mono, fontSize: 11, color: P.dim, background: P.tag, padding: '2px 8px', borderRadius: 4 }}>{datFile}</span>}
        <span style={{ fontFamily: mono, fontSize: 11, color: P.dim, background: P.tag, padding: '2px 8px', borderRadius: 4 }}>{imgDir}</span>
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ background: P.bg, border: '1px solid ' + P.border, color: P.text, borderRadius: 6, padding: '4px 10px', fontFamily: mono, fontSize: 12, outline: 'none', width: 180 }} />
        <span style={{ fontFamily: mono, fontSize: 11, color: P.dim }}>{filteredRows.length.toLocaleString()} / {gridRows.length.toLocaleString()}</span>
        <button onClick={reset} style={{ background: 'transparent', border: '1px solid ' + P.border, color: P.dim, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>← Back</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Grid ── */}
        <div style={{ width: GRID_W, transition: 'width 0.15s', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selDocId ? ('1px solid ' + P.border) : 'none' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: mono, fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: P.surface }}>
                  {/* Page col */}
                  <th style={{ padding: '7px 10px', borderBottom: '2px solid ' + P.border, borderRight: '1px solid ' + P.border, color: P.dim, fontWeight: 600, fontSize: 11, minWidth: 40, cursor: 'default' }}>#</th>
                  {/* DocID col */}
                  <th onClick={() => toggleSort(-1)} style={{ padding: '7px 12px', borderBottom: '2px solid ' + P.border, borderRight: '1px solid ' + P.border, color: sortCol === -1 ? P.accent : P.dim, fontWeight: 600, fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
                    DOCID {sortCol === -1 ? (sortDir === 1 ? '↑' : '↓') : ''}
                  </th>
                  {headers.slice(1).map((h, i) => (
                    <th key={i} onClick={() => toggleSort(i + 1)}
                      style={{ padding: '7px 12px', borderBottom: '2px solid ' + P.border, borderRight: '1px solid ' + P.border, color: sortCol === (i + 1) ? P.accent : P.dim, fontWeight: 600, fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
                      {h} {sortCol === (i + 1) ? (sortDir === 1 ? '↑' : '↓') : ''}
                    </th>
                  ))}
                  {/* Fallback if no DAT */}
                  {headers.length === 0 && (
                    <th style={{ padding: '7px 12px', borderBottom: '2px solid ' + P.border, color: P.dim, fontWeight: 600, fontSize: 11 }}>Pages</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, ri) => {
                  const isSel = row.docId === selDocId;
                  return (
                    <tr key={row.docId}
                      onClick={() => { setSelDocId(row.docId); setSelPage(0); setZoom('fit-page'); }}
                      onMouseEnter={() => setHovRow(ri)}
                      onMouseLeave={() => setHovRow(null)}
                      style={{ background: isSel ? P.rowSel : hovRow === ri ? P.rowHov : 'transparent', cursor: 'pointer', borderBottom: '1px solid ' + P.border }}
                    >
                      <td style={{ padding: '5px 10px', borderRight: '1px solid ' + P.border, color: P.dim, textAlign: 'right' }}>{ri + 1}</td>
                      <td style={{ padding: '5px 12px', borderRight: '1px solid ' + P.border, color: isSel ? P.accent : P.text, fontWeight: isSel ? 600 : 400 }}>{row.docId}</td>
                      {headers.slice(1).map((h, ci) => (
                        <td key={ci} style={{ padding: '5px 12px', borderRight: '1px solid ' + P.border, color: P.dim, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.fields[ci + 1] || ''}
                        </td>
                      ))}
                      {headers.length === 0 && (
                        <td style={{ padding: '5px 12px', color: P.dim }}>{row.pages.length} page{row.pages.length !== 1 ? 's' : ''}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Image panel ── */}
        {selDocId && (
          <div style={{ width: IMG_W, transition: 'width 0.15s', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Image toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderBottom: '1px solid ' + P.border, flexShrink: 0, background: P.surface }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: P.accent, fontWeight: 600 }}>{selDocId}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setSelPage(p => Math.max(0, p - 1))} disabled={selPage === 0}
                style={{ background: 'transparent', border: '1px solid ' + P.border, color: selPage > 0 ? P.text : P.dim, borderRadius: 4, padding: '2px 8px', cursor: selPage > 0 ? 'pointer' : 'default', fontSize: 13 }}>‹</button>
              <span style={{ fontFamily: mono, fontSize: 11, color: P.dim, whiteSpace: 'nowrap' }}>p.{selPage + 1}/{totalPages}</span>
              <button onClick={() => setSelPage(p => Math.min(totalPages - 1, p + 1))} disabled={selPage >= totalPages - 1}
                style={{ background: 'transparent', border: '1px solid ' + P.border, color: selPage < totalPages - 1 ? P.text : P.dim, borderRadius: 4, padding: '2px 8px', cursor: selPage < totalPages - 1 ? 'pointer' : 'default', fontSize: 13 }}>›</button>
              <button onClick={() => setZoom(z => Math.max(0.25, (typeof z === 'number' ? z : 1) - 0.25))}
                style={{ background: 'transparent', border: '1px solid ' + P.border, color: P.text, borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 13 }}>−</button>
              <span style={{ fontFamily: mono, fontSize: 10, color: P.dim, minWidth: 48, textAlign: 'center' }}>
                {zoom === 'fit-page' ? 'fit page' : zoom === 'fit-width' ? 'fit width' : Math.round(zoom * 100) + '%'}
              </span>
              <button onClick={() => setZoom(z => Math.min(4, (typeof z === 'number' ? z : 1) + 0.25))}
                style={{ background: 'transparent', border: '1px solid ' + P.border, color: P.text, borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 13 }}>+</button>
              <button onClick={() => setZoom('fit-page')} style={{ background: zoom === 'fit-page' ? P.accentGlow : 'transparent', border: '1px solid ' + (zoom === 'fit-page' ? P.accent : P.border), color: zoom === 'fit-page' ? P.accent : P.dim, borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>fit page</button>
              <button onClick={() => setZoom('fit-width')} style={{ background: zoom === 'fit-width' ? P.accentGlow : 'transparent', border: '1px solid ' + (zoom === 'fit-width' ? P.accent : P.border), color: zoom === 'fit-width' ? P.accent : P.dim, borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>fit width</button>
            </div>

            {/* Image area */}
            <div ref={imgAreaRef} style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: zoom === 'fit-page' ? 'center' : 'flex-start', justifyContent: 'center', padding: zoom === 'fit-page' ? 8 : 16, background: '#080C10' }}>
              {imgLoading && <div style={{ color: P.dim, fontFamily: mono, fontSize: 12 }}>Loading…</div>}
              {!imgLoading && error && <div style={{ color: P.red, fontFamily: mono, fontSize: 11, textAlign: 'center', maxWidth: 300 }}>{error}</div>}
              {!imgLoading && !error && imgSrc && (
                <img src={imgSrc} alt={selDocId} style={{
                  display: 'block',
                  boxShadow: '0 4px 30px rgba(0,0,0,0.6)',
                  maxWidth: (zoom === 'fit-page' || zoom === 'fit-width') ? '100%' : 'none',
                  maxHeight: zoom === 'fit-page' ? '100%' : 'none',
                  width: typeof zoom === 'number' ? (zoom * 100) + '%' : undefined,
                  height: 'auto',
                }} />
              )}
              {!imgLoading && !error && !imgSrc && Object.keys(fileIndex).length === 0 && (
                <div style={{ color: P.orange, fontFamily: mono, fontSize: 11, textAlign: 'center' }}>No image folder loaded.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── File card ─────────────────────────────────────────────────────────────────
function FileCard({ label, hint, color, loaded, onSelect, accept }) {
  const ref = React.useRef();
  return (
    <div onClick={() => ref.current && ref.current.click()} style={{ width: 190, padding: '20px 16px', borderRadius: 10, border: '2px dashed ' + (loaded ? color : '#30363D'), background: loaded ? 'rgba(88,166,255,0.06)' : '#161B22', textAlign: 'center', cursor: 'pointer' }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{loaded ? '✅' : '📄'}</div>
      <div style={{ fontWeight: 600, color: loaded ? color : '#E6EDF3', marginBottom: 3, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#8B949E' }}>{loaded || hint}</div>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} onChange={e => e.target.files[0] && onSelect(e.target.files[0])} />
    </div>
  );
}

function DirCard({ label, hint, loaded, loading, onSelect }) {
  return (
    <div onClick={onSelect} style={{ width: 190, padding: '20px 16px', borderRadius: 10, border: '2px dashed ' + (loaded ? '#3FB950' : '#30363D'), background: loaded ? 'rgba(63,185,80,0.06)' : '#161B22', textAlign: 'center', cursor: 'pointer' }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{loading ? '⏳' : loaded ? '✅' : '📁'}</div>
      <div style={{ fontWeight: 600, color: loaded ? '#3FB950' : '#E6EDF3', marginBottom: 3, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#8B949E' }}>{loading ? 'Indexing…' : (loaded || hint)}</div>
    </div>
  );
}

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
