export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">Social Media OS</div>
        {children}
      </div>
    </div>
  );
}
