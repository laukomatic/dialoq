type StreamBarProps = {
  streamName: string;
};

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtStreamName(slug: string): string {
  const TS = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
  if (TS.test(slug)) {
    const parts = slug.split("-");
    const [, m, d, time] = parts;
    const hh = time.slice(0, 2);
    const mm = time.slice(2);
    return `${months[parseInt(m) - 1] ?? m} ${parseInt(d)}, ${hh}:${mm}`;
  }
  return slug;
}

export function StreamBar({ streamName }: StreamBarProps) {
  return (
    <div className="stream-bar">
      <span className="stream-bar-title">{fmtStreamName(streamName)}</span>
    </div>
  );
}
