const tasks = [
  { task: "Sand top coat", job: "Blair York — table and bench", stripe: "#0c7c7a" },
  { task: "Engrave small and large", job: "Samples", stripe: "#c8a96e" },
  { task: "Sand and coat", job: "Clear beech and totara", stripe: "#7a6a8f" },
];

function formatDate() {
  const d = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export default function TodayPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            Today
          </span>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            {formatDate()}
          </span>
        </div>

        {/* Heading */}
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--text-main)",
          marginBottom: 28,
        }}>
          Dylan&apos;s tasks
        </h1>

        {/* Task cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t) => (
            <div
              key={t.task}
              style={{
                background: "var(--bg-surface)",
                borderRadius: 12,
                borderLeft: `3px solid ${t.stripe}`,
                padding: "14px 16px",
                boxShadow: "var(--shadow-rest)",
              }}
            >
              <p style={{
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.3,
                color: "var(--text-main)",
              }}>
                {t.task}
              </p>
              <p style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}>
                {t.job}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
