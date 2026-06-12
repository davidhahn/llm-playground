export default function ArrayField({
  label,
  items,
  complete,
}: {
  label: string;
  items: string[];
  complete: boolean;
}) {
  return (
    <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 10,
        }}
      >
        {label} ({items.length})
        {!complete && (
          <span style={{ color: '#ccc', marginLeft: 6, fontWeight: 400 }}>
            streaming...
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((item, i) => (
          <span
            key={i}
            style={{
              padding: '4px 10px',
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: 20,
              fontSize: 12,
              color: '#333',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
