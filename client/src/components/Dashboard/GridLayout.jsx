export default function GridLayout({ children }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 px-4 py-4">
      {children}
    </div>
  );
}
