import { useEffect, useRef, useState } from 'react';
import { requestId } from './incidentApi';
import './IncidentDesk.css';
import ZaintzaImport from './ZaintzaImport';
import { exchangeDraft } from './zaintzaExchange';

const STATUS = { new: 'Nueva', in_progress: 'En curso', waiting: 'Pendiente del usuario', resolved: 'Resuelta' };
const PRIORITY = { low: 'Baja', medium: 'Media', high: 'Alta' };
const CATEGORIES = ['Acceso y cuentas', 'Aplicaciones', 'Equipos', 'Red y conexión', 'Otros'];
const ACTIVITY = { created: 'Creación', status: 'Estado', priority: 'Prioridad', note: 'Nota', resolution: 'Resolución', reopened: 'Reapertura', source: 'Origen de la prueba' };
const dates = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
const emptyForm = { title: '', description: '', category: 'Red y conexión', priority: 'medium', deviceId: '' };
const emptyUpdate = { status: 'new', priority: 'medium', resolution: '', note: '' };
const when = value => value ? dates.format(new Date(value)) : 'Sin observación registrada';

export default function IncidentDesk({ client, initialDevice = '' }) {
  const [context, setContext] = useState(null);
  const [list, setList] = useState({ tickets: [], total: 0, page: 1, pageSize: 25, summary: { total: 0, open: 0, high: 0 } });
  const [filters, setFilters] = useState({ q: '', status: 'all', priority: 'all', page: 1 });
  const [selectedId, setSelectedId] = useState('');
  const [ticket, setTicket] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [importSource, setImportSource] = useState(null);
  const [update, setUpdate] = useState(emptyUpdate);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [noticeArea, setNoticeArea] = useState('global');
  const [createdId, setCreatedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const intent = useRef(null);
  const initialApplied = useRef(false);
  const detailId = useRef('');
  if (intent.current === null) intent.current = requestId();

  useEffect(() => {
    let active = true;
    client.context().then(data => {
      if (!active) return;
      setContext(data);
      if (!initialApplied.current) {
        const device = data.devices.find(item => item.id === initialDevice);
        if (device) setForm(previous => ({ ...previous, deviceId: device.id, title: ('Revisar ' + device.name).slice(0, 120) }));
        initialApplied.current = true;
      }
    }).catch(problem => { if (active) { setError(problem.message); setLoading(false); } });
    return () => { active = false; };
  }, [client, initialDevice, revision]);

  useEffect(() => {
    if (!context) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      client.list(filters).then(data => {
        if (!active) return;
        setList(data);
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (filters.page > lastPage) setFilters(previous => ({ ...previous, page: 1 }));
        setSelectedId(previous => data.tickets.some(item => item.id === previous) ? previous : data.tickets[0]?.id || '');
      }).catch(problem => { if (active) setError(problem.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [client, context, filters]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    client.detail(selectedId).then(data => {
      if (!active) return;
      setTicket(data);
      const same = detailId.current === data.id;
      setUpdate(previous => ({ status: data.status, priority: data.priority, resolution: data.resolution, note: same ? previous.note : '' }));
      detailId.current = data.id;
    }).catch(problem => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, [client, selectedId, revision]);

  const refresh = () => { setNoticeArea('global'); setError(''); setRevision(value => value + 1); };
  const changeForm = event => { const { name, value } = event.target; setForm(previous => ({ ...previous, [name]: value })); };
  const changeFilter = event => { const { name, value } = event.target; setFilters(previous => ({ ...previous, [name]: value, page: 1 })); };
  const changeUpdate = event => { const { name, value } = event.target; setUpdate(previous => ({ ...previous, [name]: value })); };

  async function create(event) {
    event.preventDefault(); setNoticeArea('create'); setCreatedId(''); setSaving(true); setError(''); setMessage('');
    try {
      const data = { ...form, requestId: intent.current };
      const result = importSource ? await client.importZaintza({ ...data, source: importSource, confirmDemo: true }) : await client.create(data);
      intent.current = requestId();
      setForm(previous => ({ ...emptyForm, deviceId: previous.deviceId }));
      setFilters({ q: result.importReused ? result.id : '', status: 'all', priority: 'all', page: 1 });
      setImportSource(null);
      setSelectedId(result.id); setTicket(result); setCreatedId(result.id);
      setMessage(result.importReused ? 'La prueba ya está registrada en ' + result.id + '. Se ha abierto su incidencia sin modificarla.' : 'Incidencia ' + result.id + ' creada y guardada' + (client.demo ? ' solo en esta demo.' : ' en el servidor.'));
      setRevision(value => value + 1);
    } catch (problem) { setError(problem.message); }
    finally { setSaving(false); }
  }
  async function save(event) {
    event.preventDefault(); setNoticeArea('followup'); setSaving(true); setError(''); setMessage('');
    try {
      const result = await client.update(ticket.id, { ...update, version: ticket.version });
      setTicket(result); setUpdate({ status: result.status, priority: result.priority, resolution: result.resolution, note: '' });
      setMessage('Seguimiento de ' + result.id + ' guardado.');
      setRevision(value => value + 1);
    } catch (problem) { setError(problem.message); }
    finally { setSaving(false); }
  }

  const current = ticket?.id === selectedId ? ticket : null;
  const visibleNoticeArea = noticeArea === 'followup' && !current ? 'global' : noticeArea;
  const feedback = area => visibleNoticeArea === area && <>
    {error && <p className="feedback-error" role="alert">{error}</p>}
    {message && <p className="feedback" role="status">{message}{area === 'create' && createdId === selectedId && createdId && <> <a href="#ticket-detail">Ver detalle de {createdId}</a></>}</p>}
  </>;
  return <div className="app incident-desk">
    <header className="app-header"><div><p className="eyebrow">Red bajo vigilancia · Soporte IT</p><h1>Laguntza IT</h1><p className="subtitle">Del aparato observado a una incidencia con seguimiento y resolución.</p></div><span className="environment">{client.demo ? 'Demo · datos ficticios' : 'Integración privada · SQLite'}</span></header>
    <main>
      <p className="notice">{client.demo ? 'Todos los datos son ficticios. Los cambios solo se mantienen en esta página y se pierden al recargar. La demo no consulta ningún servidor.' : 'Las incidencias se guardan en el servidor de la Raspberry y conservan su seguimiento al recargar. Acceso protegido por la contraseña del panel.'}</p>
      <div className="desk-toolbar"><a href={client.demo ? '../' : '/'}>← Volver al inventario</a><button type="button" onClick={refresh} disabled={saving}>Actualizar bandeja y detalle</button></div>
      {feedback('global')}
      <section className="metrics" aria-label="Resumen de incidencias"><article className="metric"><span>Total guardadas</span><strong>{list.summary.total}</strong></article><article className="metric"><span>Abiertas</span><strong>{list.summary.open}</strong></article><article className="metric"><span>Prioridad alta · abiertas</span><strong>{list.summary.high}</strong></article></section>
      <ZaintzaImport demo={client.demo} disabled={saving || !context} onPrepare={source => { setNoticeArea('create'); setCreatedId(''); setImportSource(source); setForm(exchangeDraft(source)); intent.current = requestId(); setError(''); setMessage('Prueba revisada. Comprueba el título y la descripción y pulsa Crear incidencia.'); }} />
      <div className="workspace">
        <section className="panel" aria-labelledby="create-title"><div className="panel-heading"><h2 id="create-title">Nueva incidencia</h2><p>La creación es manual. Una desconexión por sí sola no abre una incidencia.</p></div>
          {importSource && <div className="notice"><strong>Origen: Zaintza SOC · prueba ficticia</strong><p>{importSource.detection.id}. Sin aparato asociado; no se vincula automáticamente con el inventario.</p><button type="button" disabled={saving} onClick={() => { setImportSource(null); setForm(emptyForm); intent.current = requestId(); }}>Volver al alta manual</button></div>}
          <form className="ticket-form" aria-label="Crear incidencia" onSubmit={create}>
            <label>Aparato asociado<select name="deviceId" value={form.deviceId} onChange={changeForm} disabled={!context || saving || !!importSource}><option value="">Sin aparato asociado</option>{context?.devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
            <label>Título<input name="title" value={form.title} onChange={changeForm} minLength={5} maxLength={120} required disabled={saving} /></label>
            <label>Descripción<textarea name="description" value={form.description} onChange={changeForm} minLength={10} maxLength={4000} rows={5} required disabled={saving} placeholder="Qué ocurre, desde cuándo y qué has comprobado" /></label>
            <div className="form-row"><label>Categoría<select name="category" value={form.category} onChange={changeForm} disabled={saving || !!importSource}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label><label>Prioridad<select name="priority" value={form.priority} onChange={changeForm} disabled={saving}>{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <button className="primary-button" disabled={!context || saving}>Crear incidencia</button>
            {feedback('create')}
          </form>
        </section>
        <section className="panel" aria-labelledby="list-title"><div className="panel-heading"><h2 id="list-title">Bandeja de incidencias</h2><p>Los contadores superiores incluyen todas las incidencias guardadas.</p></div>
          <div className="filters"><label>Buscar<input name="q" type="search" value={filters.q} onChange={changeFilter} maxLength={120} placeholder="Título, identificador, categoría o aparato" /></label><label>Filtrar por estado<select name="status" value={filters.status} onChange={changeFilter}><option value="all">Todos</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Filtrar por prioridad<select name="priority" value={filters.priority} onChange={changeFilter}><option value="all">Todas</option>{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <p className="desk-muted" role="status">{loading ? 'Actualizando bandeja…' : `${list.tickets.length} visibles de ${list.total} que coinciden con los filtros.`}</p>
          <ul className="ticket-list">{list.tickets.map(item => <li key={item.id}><button type="button" className={`ticket-item ${selectedId === item.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} aria-controls="ticket-detail"><span className="ticket-top"><span className="ticket-id">{item.id}</span><span className={`badge priority-${item.priority}`}>{PRIORITY[item.priority]}</span></span><strong>{item.title}</strong><span className="ticket-bottom"><span>{item.deviceName || 'Sin aparato asociado'}</span><span>{STATUS[item.status]}</span></span></button></li>)}</ul>
          {!loading && !list.tickets.length && <p className="empty">No hay incidencias que coincidan. Puedes crear una con el formulario.</p>}
          <div className="desk-pagination"><button type="button" disabled={filters.page <= 1 || loading} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Anterior</button><span>Página {filters.page} de {Math.max(1, Math.ceil(list.total / list.pageSize))}</span><button type="button" disabled={filters.page * list.pageSize >= list.total || loading} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Siguiente</button></div>
        </section>
      </div>
      <section id="ticket-detail" className="panel detail" aria-labelledby="detail-title"><div className="panel-heading"><h2 id="detail-title">Detalle de la incidencia</h2></div>
        {current ? <><div className="detail-content"><div><p className="ticket-id">{current.id} · versión {current.version}</p><h3>{current.title}</h3><p className="description">{current.description}</p><dl className="desk-evidence"><dt>Aparato</dt><dd>{current.deviceName || 'Sin aparato asociado'}</dd><dt>Categoría</dt><dd>{current.category}</dd><dt>Estado observado al crearla</dt><dd>{({ conectado: 'Conectado', desconectado: 'Desconectado', pendiente_asociar: 'Pendiente de asociar', sin_comprobar: 'Sin información', sin_informacion: 'Sin información', cambio_por_confirmar: 'Cambio por confirmar' })[current.context.state] || 'Sin observación'}</dd><dt>Observación del panel</dt><dd>{when(current.context.observedAt)}</dd><dt>Creación</dt><dd>{when(current.createdAt)}</dd><dt>Última actualización</dt><dd>{when(current.updatedAt)}</dd></dl></div>
          <form className="ticket-form" aria-label="Guardar seguimiento" onSubmit={save}><h3>Seguimiento</h3><div className="form-row"><label>Nuevo estado<select name="status" value={update.status} onChange={changeUpdate} disabled={saving}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Nueva prioridad<select name="priority" value={update.priority} onChange={changeUpdate} disabled={saving}>{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <label>Nota de seguimiento<textarea name="note" value={update.note} onChange={changeUpdate} maxLength={2000} rows={4} disabled={saving} placeholder="Pruebas realizadas, resultado o motivo de reapertura" /></label>
          <p className="desk-muted">Las notas guardadas aparecen en el historial de seguimiento, debajo. Al guardar, la casilla se vacía para añadir otra nota.</p>
          <label>Resolución<textarea name="resolution" value={update.resolution} onChange={changeUpdate} maxLength={4000} minLength={update.status === 'resolved' ? 10 : undefined} required={update.status === 'resolved'} rows={4} disabled={saving} placeholder="Obligatoria para marcar como resuelta" /></label>
          <p className="desk-muted">Para cerrar, documenta una solución. Para reabrir una incidencia resuelta, añade el motivo en una nota de al menos 10 caracteres.</p><button className="primary-button" disabled={saving}>Guardar seguimiento</button>{feedback('followup')}</form></div>
          {current.context.source && <section className="notice" aria-label="Origen de la incidencia"><strong>Zaintza SOC · prueba ficticia importada</strong><p>{current.context.source.detection.id} · {current.context.source.detection.eventCount} eventos. Este archivo no acredita una detección real ni modifica su investigación.</p><details><summary>Referencias de la prueba</summary><ul>{current.context.source.detection.evidenceRefs.map(ref => <li key={ref}>{ref}</li>)}</ul></details></section>}
          <h3>Historial de seguimiento</h3><ol className="desk-activity">{current.activity.map(item => <li key={item.id}><div><strong>{ACTIVITY[item.type] || item.type}</strong><time dateTime={item.date}>{when(item.date)}</time></div><p>{['status', 'reopened'].includes(item.type) ? item.detail.split(' → ').map(value => STATUS[value] || value).join(' → ') : item.type === 'priority' ? item.detail.split(' → ').map(value => PRIORITY[value] || value).join(' → ') : item.detail}</p><small>Registrado por: {item.actor}</small></li>)}</ol>
        </> : <p className="empty">{selectedId ? 'Cargando el detalle…' : 'Selecciona una incidencia de la bandeja.'}</p>}
      </section>
    </main><footer className="app-footer">Laguntza IT + Red bajo vigilancia · {client.demo ? 'Demostración sin datos reales' : 'Gestión privada de incidencias del laboratorio'}</footer>
  </div>;
}
