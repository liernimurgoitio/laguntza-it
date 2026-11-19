import { useEffect, useRef, useState } from 'react';
import { MAX_FILE_BYTES, RULE_TITLES, validateExchange } from './zaintzaExchange';
import example from './fixtures/zaintza-demo-v1.json';

function fileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
    reader.readAsText(file);
  });
}

export default function ZaintzaImport({ onPrepare, disabled, demo = false }) {
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');
  const [ack, setAck] = useState(false);
  const [reading, setReading] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; }, []);
  async function read(event) {
    const file = event.target.files?.[0];
    const current = ++sequence.current;
    setSource(null); setError(''); setAck(false); setReading(false);
    if (!file) return;
    setReading(true);
    try {
      if (file.size > MAX_FILE_BYTES || !/\.json$/i.test(file.name)) throw new Error('Selecciona un archivo JSON de hasta 16 KiB.');
      const text = await fileText(file);
      if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('El archivo supera 16 KiB.');
      const parsed = validateExchange(JSON.parse(text));
      if (current === sequence.current) setSource(parsed);
    } catch (problem) {
      if (current === sequence.current) setError(problem instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : problem.message);
    } finally { if (current === sequence.current) setReading(false); }
  }
  function downloadExample() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(example, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'zaintza-demo-v1.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel zaintza-import" aria-labelledby="import-title">
    <div className="panel-heading"><h2 id="import-title">Importar prueba de Zaintza</h2><p>Revisa una exportación ficticia antes de crear la incidencia. Leer un archivo no guarda nada ni cambia la investigación de Zaintza.</p></div>
    {demo && <p><button type="button" className="primary-button" onClick={downloadExample}>Descargar ejemplo ficticio</button> También puedes exportar una detección desde la demo de Zaintza SOC.</p>}
    <label>Archivo JSON de Zaintza<input type="file" accept=".json,application/json" onChange={read} disabled={disabled} /></label>
    {reading && <p role="status">Leyendo y validando la prueba…</p>}
    {error && <p className="feedback-error" role="alert">{error}</p>}
    {source && <div className="import-preview">
      <p className="notice"><strong>Prueba ficticia · no es una detección real.</strong> El formato no admite cuentas, equipos, IP ni notas de investigación.</p>
      <dl className="desk-evidence"><dt>Regla</dt><dd>{source.detection.ruleId} · {RULE_TITLES[source.detection.ruleId]}</dd><dt>Referencia</dt><dd>{source.detection.id}</dd><dt>Primer evento</dt><dd>{source.detection.firstSeen}</dd><dt>Último evento</dt><dd>{source.detection.lastSeen}</dd><dt>Eventos relacionados</dt><dd>{source.detection.eventCount}</dd></dl>
      <details><summary>Ver referencias incluidas</summary><ul>{source.detection.evidenceRefs.map(ref => <li key={ref}>{ref}</li>)}</ul></details>
      <label className="import-ack"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} disabled={disabled} />He revisado los datos y confirmo que esta importación es una prueba ficticia.</label>
      <button type="button" className="primary-button" disabled={!ack || disabled} onClick={() => onPrepare(source)}>Usar esta prueba en el formulario</button>
      <p className="desk-muted">Sustituye el borrador del formulario por una propuesta editable. Después debes pulsar Crear incidencia. Si ya existe esta referencia, se abrirá su incidencia sin modificarla.</p>
    </div>}
  </section>;
}
