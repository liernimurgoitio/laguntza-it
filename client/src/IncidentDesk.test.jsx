import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import IncidentDesk from './IncidentDesk';
import { createDemoIncidentApi } from './demoIncidentApi';
import { createIncidentApi } from './incidentApi';

afterEach(() => { window.history.replaceState(null, '', '/'); });

describe('integración de Laguntza IT', () => {
  it('abre desde un aparato de la demo sin realizar solicitudes de red', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No debería usarse'));
    window.history.replaceState(null, '', '/demo/soporte/?equipo=impresora&nombre=Impresora%20de%20pruebas');
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Aparato asociado' })).toHaveValue('impresora'));
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Revisar Impresora de pruebas');
    await user.type(screen.getByRole('textbox', { name: 'Descripción' }), 'No aparece disponible después de reiniciar la conexión.');
    await user.click(screen.getByRole('button', { name: 'Crear incidencia' }));
    await screen.findByText(/Incidencia INC-000002 creada y guardada solo en esta demo/);
    expect(fetcher).not.toHaveBeenCalled();
    const detail = screen.getByRole('region', { name: 'Detalle de la incidencia' });
    await within(detail).findByText('INC-000002 · versión 1');
    expect(within(detail).getByText('Impresora de pruebas')).toBeInTheDocument();
  });

  it('exige resolución al cerrar y motivo al reabrir', async () => {
    const user = userEvent.setup();
    render(<IncidentDesk client={createDemoIncidentApi()} />);
    const status = await screen.findByRole('combobox', { name: 'Nuevo estado' });
    await user.selectOptions(status, 'resolved');
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }));
    expect(screen.getByRole('textbox', { name: 'Resolución' })).toBeInvalid();
    await user.type(screen.getByRole('textbox', { name: 'Resolución' }), 'He comprobado la conexión y la impresora vuelve a responder.');
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }));
    await screen.findByText('INC-000001 · versión 2');
    expect(screen.getByText('Resolución', { selector: 'strong' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Nuevo estado' }), 'in_progress');
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('motivo de reapertura');
    await user.type(screen.getByRole('textbox', { name: 'Nota de seguimiento' }), 'La desconexión ha reaparecido durante la revisión posterior.');
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }));
    await screen.findByText('INC-000001 · versión 3');
    expect(screen.getByText('Reapertura', { selector: 'strong' })).toBeInTheDocument();
  });

  it('conserva la nota escrita si el servidor rechaza una versión antigua', async () => {
    const user = userEvent.setup();
    const client = createDemoIncidentApi();
    vi.spyOn(client, 'update').mockRejectedValue(new Error('La incidencia ha cambiado. Actualiza el detalle.'));
    render(<IncidentDesk client={client} />);
    const note = await screen.findByRole('textbox', { name: 'Nota de seguimiento' });
    await user.type(note, 'He comprobado el cable y quiero conservar esta nota.');
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }));
    await screen.findByRole('alert');
    expect(note).toHaveValue('He comprobado el cable y quiero conservar esta nota.');
  });

  it('un fallo del servidor real no se sustituye por incidencias ficticias', async () => {
    const client = { demo: false, context: vi.fn().mockRejectedValue(new Error('No se ha podido conectar.')), list: vi.fn() };
    render(<IncidentDesk client={client} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido conectar');
    expect(screen.getByRole('button', { name: 'Crear incidencia' })).toBeDisabled();
    expect(client.list).not.toHaveBeenCalled();
    expect(screen.queryByText('Revisar la conexión de la impresora')).not.toBeInTheDocument();
  });
});

describe('contrato de la API privada', () => {
  it('solo llama al mismo servidor y envía el token al guardar', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [], token: 'token-ficticio' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'INC-000001' }) });
    const client = createIncidentApi(fetcher);
    await client.context(); await client.create({ title: 'Prueba de integración' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/incidencias/contexto');
    expect(fetcher.mock.calls[1][0]).toBe('/api/incidencias');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Panel-Token': 'token-ficticio' } });
  });

  it('mantiene el código de conflicto para que la interfaz pueda mostrarlo', async () => {
    const client = createIncidentApi(vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Versión antigua.' }) }));
    await expect(client.update('INC-000001', { version: 1 })).rejects.toMatchObject({ status: 409, message: 'Versión antigua.' });
  });
});
