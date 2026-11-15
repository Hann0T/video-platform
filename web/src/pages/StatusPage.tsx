import { Link } from "react-router-dom";

export function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <main className="card narrow center">
      <h1>{title}</h1>
      <p className="muted">{message}</p>
      <Link to="/">Go home</Link>
    </main>
  );
}
