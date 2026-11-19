export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function requestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}

export function createIncidentApi(fetcher = globalThis.fetch) {
  let token = '';
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetcher('/api/incidencias' + path, {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000),
        ...options,
        headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-Panel-Token': token } : {}), ...options.headers },
      });
    } catch {
      throw new ApiError('No se ha podido conectar. Conserva el formulario y comprueba el panel antes de repetir.', 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error || 'No se ha podido completar la operación.', response.status);
    if (!data || typeof data !== 'object') throw new ApiError('La respuesta del servidor no es válida.', 0);
    return data;
  }
  return {
    demo: false,
    async context() {
      const result = await request('/contexto');
      if (!Array.isArray(result.devices) || typeof result.token !== 'string') throw new ApiError('Actualiza el panel para recuperar el acceso.', 0);
      token = result.token;
      return result;
    },
    list(params = {}) { return request('?' + new URLSearchParams(params)); },
    detail(id) { return request('/' + encodeURIComponent(id)); },
    create(data) { return request('', { method: 'POST', body: JSON.stringify(data) }); },
    update(id, data) { return request('/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(data) }); },
  };
}
