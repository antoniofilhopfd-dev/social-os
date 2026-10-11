export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className="auth-wrap">
      <div className="auth-card">
        <div className="brand">Social Media OS</div>
        {children}
      </div>
    </main>
  );
}
