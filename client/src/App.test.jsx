import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

function setup() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}

const titleField = () => screen.getByRole("textbox", { name: "Título" });
const descriptionField = () =>
  screen.getByRole("textbox", { name: "Descripción" });
const createButton = () =>
  screen.getByRole("button", { name: "Crear incidencia" });
const inbox = () =>
  screen.getByRole("region", { name: "Bandeja de incidencias" });
const detail = () =>
  screen.getByRole("region", { name: "Detalle de la incidencia" });
const ticketButtons = () => within(inbox()).queryAllByRole("button");

async function fillAndSubmit(user, title, description) {
  await user.type(titleField(), title);
  await user.type(descriptionField(), description);
  await user.click(createButton());
}

describe("resumen inicial", () => {
  it("muestra las incidencias de ejemplo y sus métricas", () => {
    setup();

    expect(ticketButtons()).toHaveLength(2);

    const metrics = within(
      screen.getByRole("region", { name: "Resumen de incidencias" })
    );
    expect(metrics.getByText("Total").nextSibling).toHaveTextContent("2");
    expect(metrics.getByText("Abiertas").nextSibling).toHaveTextContent("2");
    expect(
      metrics.getByText("Prioridad alta · abiertas").nextSibling
    ).toHaveTextContent("1");
  });
});

describe("crear incidencias", () => {
  it("añade la incidencia, la selecciona y vacía el formulario", async () => {
    const { user } = setup();

    await fillAndSubmit(user, "  Sin conexión  ", "La red no responde hoy.");

    expect(ticketButtons()).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Incidencia LOCAL-[0-9A-F]{8} creada\.$/
    );
    expect(
      within(detail()).getByRole("heading", { name: "Sin conexión" })
    ).toBeInTheDocument();
    expect(titleField()).toHaveValue("");
    expect(descriptionField()).toHaveValue("");
  });

  it("funciona aunque crypto.randomUUID no esté disponible", async () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new TypeError("crypto.randomUUID is not a function");
    });
    const { user } = setup();

    await fillAndSubmit(user, "Sin conexión", "La red no responde hoy.");

    expect(ticketButtons()).toHaveLength(3);
  });
});

describe("validar el formulario", () => {
  it("rechaza un título en blanco y lo señala como erróneo", async () => {
    const { user } = setup();

    await fillAndSubmit(user, "        ", "La red no responde hoy.");

    expect(screen.getByRole("alert")).toHaveTextContent(/al menos 5/);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(ticketButtons()).toHaveLength(2);
    expect(titleField()).toHaveAttribute("aria-invalid", "true");
    expect(titleField()).toHaveAccessibleDescription(/al menos 5/);
    expect(titleField()).toHaveFocus();
    expect(descriptionField()).toHaveAttribute("aria-invalid", "false");
  });

  it("señala la descripción si es el único campo erróneo", async () => {
    const { user } = setup();

    await fillAndSubmit(user, "Sin conexión", "            ");

    expect(descriptionField()).toHaveAttribute("aria-invalid", "true");
    expect(descriptionField()).toHaveFocus();
    expect(titleField()).toHaveAttribute("aria-invalid", "false");
  });

  it("retira el error al editar el campo", async () => {
    const { user } = setup();

    await fillAndSubmit(user, "        ", "La red no responde hoy.");
    await user.type(titleField(), "a");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(titleField()).toHaveAttribute("aria-invalid", "false");
  });
});

describe("filtrar la bandeja", () => {
  it("busca por título sin distinguir mayúsculas", async () => {
    const { user } = setup();

    await user.type(screen.getByRole("searchbox"), "IMPRESORA");

    expect(ticketButtons()).toHaveLength(1);
    expect(ticketButtons()[0]).toHaveTextContent("DEMO-002");
  });

  it("filtra por estado", async () => {
    const { user } = setup();

    await user.selectOptions(
      within(inbox()).getByRole("combobox", { name: "Estado" }),
      "in_progress"
    );

    expect(ticketButtons()).toHaveLength(1);
    expect(ticketButtons()[0]).toHaveTextContent("DEMO-002");
  });

  it("avisa cuando ninguna incidencia coincide", async () => {
    const { user } = setup();

    await user.type(screen.getByRole("searchbox"), "no existe");

    expect(ticketButtons()).toHaveLength(0);
    expect(
      screen.getByText("No hay incidencias que coincidan.")
    ).toBeInTheDocument();
  });
});

describe("gestionar el detalle", () => {
  it("muestra la incidencia seleccionada", async () => {
    const { user } = setup();

    await user.click(ticketButtons()[1]);

    expect(ticketButtons()[1]).toHaveAttribute("aria-pressed", "true");
    expect(within(detail()).getByText("DEMO-002")).toBeInTheDocument();
  });

  it("actualiza las métricas al resolver una incidencia", async () => {
    const { user } = setup();

    await user.selectOptions(
      within(detail()).getByRole("combobox", { name: "Estado" }),
      "resolved"
    );

    const metrics = within(
      screen.getByRole("region", { name: "Resumen de incidencias" })
    );
    expect(metrics.getByText("Abiertas").nextSibling).toHaveTextContent("1");
    expect(
      metrics.getByText("Prioridad alta · abiertas").nextSibling
    ).toHaveTextContent("0");
  });

  it("mantiene el detalle aunque el filtro oculte la incidencia", async () => {
    const { user } = setup();

    await user.selectOptions(
      within(inbox()).getByRole("combobox", { name: "Estado" }),
      "new"
    );
    await user.selectOptions(
      within(detail()).getByRole("combobox", { name: "Estado" }),
      "in_progress"
    );

    expect(ticketButtons()).toHaveLength(0);
    expect(within(detail()).getByText("DEMO-001")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Estado de DEMO-001 actualizado."
    );
  });

  it("retira la confirmación al seleccionar otra incidencia", async () => {
    const { user } = setup();

    await user.selectOptions(
      within(detail()).getByRole("combobox", { name: "Estado" }),
      "waiting"
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(ticketButtons()[1]);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
