export default function Field({
  label,
  value,
  complete,
  multiline,
}: {
  label: string;
  value?: string;
  complete: boolean;
  multiline?: boolean;
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
          marginBottom: 6,
        }}
      >
        {label}
        {!complete && value && (
          <span style={{ color: '#ccc', marginLeft: 6, fontWeight: 400 }}>
            streaming...
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 14,
          color: value ? '#111' : '#ccc',
          lineHeight: multiline ? 1.6 : 'normal',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}
