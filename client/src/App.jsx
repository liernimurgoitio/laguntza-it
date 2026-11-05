import { useState } from "react";
import "./App.css";

const STATUS_LABELS = {
  new: "Nueva",
  in_progress: "En curso",
  waiting: "Pendiente del usuario",
  resolved: "Resuelta",
};

const PRIORITY_LABELS = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const CATEGORIES = [
  "Acceso y cuentas",
  "Aplicaciones",
  "Equipos",
  "Red y conexión",
  "Otros",
];

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "Aplicaciones",
  priority: "medium",
};

const INITIAL_TICKETS = [
  {
    id: "DEMO-001",
    title: "No puedo acceder a la aplicación",
    description:
      "Al introducir las credenciales aparece un mensaje de acceso denegado.",
    category: "Acceso y cuentas",
    priority: "high",
    status: "new",
    createdAt: "2026-10-22T08:30:00Z",
  },
  {
    id: "DEMO-002",
    title: "La impresora no aparece disponible",
    description:
      "El equipo de ejemplo no muestra la impresora en la lista de dispositivos.",
    category: "Equipos",
    priority: "medium",
    status: "in_progress",
    createdAt: "2026-10-22T09:00:00Z",
  },
];

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
});

export default function App() {
  const [tickets, setTickets] = useState(INITIAL_TICKETS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("DEMO-001");
  const [message, setMessage] = useState("");

  const query = search.trim().toLocaleLowerCase("es");

  const filteredTickets = tickets.filter((ticket) => {
    const searchable =
      `${ticket.id} ${ticket.title} ${ticket.category}`
        .toLocaleLowerCase("es");

    return (
      searchable.includes(query) &&
      (statusFilter === "all" || ticket.status === statusFilter)
    );
  });

  const selectedTicket = filteredTickets.find(
    (ticket) => ticket.id === selectedId
  );

  const openCount = tickets.filter(
    (ticket) => ticket.status !== "resolved"
  ).length;

  const highPriorityCount = tickets.filter(
    (ticket) =>
      ticket.priority === "high" && ticket.status !== "resolved"
  ).length;

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function createTicket(event) {
    event.preventDefault();

    const title = form.title.trim();
    const description = form.description.trim();

    if (title.length < 5 || description.length < 10) {
      setMessage(
        "Escribe un título de al menos 5 caracteres y una descripción de al menos 10."
      );
      return;
    }

    const ticket = {
      id: `LOCAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      title,
      description,
      category: form.category,
      priority: form.priority,
      status: "new",
      createdAt: new Date().toISOString(),
    };

    setTickets((previous) => [ticket, ...previous]);
    setSelectedId(ticket.id);
    setForm({ ...EMPTY_FORM });
    setSearch("");
    setStatusFilter("all");
    setMessage(`Incidencia ${ticket.id} creada.`);
  }

  function updateStatus(event) {
    if (!selectedTicket) return;

    const nextStatus = event.target.value;

    if (!Object.hasOwn(STATUS_LABELS, nextStatus)) return;

    setTickets((previous) =>
      previous.map((ticket) =>
        ticket.id === selectedTicket.id
          ? { ...ticket, status: nextStatus }
          : ticket
      )
    );

    setMessage(`Estado de ${selectedTicket.id} actualizado.`);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Gestión de soporte</p>
          <h1>Laguntza IT</h1>
          <p className="subtitle">
            Registra incidencias, organiza el trabajo y documenta soluciones.
          </p>
        </div>

        <span className="environment">Prototipo local</span>
      </header>

      <main>
        <p className="notice">
          Entorno de aprendizaje con datos ficticios. Los cambios de esta
          primera versión se borran al recargar.
        </p>

        <section className="metrics" aria-label="Resumen de incidencias">
          <article className="metric">
            <span>Total</span>
            <strong>{tickets.length}</strong>
          </article>

          <article className="metric">
            <span>Abiertas</span>
            <strong>{openCount}</strong>
          </article>

          <article className="metric">
            <span>Prioridad alta · abiertas</span>
            <strong>{highPriorityCount}</strong>
          </article>
        </section>

        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}

        <div className="workspace">
          <section className="panel" aria-labelledby="create-title">
            <div className="panel-heading">
              <h2 id="create-title">Nueva incidencia</h2>
              <p>Describe el problema para facilitar su revisión.</p>
            </div>

            <form className="ticket-form" onSubmit={createTicket}>
              <label>
                Título
                <input
                  name="title"
                  value={form.title}
                  onChange={updateForm}
                  minLength={5}
                  maxLength={120}
                  placeholder="Ej.: No puedo iniciar sesión"
                  required
                />
              </label>

              <label>
                Descripción
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateForm}
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                  placeholder="¿Qué ocurre y qué pasos has probado?"
                  required
                />
              </label>

              <div className="form-row">
                <label>
                  Categoría
                  <select
                    name="category"
                    value={form.category}
                    onChange={updateForm}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Prioridad
                  <select
                    name="priority"
                    value={form.priority}
                    onChange={updateForm}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button className="primary-button" type="submit">
                Crear incidencia
              </button>
            </form>
          </section>

          <section className="panel" aria-labelledby="list-title">
            <div className="panel-heading">
              <h2 id="list-title">Bandeja de incidencias</h2>
              <p>
                {filteredTickets.length} de {tickets.length} incidencias
              </p>
            </div>

            <div className="filters">
              <label>
                Buscar
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Título, identificador o categoría"
                />
              </label>

              <label>
                Estado
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Todos</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ul className="ticket-list">
              {filteredTickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className={`ticket-item ${
                      selectedId === ticket.id ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedId(ticket.id)}
                    aria-pressed={selectedId === ticket.id}
                    aria-controls="ticket-detail"
                  >
                    <span className="ticket-top">
                      <span className="ticket-id">{ticket.id}</span>
                      <span className={`badge priority-${ticket.priority}`}>
                        {PRIORITY_LABELS[ticket.priority]}
                      </span>
                    </span>

                    <strong>{ticket.title}</strong>

                    <span className="ticket-bottom">
                      <span>{ticket.category}</span>
                      <span>{STATUS_LABELS[ticket.status]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {filteredTickets.length === 0 && (
              <p className="empty">No hay incidencias que coincidan.</p>
            )}
          </section>
        </div>

        <section
          id="ticket-detail"
          className="panel detail"
          aria-labelledby="detail-title"
        >
          <div className="panel-heading">
            <h2 id="detail-title">Detalle de la incidencia</h2>
          </div>

          {selectedTicket ? (
            <div className="detail-content">
              <div>
                <p className="ticket-id">{selectedTicket.id}</p>
                <h3>{selectedTicket.title}</h3>
                <p className="description">
                  {selectedTicket.description}
                </p>
              </div>

              <div className="detail-meta">
                <p>
                  <strong>Categoría:</strong> {selectedTicket.category}
                </p>
                <p>
                  <strong>Prioridad:</strong>{" "}
                  {PRIORITY_LABELS[selectedTicket.priority]}
                </p>
                <p>
                  <strong>Creada:</strong>{" "}
                  <time dateTime={selectedTicket.createdAt}>
                    {dateFormatter.format(new Date(selectedTicket.createdAt))}
                  </time>
                </p>

                <label>
                  Estado
                  <select
                    value={selectedTicket.status}
                    onChange={updateStatus}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <p className="empty">
              Selecciona una incidencia de la bandeja para ver su detalle.
            </p>
          )}
        </section>
      </main>

      <footer className="app-footer">
        Laguntza IT · Proyecto de Lierni Murgoitio
      </footer>
    </div>
  );
}