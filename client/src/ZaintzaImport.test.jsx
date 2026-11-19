import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IncidentDesk from './IncidentDesk';
import ZaintzaImport from './ZaintzaImport';
import fixture from './fixtures/zaintza-demo-v1.json';
import { createDemoIncidentApi } from './demoIncidentApi';
import { createIncidentApi } from './incidentApi';
import { validateExchange, exchangeDraft } from './zaintzaExchange';

const file = data => new File([JSON.stringify(data)], 'zaintza-demo.json', { type: 'application/json' });

describe('intercambio revisable de Zaintza', () => {
  it('leer el archivo no crea nada y requiere confirmación antes de preparar el formulario', async () => {
    const user = userEvent.setup(), prepare = vi.fn();
    render(<ZaintzaImport onPrepare={prepare} disabled={false} />);
    await user.upload(screen.getByLabelText('Archivo JSON de Zaintza'), file(fixture));
    const button = await screen.findByRole('button', { name: 'Usar esta prueba en el formulario' });
    expect(button).toBeDisabled(); expect(prepare).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /He revisado los datos/ }));
    await user.click(button);
    expect(prepare).toHaveBeenCalledWith(validateExchange(fixture));
  });

  it('rechaza tamaño, JSON inválido y campos reales y descarta la revisión anterior', async () => {
    const user = userEvent.setup(), prepare = vi.fn();
    render(<ZaintzaImport onPrepare={prepare} disabled={false} />);
    const input = screen.getByLabelText('Archivo JSON de Zaintza');
    await user.upload(input, file(fixture)); await screen.findByRole('button', { name: 'Usar esta prueba en el formulario' });
    await user.upload(input, new File(['x'.repeat(16385)], 'grande.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('16 KiB');
    expect(screen.queryByRole('button', { name: 'Usar esta prueba en el formulario' })).not.toBeInTheDocument();
    await user.upload(input, new File(['{'], 'mal.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('JSON válido'));
    await user.upload(input, file({ ...fixture, environment: 'real' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no válido'));
    expect(prepare).not.toHaveBeenCalled();
  });

  it('importa, conserva la referencia, permite seguimiento y no duplica al repetir', async () => {
    const user = userEvent.setup(), client = createDemoIncidentApi();
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No debe consultar un servidor'));
    render(<IncidentDesk client={client} />);
    await waitFor(() => expect(screen.getByLabelText('Archivo JSON de Zaintza')).toBeEnabled());
    async function prepare() {
      await user.upload(screen.getByLabelText('Archivo JSON de Zaintza'), file(fixture));
      await screen.findByRole('button', { name: 'Usar esta prueba en el formulario' });
      const ack = screen.getByRole('checkbox', { name: /He revisado los datos/ });
      if (!ack.checked) await user.click(ack);
      await user.click(screen.getByRole('button', { name: 'Usar esta prueba en el formulario' }));
    }
    await prepare();
    expect(screen.getByRole('combobox', { name: 'Aparato asociado' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Crear incidencia' }));
    await screen.findByText(/Incidencia INC-000002 creada/);
    const detail = screen.getByRole('region', { name: 'Detalle de la incidencia' });
    await within(detail).findByText('Zaintza SOC · prueba ficticia importada');
    await user.type(screen.getByRole('textbox', { name: 'Nota de seguimiento' }), 'He revisado el escenario ficticio.');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Nuevo estado' }), 'resolved');
    await user.type(screen.getByRole('textbox', { name: 'Resolución' }), 'He completado la prueba de intercambio sin una incidencia real.');
    await user.click(screen.getByRole('button', { name: 'Guardar seguimiento' }));
    await screen.findByText('INC-000002 · versión 2');
    await prepare();
    await user.click(screen.getByRole('button', { name: 'Crear incidencia' }));
    await screen.findByText(/La prueba ya está registrada en INC-000002/);
    const stored = await client.detail('INC-000002');
    expect(stored.status).toBe('resolved'); expect(stored.version).toBe(2);
    expect(stored.context.source).toEqual(validateExchange(fixture));
    expect((await client.list()).total).toBe(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it('no admite versiones, campos extra ni referencias repetidas en el contrato', () => {
    for (const value of [{ ...fixture, version: 2 }, { ...fixture, username: 'no-permitido' },
      { ...fixture, detection: { ...fixture.detection, evidenceRefs: Array(fixture.detection.eventCount).fill('DEMO-4625-1001') } }]) {
      expect(() => validateExchange(value)).toThrow(/no válido/);
    }
  });

  it('la API de importación mantiene el mismo servidor y su token', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [], token: 'token-ficticio' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'INC-000001', importReused: false }) });
    const client = createIncidentApi(fetcher); await client.context();
    await client.importZaintza({ ...exchangeDraft(fixture), source: fixture, confirmDemo: true, requestId: 'a'.repeat(32) });
    expect(fetcher.mock.calls[1][0]).toBe('/api/incidencias/importar-zaintza');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'X-Panel-Token': 'token-ficticio' } });
  });
});
