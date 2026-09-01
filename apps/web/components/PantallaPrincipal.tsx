export default function PantallaPrincipal({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sin JS: `.pantalla-principal` es `position:fixed; inset:0` (globals.css).
  // Deriva su tamaño del mismo viewport que ya usa .splash-pwa, así que
  // ambos coinciden por construcción, no por una cuenta que tenga que
  // calzar. Ya no es componente de cliente: no necesita estado ni efectos.
  return (
    <main className="pantalla-principal flex flex-col lg:flex-row">
      {children}
    </main>
  );
}
