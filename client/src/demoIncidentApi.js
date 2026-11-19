import { ApiError } from './incidentApi';
import { validateExchange } from './zaintzaExchange';

const copy = value => structuredClone(value);
const normalize = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export function createDemoIncidentApi({ deviceId = '', deviceName = '', deviceState = '' } = {}) {
  const devices = [
    ['router', 'Router de ejemplo'], ['servidor', 'Servidor del laboratorio'],
    ['ordenador', 'Ordenador de ejemplo'], ['movil', 'Móvil de ejemplo'],
    ['televisor', 'Televisor de ejemplo'], ['impresora', 'Impresora de ejemplo'],
    ['tablet', 'Tablet de ejemplo'], ['pendiente', 'Equipo por identificar'],
  ].map(([id, name]) => ({ id, name, state: id === 'pendiente' ? 'sin_informacion' : id === 'impresora' || id === 'tablet' ? 'desconectado' : 'conectado', observedAt: new Date().toISOString() }));
  if (deviceName && deviceName.length <= 60 && devices.some(device => device.id === deviceId)) {
    devices.find(device => device.id === deviceId).name = deviceName;
  }
  if (['conectado', 'desconectado', 'sin_informacion', 'cambio_por_confirmar'].includes(deviceState) && devices.some(device => device.id === deviceId)) {
    devices.find(device => device.id === deviceId).state = deviceState;
  }
  const initialDate = new Date().toISOString();
  const tickets = [{ id: 'INC-000001', title: 'Revisar la conexión de la impresora',
    description: 'Ejemplo ficticio: la impresora no vuelve a aparecer conectada después de reiniciarla.',
    category: 'Red y conexión', priority: 'medium', status: 'new', deviceId: 'impresora',
    deviceName: devices.find(device => device.id === 'impresora').name,
    context: { state: 'desconectado', observedAt: initialDate }, resolution: '',
    createdAt: initialDate, updatedAt: initialDate, version: 1,
    activity: [{ id: 1, date: initialDate, type: 'created', detail: 'Incidencia ficticia creada manualmente.', actor: 'demo' }] }];
  const requests = new Map();
  let sequence = 1, activitySequence = 1;
  function find(id) {
    const ticket = tickets.find(item => item.id === id);
    if (!ticket) throw new ApiError('La incidencia no existe.', 404);
    return ticket;
  }
  return {
    demo: true,
    async context() { return { devices: copy(devices), token: 'demo-sin-servidor' }; },
    async list(params = {}) {
      const query = normalize(params.q || '');
      const filtered = tickets.filter(ticket => normalize([ticket.id, ticket.title, ticket.description, ticket.category, ticket.deviceName].join(' ')).includes(query)
        && (!params.status || params.status === 'all' || ticket.status === params.status)
        && (!params.priority || params.priority === 'all' || ticket.priority === params.priority));
      const page = Number(params.page || 1);
      return copy({ tickets: filtered.slice((page - 1) * 25, page * 25), total: filtered.length, page, pageSize: 25,
        summary: { total: tickets.length, open: tickets.filter(ticket => ticket.status !== 'resolved').length,
          high: tickets.filter(ticket => ticket.status !== 'resolved' && ticket.priority === 'high').length } });
    },
    async detail(id) { return copy(find(id)); },
    async importZaintza(data) {
      if (data.confirmDemo !== true || data.deviceId || data.category !== 'Acceso y cuentas') throw new ApiError('Revisa y confirma la prueba ficticia, sin aparato asociado.', 400);
      const source = validateExchange(data.source);
      const previous = tickets.find(ticket => ticket.context.source?.detection.id === source.detection.id && ticket.context.source.sourceInstanceId === source.sourceInstanceId);
      if (previous) {
        if (JSON.stringify(previous.context.source) !== JSON.stringify(source)) throw new ApiError('La referencia ya existe con otras evidencias.', 409);
        return { ...copy(previous), importReused: true };
      }
      const result = await this.create(data);
      const ticket = find(result.id); ticket.context.source = copy(source);
      ticket.activity.unshift({ id: ++activitySequence, date: ticket.createdAt, type: 'source', detail: 'Importación manual de prueba ficticia: ' + source.detection.id, actor: 'demo' });
      return { ...copy(ticket), importReused: false };
    },
    async create(data) {
      const payload = JSON.stringify(data);
      if (requests.has(data.requestId)) {
        const previous = requests.get(data.requestId);
        if (previous.payload !== payload) throw new ApiError('Esta solicitud ya contiene otros datos.', 409);
        return copy(find(previous.id));
      }
      if (data.title.trim().length < 5 || data.description.trim().length < 10) throw new ApiError('Completa el título y la descripción.', 400);
      const device = devices.find(item => item.id === data.deviceId);
      if (data.deviceId && !device) throw new ApiError('El aparato de ejemplo no existe.', 400);
      const date = new Date().toISOString();
      const ticket = { id: 'INC-' + String(++sequence).padStart(6, '0'), title: data.title.trim(), description: data.description.trim(),
        category: data.category, priority: data.priority, status: 'new', deviceId: device?.id || null, deviceName: device?.name || null,
        context: device ? { state: device.state, observedAt: device.observedAt } : {}, resolution: '',
        createdAt: date, updatedAt: date, version: 1,
        activity: [{ id: ++activitySequence, date, type: 'created', detail: 'Incidencia creada manualmente en la demo.', actor: 'demo' }] };
      tickets.unshift(ticket); requests.set(data.requestId, { id: ticket.id, payload });
      return copy(ticket);
    },
    async update(id, data) {
      const ticket = find(id);
      if (ticket.version !== data.version) throw new ApiError('La incidencia ha cambiado. Actualiza el detalle.', 409);
      if (!['new', 'in_progress', 'waiting', 'resolved'].includes(data.status) || !['low', 'medium', 'high'].includes(data.priority)) throw new ApiError('Estado o prioridad no válidos.', 400);
      const resolution = data.resolution.trim(), note = data.note.trim();
      if (data.status === 'resolved' && resolution.length < 10) throw new ApiError('Describe la solución con al menos 10 caracteres para cerrar la incidencia.', 400);
      const reopened = ticket.status === 'resolved' && data.status !== 'resolved';
      if (reopened && note.length < 10) throw new ApiError('Explica el motivo de reapertura con al menos 10 caracteres.', 400);
      const changes = [];
      if (ticket.status !== data.status) changes.push([reopened ? 'reopened' : 'status', ticket.status + ' → ' + data.status]);
      if (ticket.priority !== data.priority) changes.push(['priority', ticket.priority + ' → ' + data.priority]);
      if (resolution && resolution !== ticket.resolution && !reopened) changes.push(['resolution', resolution]);
      if (note) changes.push(['note', note]);
      if (!changes.length) return copy(ticket);
      const date = new Date().toISOString();
      Object.assign(ticket, { status: data.status, priority: data.priority, resolution: reopened ? '' : resolution,
        version: ticket.version + 1, updatedAt: date });
      for (const [type, detail] of changes) ticket.activity.unshift({ id: ++activitySequence, date, type, detail, actor: 'demo' });
      return copy(ticket);
    },
  };
}
